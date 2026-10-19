use base64::prelude::*;
use qrcode::render::svg;
use qrcode::QrCode;
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::crypto::KEY_SIZE;
use crate::error::{AppError, Result};

pub const PAIRING_VERSION: u32 = 1;

/// Payload encoded into the pairing QR code and pairing text code.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PairingPayload {
    pub v: u32,
    pub sync_secret: String, // hex-encoded 32-byte secret
    pub hub_hints: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub mailbox_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub hub_site_id: Option<String>,
}

/// Generates a fresh cryptographically secure 32-byte sync secret.
pub fn generate_sync_secret() -> [u8; KEY_SIZE] {
    let mut secret = [0u8; KEY_SIZE];
    rand::thread_rng().fill_bytes(&mut secret);
    secret
}

/// Serializes and base64-encodes the pairing payload into a shareable string code.
pub fn encode_pairing_code(payload: &PairingPayload) -> Result<String> {
    let json = serde_json::to_string(payload)?;
    Ok(BASE64_STANDARD.encode(json.as_bytes()))
}

/// Decodes and validates a base64 pairing string code.
pub fn decode_pairing_code(code: &str) -> Result<PairingPayload> {
    let trimmed = code.trim();
    let bytes = BASE64_STANDARD
        .decode(trimmed)
        .map_err(|e| AppError::InvalidOperation(format!("Invalid base64 pairing code: {}", e)))?;

    let payload: PairingPayload = serde_json::from_slice(&bytes)
        .map_err(|e| AppError::InvalidOperation(format!("Malformed pairing payload: {}", e)))?;

    if payload.v != PAIRING_VERSION {
        return Err(AppError::InvalidOperation(format!(
            "Unsupported pairing version: {}",
            payload.v
        )));
    }

    let secret_bytes = hex::decode(&payload.sync_secret)
        .map_err(|e| AppError::InvalidOperation(format!("Invalid sync secret hex: {}", e)))?;

    if secret_bytes.len() != KEY_SIZE {
        return Err(AppError::InvalidOperation(format!(
            "Invalid secret length: expected {} bytes, found {}",
            KEY_SIZE,
            secret_bytes.len()
        )));
    }

    Ok(payload)
}

/// Renders a pairing payload into a scalable SVG QR code string.
pub fn generate_pairing_qr_svg(payload: &PairingPayload) -> Result<String> {
    let encoded_code = encode_pairing_code(payload)?;
    let qr = QrCode::new(encoded_code.as_bytes())
        .map_err(|e| AppError::InvalidOperation(format!("Failed to generate QR code: {}", e)))?;

    let svg_xml = qr
        .render::<svg::Color>()
        .min_dimensions(240, 240)
        .dark_color(svg::Color("#ffffff"))
        .light_color(svg::Color("#1c1c1e"))
        .build();

    Ok(svg_xml)
}

/// Formats the sync secret into a human-readable recovery code:
/// 8 groups of 4 uppercase hex characters separated by hyphens (`XXXX-XXXX-XXXX-...`).
pub fn export_recovery_code(secret: &[u8; KEY_SIZE]) -> String {
    let hex_str = hex::encode(secret).to_uppercase();
    hex_str
        .as_bytes()
        .chunks(4)
        .map(|c| std::str::from_utf8(c).unwrap_or(""))
        .collect::<Vec<_>>()
        .join("-")
}

/// Parses and validates a human-readable recovery code back into a 32-byte secret.
pub fn import_recovery_code(code: &str) -> Result<[u8; KEY_SIZE]> {
    let clean = code.replace(['-', ' ', '\n', '\r', '\t'], "").to_lowercase();
    let bytes = hex::decode(&clean)
        .map_err(|e| AppError::InvalidOperation(format!("Invalid recovery code hex: {}", e)))?;

    if bytes.len() != KEY_SIZE {
        return Err(AppError::InvalidOperation(format!(
            "Invalid recovery code length: expected {} bytes, found {}",
            KEY_SIZE,
            bytes.len()
        )));
    }

    let mut secret = [0u8; KEY_SIZE];
    secret.copy_from_slice(&bytes);
    Ok(secret)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pairing_code_encode_decode_roundtrip() {
        let secret = generate_sync_secret();
        let payload = PairingPayload {
            v: PAIRING_VERSION,
            sync_secret: hex::encode(secret),
            hub_hints: vec![
                "http://192.168.1.10:8765".to_string(),
                "http://laptop.tailnet.ts.net:8765".to_string(),
            ],
            mailbox_url: Some("https://sync.example.workers.dev".to_string()),
            hub_site_id: Some("0123456789abcdef0123456789abcdef".to_string()),
        };

        let code = encode_pairing_code(&payload).unwrap();
        assert!(!code.is_empty());

        let decoded = decode_pairing_code(&code).unwrap();
        assert_eq!(payload, decoded);

        // Backwards compatibility: payload without hub_site_id should decode with hub_site_id = None
        let legacy_json = r#"{"v":1,"sync_secret":"0000000000000000000000000000000000000000000000000000000000000000","hub_hints":["http://127.0.0.1:8765"]}"#;
        let legacy_code = BASE64_STANDARD.encode(legacy_json.as_bytes());
        let legacy_decoded = decode_pairing_code(&legacy_code).unwrap();
        assert_eq!(legacy_decoded.hub_site_id, None);
    }

    #[test]
    fn test_pairing_qr_svg_generation() {
        let secret = generate_sync_secret();
        let payload = PairingPayload {
            v: PAIRING_VERSION,
            sync_secret: hex::encode(secret),
            hub_hints: vec!["http://100.64.1.2:8765".to_string()],
            mailbox_url: None,
            hub_site_id: None,
        };

        let svg = generate_pairing_qr_svg(&payload).unwrap();
        assert!(svg.starts_with("<?xml") || svg.starts_with("<svg"));
        assert!(svg.contains("</svg>"));
    }

    #[test]
    fn test_recovery_code_export_import_roundtrip() {
        let secret = generate_sync_secret();
        let code = export_recovery_code(&secret);
        assert_eq!(code.matches('-').count(), 15); // 16 chunks of 4 -> 15 hyphens

        let imported = import_recovery_code(&code).unwrap();
        assert_eq!(secret, imported);

        // Also succeeds with whitespace or lowercase
        let with_spaces = code.replace('-', " ");
        let imported_spaces = import_recovery_code(&with_spaces).unwrap();
        assert_eq!(secret, imported_spaces);
    }

    #[test]
    fn test_invalid_pairing_code_rejected() {
        assert!(decode_pairing_code("invalid-not-base64").is_err());
        let empty_json = BASE64_STANDARD.encode(b"{}");
        assert!(decode_pairing_code(&empty_json).is_err());
    }
}
