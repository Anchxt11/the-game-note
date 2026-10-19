use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::error::{AppError, Result};

pub const XCHACHA20_NONCE_SIZE: usize = 24;
pub const KEY_SIZE: usize = 32;

/// Cryptographic keys derived from the master sync secret via HKDF-SHA256.
/// All sensitive key material is automatically zeroized from memory when dropped.
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct SyncKeys {
    pub enc_key: [u8; KEY_SIZE],
    pub file_key: [u8; KEY_SIZE],
    pub auth_token: [u8; KEY_SIZE],
    pub mailbox_token: [u8; KEY_SIZE],
}

impl std::fmt::Debug for SyncKeys {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SyncKeys(***)")
    }
}

impl SyncKeys {
    /// Derives subkeys for changesets, files, hub authentication, and cloud mailbox authentication.
    pub fn derive_from_secret(secret: &[u8; KEY_SIZE]) -> Self {
        let hk = Hkdf::<Sha256>::new(None, secret);

        let mut enc_key = [0u8; KEY_SIZE];
        hk.expand(b"notes-sync/v1/encrypt", &mut enc_key)
            .expect("32 bytes is valid length for HKDF expansion");

        let mut file_key = [0u8; KEY_SIZE];
        hk.expand(b"notes-sync/v1/files", &mut file_key)
            .expect("32 bytes is valid length for HKDF expansion");

        let mut auth_token = [0u8; KEY_SIZE];
        hk.expand(b"notes-sync/v1/hub-auth", &mut auth_token)
            .expect("32 bytes is valid length for HKDF expansion");

        let mut mailbox_token = [0u8; KEY_SIZE];
        hk.expand(b"notes-sync/v1/mailbox-auth", &mut mailbox_token)
            .expect("32 bytes is valid length for HKDF expansion");

        Self {
            enc_key,
            file_key,
            auth_token,
            mailbox_token,
        }
    }

    /// Returns the bearer auth token formatted as a 64-character lowercase hex string.
    pub fn auth_token_hex(&self) -> String {
        hex::encode(self.auth_token)
    }

    /// Returns the mailbox bearer token formatted as a 64-character lowercase hex string.
    pub fn mailbox_token_hex(&self) -> String {
        hex::encode(self.mailbox_token)
    }

    /// Returns the SHA-256 hash of the mailbox token (the mailbox group identifier).
    /// The cloud mailbox stores only this hash and never sees the bearer token or sync keys.
    pub fn mailbox_group_id(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(&self.mailbox_token);
        hex::encode(hasher.finalize())
    }
}

/// Computes Authenticated Additional Data (AAD) binding metadata to the ciphertext.
/// Format: `protocol_version (4B BE) || sender_site_id || kind || key_id (4B BE)`.
pub fn compute_aad(protocol_version: u32, sender_site_id: &str, kind: &str, key_id: u32) -> Vec<u8> {
    let mut aad = Vec::new();
    aad.extend_from_slice(&protocol_version.to_be_bytes());
    aad.extend_from_slice(sender_site_id.as_bytes());
    aad.extend_from_slice(kind.as_bytes());
    aad.extend_from_slice(&key_id.to_be_bytes());
    aad
}

/// Encrypts plaintext using XChaCha20-Poly1305 AEAD with a fresh random 24-byte nonce.
/// Returns `(ciphertext, nonce)`.
pub fn encrypt_payload(
    key: &[u8; KEY_SIZE],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<(Vec<u8>, [u8; XCHACHA20_NONCE_SIZE])> {
    let mut nonce_bytes = [0u8; XCHACHA20_NONCE_SIZE];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);

    let cipher = XChaCha20Poly1305::new(key.into());
    let nonce = XNonce::from_slice(&nonce_bytes);

    let payload = Payload {
        msg: plaintext,
        aad,
    };

    let ciphertext = cipher
        .encrypt(nonce, payload)
        .map_err(|e| AppError::InvalidOperation(format!("AEAD encryption failed: {}", e)))?;

    Ok((ciphertext, nonce_bytes))
}

/// Decrypts ciphertext using XChaCha20-Poly1305 AEAD and verifies the authenticity tag against AAD.
pub fn decrypt_payload(
    key: &[u8; KEY_SIZE],
    ciphertext: &[u8],
    nonce_bytes: &[u8; XCHACHA20_NONCE_SIZE],
    aad: &[u8],
) -> Result<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let nonce = XNonce::from_slice(nonce_bytes);

    let payload = Payload {
        msg: ciphertext,
        aad,
    };

    let plaintext = cipher
        .decrypt(nonce, payload)
        .map_err(|e| AppError::InvalidOperation(format!("AEAD authentication/decryption failed: {}", e)))?;

    Ok(plaintext)
}

