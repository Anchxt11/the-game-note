import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Key, Copy, Check, X, ShieldAlert, Laptop, ArrowRight, Camera, CameraOff, Upload, RefreshCw } from 'lucide-react';
import { syncService, StartPairingResponse } from '../services/ipc';

interface PairingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPairingComplete?: () => void;
}

export const PairingDialog: React.FC<PairingDialogProps> = ({
  isOpen,
  onClose,
  onPairingComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'show' | 'enter'>('show');
  const [pairingData, setPairingData] = useState<StartPairingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [pairingInProgress, setPairingInProgress] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanIntervalRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  useEffect(() => {
    if (isOpen && activeTab === 'show') {
      loadPairingData();
    }
    if (!isOpen) {
      setInputCode('');
      setError(null);
      setCameraError(null);
      stopScanning();
    }
    return () => {
      stopScanning();
    };
  }, [isOpen, activeTab]);

  const loadPairingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await syncService.startPairing();
      setPairingData(data);
    } catch (err: any) {
      setError(err?.toString() || 'Failed to initialize pairing');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!pairingData) return;
    navigator.clipboard.writeText(pairingData.pairing_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyRecovery = () => {
    if (!pairingData) return;
    navigator.clipboard.writeText(pairingData.recovery_code);
    setCopiedRecovery(true);
    setTimeout(() => setCopiedRecovery(false), 2000);
  };

  const handleCompleteWithCode = async (code: string) => {
    if (!code.trim()) return;
    setPairingInProgress(true);
    setError(null);
    try {
      await syncService.completePairing(code.trim());
      if (onPairingComplete) onPairingComplete();
      onClose();
    } catch (err: any) {
      setError(err?.toString() || 'Invalid pairing code');
    } finally {
      setPairingInProgress(false);
    }
  };

  const handleCompletePairing = async () => {
    await handleCompleteWithCode(inputCode);
  };

  const startScanning = async () => {
    setCameraError(null);
    setIsScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        scanIntervalRef.current = setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                const code = barcodes[0].rawValue;
                setInputCode(code);
                stopScanning();
                await handleCompleteWithCode(code);
              }
            } catch (_) {}
          }
        }, 200);
      } else {
        setCameraError('In-app QR camera detection not supported by your WebView. You can scan the QR code using your phone camera app or Google Lens, and paste the code below.');
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(err?.message || 'Camera permission denied or camera unavailable.');
      stopScanning();
    }
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if ('BarcodeDetector' in window) {
      try {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode();
        const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await barcodeDetector.detect(img);
        if (barcodes.length > 0 && barcodes[0].rawValue) {
          const code = barcodes[0].rawValue;
          setInputCode(code);
          await handleCompleteWithCode(code);
        } else {
          setError('No QR code detected in the selected image.');
        }
      } catch (err: any) {
        setError('Failed to scan image: ' + err?.message);
      }
    } else {
      setError('Barcode detector is not supported by your WebView.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="pairing-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="pairing-modal"
        style={{
          width: '100%',
          maxWidth: '480px',
          background: '#18181b',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#f8fafc',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Laptop size={18} color="#38bdf8" />
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Device Pairing & Sync</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <button
            onClick={() => setActiveTab('show')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'show' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'show' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'show' ? '#f8fafc' : '#94a3b8',
              fontWeight: 500,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <QrCode size={15} />
            <span>Show QR / Code</span>
          </button>

          <button
            onClick={() => setActiveTab('enter')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'enter' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'enter' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'enter' ? '#f8fafc' : '#94a3b8',
              fontWeight: 500,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Key size={15} />
            <span>Enter Code</span>
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                color: '#fca5a5',
              }}
            >
              {error}
            </div>
          )}

          {activeTab === 'show' ? (
            <>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '13px' }}>
                  Generating secure pairing payload...
                </div>
              ) : pairingData ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                  {/* QR Code Container */}
                  <div
                    style={{
                      background: '#ffffff',
                      padding: '12px',
                      borderRadius: '12px',
                      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '200px',
                      height: '200px',
                    }}
                    dangerouslySetInnerHTML={{ __html: pairingData.qr_svg }}
                  />

                  <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                    Scan this QR code with the Milanote app on your tablet or phone.
                  </p>

                  {/* Text code copy block */}
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#cbd5e1' }}>Pairing Code</span>
                      <button
                        onClick={handleCopyCode}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: copiedCode ? '#4ade80' : '#38bdf8',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#94a3b8',
                        overflowX: 'auto',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pairingData.pairing_code}
                    </div>
                  </div>

                  {/* Recovery Code */}
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#cbd5e1' }}>Recovery Code</span>
                      <button
                        onClick={handleCopyRecovery}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: copiedRecovery ? '#4ade80' : '#38bdf8',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedRecovery ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copiedRecovery ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#e2e8f0',
                        letterSpacing: '1px',
                        textAlign: 'center',
                      }}
                    >
                      {pairingData.recovery_code}
                    </div>
                  </div>

                  {/* Security disclaimer */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      background: 'rgba(234, 179, 8, 0.1)',
                      border: '1px solid rgba(234, 179, 8, 0.25)',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontSize: '11px',
                      color: '#fef08a',
                      alignItems: 'center',
                    }}
                  >
                    <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                    <span>Keep this code private. It grants end-to-end encrypted sync access to your notes.</span>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            /* Enter code tab */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Option 1: Camera Scanner */}
              {isScanning ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '240px',
                      background: '#000000',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #38bdf8',
                    }}
                  >
                    <video
                      ref={videoRef}
                      playsInline
                      autoPlay
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: '25px',
                        border: '2px dashed rgba(56, 189, 248, 0.8)',
                        borderRadius: '10px',
                        pointerEvents: 'none',
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        background: 'rgba(0,0,0,0.7)',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        color: '#38bdf8',
                      }}
                    >
                      Point camera at the QR code
                    </div>
                  </div>

                  <button
                    onClick={stopScanning}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <CameraOff size={15} />
                    <span>Cancel Camera Scan</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    onClick={startScanning}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                    }}
                  >
                    <Camera size={18} />
                    <span>Scan QR with Camera</span>
                  </button>

                  {cameraError && (
                    <div
                      style={{
                        background: 'rgba(234, 179, 8, 0.12)',
                        border: '1px solid rgba(234, 179, 8, 0.3)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontSize: '11px',
                        color: '#fef08a',
                        lineHeight: '1.4',
                      }}
                    >
                      {cameraError}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
                    <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>or paste pairing code</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
                  </div>
                </div>
              )}

              {/* Textarea code input */}
              <textarea
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Paste pairing code or recovery code here..."
                rows={3}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '10px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  resize: 'none',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileScan}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Scan from photo or gallery"
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#cbd5e1',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={14} />
                  <span>Image file</span>
                </button>

                <button
                  onClick={handleCompletePairing}
                  disabled={pairingInProgress || !inputCode.trim()}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 16px',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: pairingInProgress || !inputCode.trim() ? 'not-allowed' : 'pointer',
                    opacity: pairingInProgress || !inputCode.trim() ? 0.6 : 1,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <span>{pairingInProgress ? 'Pairing & Syncing...' : 'Pair Device'}</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