/// Constant-time comparison of authentication bearer tokens to prevent timing attacks.
pub fn verify_token_constant_time(expected: &str, provided: &str) -> bool {
    let expected_bytes = expected.as_bytes();
    let provided_bytes = provided.as_bytes();

    if expected_bytes.len() != provided_bytes.len() {
        return false;
    }

    expected_bytes.ct_eq(provided_bytes).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_keys_derivation() {
        let secret = [42u8; 32];
        let keys = SyncKeys::derive_from_secret(&secret);

        assert_ne!(keys.enc_key, [0u8; 32]);
        assert_ne!(keys.file_key, [0u8; 32]);
        assert_ne!(keys.auth_token, [0u8; 32]);
        assert_ne!(keys.mailbox_token, [0u8; 32]);

        // Distinct context strings produce distinct subkeys
        assert_ne!(keys.enc_key, keys.file_key);
        assert_ne!(keys.enc_key, keys.auth_token);
        assert_ne!(keys.auth_token, keys.mailbox_token);

        let group_id = keys.mailbox_group_id();
        assert_eq!(group_id.len(), 64);
    }

    #[test]
    fn test_encryption_decryption_roundtrip() {
        let secret = [15u8; 32];
        let keys = SyncKeys::derive_from_secret(&secret);
        let plaintext = b"Hello, confidential cross-device sync!";
        let aad = compute_aad(1, "0123456789abcdef0123456789abcdef", "changes", 1);

        let (ciphertext, nonce) = encrypt_payload(&keys.enc_key, plaintext, &aad).unwrap();
        assert_ne!(ciphertext, plaintext);

        let decrypted = decrypt_payload(&keys.enc_key, &ciphertext, &nonce, &aad).unwrap();
        assert_eq!(plaintext, decrypted.as_slice());
    }

    #[test]
    fn test_tampered_ciphertext_fails_authentication() {
        let secret = [15u8; 32];
        let keys = SyncKeys::derive_from_secret(&secret);
        let plaintext = b"Tamper test message";
        let aad = compute_aad(1, "site1", "changes", 1);

        let (mut ciphertext, nonce) = encrypt_payload(&keys.enc_key, plaintext, &aad).unwrap();
        // Flip one bit
        ciphertext[0] ^= 0x01;

        let res = decrypt_payload(&keys.enc_key, &ciphertext, &nonce, &aad);
        assert!(res.is_err());
    }

    #[test]
    fn test_tampered_aad_fails_authentication() {
        let secret = [15u8; 32];
        let keys = SyncKeys::derive_from_secret(&secret);
        let plaintext = b"Tamper AAD test message";
        let aad = compute_aad(1, "site1", "changes", 1);
        let tampered_aad = compute_aad(2, "site1", "changes", 1);

        let (ciphertext, nonce) = encrypt_payload(&keys.enc_key, plaintext, &aad).unwrap();

        let res = decrypt_payload(&keys.enc_key, &ciphertext, &nonce, &tampered_aad);
        assert!(res.is_err());
    }

    #[test]
    fn test_wrong_key_fails_authentication() {
        let secret1 = [1u8; 32];
        let secret2 = [2u8; 32];
        let keys1 = SyncKeys::derive_from_secret(&secret1);
        let keys2 = SyncKeys::derive_from_secret(&secret2);

        let plaintext = b"Confidential notes";
        let aad = compute_aad(1, "site1", "changes", 1);

        let (ciphertext, nonce) = encrypt_payload(&keys1.enc_key, plaintext, &aad).unwrap();

        let res = decrypt_payload(&keys2.enc_key, &ciphertext, &nonce, &aad);
        assert!(res.is_err());
    }

    #[test]
    fn test_constant_time_token_verification() {
        let expected = "6a4f91b7d83e204c8901adff78129034";
        let valid = "6a4f91b7d83e204c8901adff78129034";
        let invalid = "6a4f91b7d83e204c8901adff78129035";
        let short = "6a4f";

        assert!(verify_token_constant_time(expected, valid));
        assert!(!verify_token_constant_time(expected, invalid));
        assert!(!verify_token_constant_time(expected, short));
    }
}
