import React, { useState, useEffect } from 'react';
import {
  X,
  Laptop,
  Smartphone,
  Tablet,
  Plus,
  Trash2,
  RefreshCw,
  Cloud,
  CheckCircle,
  AlertTriangle,
  FileText,
  Key,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Wifi,
  QrCode,
  Edit2,
  Check,
  ArrowRight,
} from 'lucide-react';
import { syncService, SyncConfig, PeerConfig, SyncStatus } from '../services/ipc';
import { PairingDialog } from './PairingDialog';

interface SyncSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncApplied?: () => void;
}

export const SyncSettingsModal: React.FC<SyncSettingsModalProps> = ({ isOpen, onClose, onSyncApplied }) => {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Device name edit
  const [isEditingName, setIsEditingName] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState('');

  // Mailbox test
  const [testingMailbox, setTestingMailbox] = useState(false);
  const [mailboxStatus, setMailboxStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  } | null>(null);

  // Advanced peer form
  const [newPeerName, setNewPeerName] = useState('');
  const [newPeerSiteId, setNewPeerSiteId] = useState('');
  const [newPeerUrl, setNewPeerUrl] = useState('');
  const [newPeerKind, setNewPeerKind] = useState<'lan' | 'tailscale'>('lan');
  const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null);
  const [peerTestResult, setPeerTestResult] = useState<{ url: string; success: boolean; message: string } | null>(null);

  // Diagnostics
  const [syncLog, setSyncLog] = useState<string | null>(null);
  const [copiedLog, setCopiedLog] = useState(false);

  // Responsive mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      await syncService.clearInactivePeers().catch(() => {});
      const [c, s] = await Promise.all([syncService.getConfig(), syncService.getStatus()]);

      // Ensure default mailbox URL is set if empty
      if (c && (!c.mailbox.url || c.mailbox.url.trim() === '')) {
        c.mailbox.url = 'https://gamenote-mailbox.anchit-note.workers.dev';
        c.mailbox.enabled = true;
        await syncService.saveConfig(c).catch(() => {});
      }

      setConfig(c);
      setStatus(s);
      setDeviceNameInput(c?.device_name || 'My Device');

      // Auto-check mailbox connectivity silently in background
      if (c?.mailbox?.enabled && c?.mailbox?.url) {
        checkMailboxConnection(c.mailbox.url);
      }
    } catch (e) {
      console.error('Failed to load sync data:', e);
    } finally {
      setLoading(false);
    }
  };

  const checkMailboxConnection = async (url: string) => {
    try {
      const res = await syncService.testMailbox(url);
      setMailboxStatus({
        tested: true,
        success: true,
        message: `Connected (Seq #${res.latest_seq})`,
      });
    } catch (e: any) {
      setMailboxStatus({
        tested: true,
        success: false,
        message: e?.toString() || 'Relay unreachable',
      });
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncService.triggerSync();
      onSyncApplied?.();
      const s = await syncService.getStatus();
      setStatus(s);
      if (config?.mailbox.url) {
        await checkMailboxConnection(config.mailbox.url);
      }
    } catch (e) {
      console.error('Manual sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveConfig = async (updated: SyncConfig) => {
    try {
      await syncService.saveConfig(updated);
      setConfig(updated);
      const s = await syncService.getStatus();
      setStatus(s);
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  };

  const handleSaveDeviceName = () => {
    if (!config || !deviceNameInput.trim()) return;
    const updated = { ...config, device_name: deviceNameInput.trim() };
    handleSaveConfig(updated);
    setIsEditingName(false);
  };

  const handleTestMailboxManual = async () => {
    if (!config || !config.mailbox.url) return;
    setTestingMailbox(true);
    try {
      const res = await syncService.testMailbox(config.mailbox.url);
      setMailboxStatus({
        tested: true,
        success: true,
        message: `Connected! Seq: #${res.latest_seq}, Registered: ${res.devices_count} devices`,
      });
    } catch (e: any) {
      setMailboxStatus({
        tested: true,
        success: false,
        message: e?.toString() || 'Connection failed',
      });
    } finally {
      setTestingMailbox(false);
    }
  };

  const handleAddPeerManual = () => {
    if (!config || !newPeerName.trim() || !newPeerUrl.trim()) return;
    const newPeer: PeerConfig = {
      site_id: newPeerSiteId.trim() || `peer-${Date.now()}`,
      name: newPeerName.trim(),
      endpoints: [{ kind: newPeerKind, url: newPeerUrl.trim() }],
    };
    const updated = {
      ...config,
      peers: [...config.peers, newPeer],
    };
    handleSaveConfig(updated);
    setNewPeerName('');
    setNewPeerSiteId('');
    setNewPeerUrl('');
  };

  const formatLastSynced = (timestamp: number | null | undefined) => {
    if (!timestamp) return 'Never';
    const elapsedSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (elapsedSeconds < 10) return 'Just now';
    if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    return `${elapsedHours}h ago`;
  };

  if (!isOpen) return null;

  // Filter actual remote peers (exclude mailbox synthetic peer & deduplicate by peer_id)
  const seenPeerIds = new Set<string>();
  const remotePeers = (status?.peers || []).filter((p) => {
    if (p.peer_id === 'mailbox' || seenPeerIds.has(p.peer_id)) {
      return false;
    }
    seenPeerIds.add(p.peer_id);
    return true;
  });
  const isCloudRelayConnected = mailboxStatus?.success || status?.active_transport === 'mailbox';

  return (
    <div className="sync-modal-backdrop" onClick={onClose}>
      <div
        className="sync-modal-window"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxSizing: 'border-box',
        }}
      >
        {/* Mobile Drag Handle */}
        {isMobile && <div className="sync-bottom-sheet-drag-handle" />}

        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMobile ? '12px 20px 10px 20px' : '18px 24px 14px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <Cloud size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                Sync &amp; Devices
              </h2>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                Simultaneous cross-device live sync
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div
          style={{
            padding: isMobile ? '16px' : '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {loading || !config ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <RefreshCw size={24} className="spin-sync-icon" style={{ margin: '0 auto 12px auto' }} />
              <div>Loading sync status...</div>
            </div>
          ) : (
            <>
              {/* 1. Live Sync Status Card */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: isSyncing
                        ? 'rgba(251, 191, 36, 0.15)'
                        : isCloudRelayConnected
                        ? 'rgba(74, 222, 128, 0.15)'
                        : 'rgba(56, 189, 248, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isSyncing ? '#fbbf24' : isCloudRelayConnected ? '#4ade80' : '#38bdf8',
                      flexShrink: 0,
                    }}
                  >
                    {isSyncing ? (
                      <RefreshCw size={20} className="spin-sync-icon" />
                    ) : isCloudRelayConnected ? (
                      <CheckCircle size={22} />
                    ) : (
                      <Cloud size={22} />
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                      {isSyncing
                        ? 'Syncing changes...'
                        : isCloudRelayConnected
                        ? 'Live Cloud Relay Active'
                        : 'Ready to Sync'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                      Last synced: {formatLastSynced(status?.last_synced_at)}
                      {status?.pending_local_changes && status.pending_local_changes > 0 ? (
                        <span style={{ color: '#fbbf24', marginLeft: '6px' }}>
                          • {status.pending_local_changes} pending
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: '8px',
                    padding: isMobile ? '8px 12px' : '8px 16px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: isSyncing ? 'not-allowed' : 'pointer',
                    opacity: isSyncing ? 0.7 : 1,
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw size={13} className={isSyncing ? 'spin-sync-icon' : ''} />
                  <span>Sync Now</span>
                </button>
              </div>

              {/* 2. Cloud Relay Section */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'rgba(56, 189, 248, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#38bdf8',
                      }}
                    >
                      <Cloud size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                        Cloud Relay Sync
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '1px' }}>
                        Simultaneous sync across mobile data and different Wi-Fi networks
                      </div>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={config.mailbox.enabled}
                    onChange={(e) => {
                      const updated = {
                        ...config,
                        mailbox: { ...config.mailbox, enabled: e.target.checked },
                      };
                      handleSaveConfig(updated);
                    }}
                    style={{
                      cursor: 'pointer',
                      width: '20px',
                      height: '20px',
                      accentColor: '#2563eb',
                    }}
                  />
                </div>

                {/* Connection Status Pill & Security */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: isCloudRelayConnected ? '#4ade80' : '#f87171',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: isCloudRelayConnected ? '#4ade80' : '#fca5a5',
                      }}
                    >
                      {mailboxStatus?.message || (config.mailbox.enabled ? 'Connected to Cloud Relay' : 'Disabled')}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '11px',
                      color: '#4ade80',
                      background: 'rgba(74, 222, 128, 0.1)',
                      padding: '3px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    <ShieldCheck size={12} />
                    <span>Zero-Knowledge E2EE</span>
                  </div>
                </div>

                {/* Test Connection Button */}
                {config.mailbox.enabled && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                    <button
                      onClick={handleTestMailboxManual}
                      disabled={testingMailbox}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        color: '#cbd5e1',
                        fontSize: '11px',
                        cursor: testingMailbox ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <RefreshCw size={11} className={testingMailbox ? 'spin-sync-icon' : ''} />
                      <span>{testingMailbox ? 'Testing...' : 'Test Cloud Connection'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Your Devices & Pairing */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                    Your Devices
                  </div>

                  <button
                    onClick={() => setIsPairingOpen(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      color: '#38bdf8',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <QrCode size={14} />
                    <span>Pair New Device</span>
                  </button>
                </div>

                {/* This Device Item */}
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {config.role === 'hub' ? (
                      <Laptop size={18} color="#38bdf8" />
                    ) : isMobile ? (
                      <Smartphone size={18} color="#38bdf8" />
                    ) : (
                      <Tablet size={18} color="#38bdf8" />
                    )}

                    {isEditingName ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="text"
                          value={deviceNameInput}
                          onChange={(e) => setDeviceNameInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveDeviceName()}
                          autoFocus
                          style={{
                            background: '#27272a',
                            border: '1px solid #3b82f6',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            color: '#fff',
                            fontSize: '12.5px',
                            outline: 'none',
                          }}
                        />
                        <button
                          onClick={handleSaveDeviceName}
                          style={{
                            background: '#2563eb',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 6px',
                            color: '#fff',
                            cursor: 'pointer',
                          }}
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                            {config.device_name}
                          </span>
                          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>(This device)</span>
                          <button
                            onClick={() => setIsEditingName(true)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#64748b',
                              cursor: 'pointer',
                              padding: '2px',
                            }}
                            title="Rename device"
                          >
                            <Edit2 size={11} />
                          </button>
                        </div>
                        <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '1px' }}>
                          {config.role === 'hub' ? 'Sync Host (Desktop)' : 'Mobile Client'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Paired Remote Devices */}
                {remotePeers.length === 0 ? (
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px dashed rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '14px',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontSize: '12px',
                    }}
                  >
                    No other devices paired yet. Click <strong>"Pair New Device"</strong> above to sync with your Android phone or tablet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {remotePeers.map((peer) => {
                      const isActive = Boolean(peer.active_transport);
                      return (
                        <div
                          key={peer.peer_id}
                          style={{
                            background: 'rgba(0, 0, 0, 0.2)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Smartphone size={18} color={isActive ? '#4ade80' : isCloudRelayConnected ? '#38bdf8' : '#94a3b8'} />
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                                {peer.name && peer.name !== 'My Device'
                                  ? peer.name
                                  : config?.role === 'hub'
                                  ? 'Mobile Device'
                                  : 'Desktop Host'}
                              </div>
                              <div style={{ fontSize: '11px', color: isActive ? '#4ade80' : isCloudRelayConnected ? '#38bdf8' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span
                                  style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: isActive ? '#4ade80' : isCloudRelayConnected ? '#38bdf8' : '#64748b',
                                  }}
                                />
                                {isActive
                                  ? `Connected (${peer.active_transport === 'lan' ? 'Direct Wi-Fi' : peer.active_transport})`
                                  : isCloudRelayConnected
                                  ? `Synced via Cloud Mailbox (${formatLastSynced(peer.last_synced_at)})`
                                  : `Last seen ${formatLastSynced(peer.last_synced_at)}`}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={async () => {
                              await syncService.forgetPeer(peer.peer_id);
                              await loadData();
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              padding: '6px',
                              opacity: 0.8,
                            }}
                            title="Unpair this device"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 4. Local Wi-Fi Sync */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(74, 222, 128, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#4ade80',
                    }}
                  >
                    <Wifi size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#f8fafc' }}>
                      Local Wi-Fi Fast Sync
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
                      Direct high-speed transfer when devices share the same Wi-Fi
                    </div>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={config.server.enabled}
                  onChange={(e) => {
                    const updated = {
                      ...config,
                      server: { ...config.server, enabled: e.target.checked },
                    };
                    handleSaveConfig(updated);
                  }}
                  style={{
                    cursor: 'pointer',
                    width: '18px',
                    height: '18px',
                    accentColor: '#2563eb',
                  }}
                />
              </div>

              {/* 5. Collapsible Advanced Network Settings (For Power Users) */}
              <div
                style={{
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: 'none',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: '#94a3b8',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <span>Advanced Network Settings</span>
                  {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showAdvanced && (
                  <div
                    style={{
                      padding: '16px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    {/* Custom Worker URL */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '12px', color: '#cbd5e1' }}>
                          Cloud Relay Endpoint URL
                        </label>
                        <button
                          onClick={() => {
                            const updated = {
                              ...config,
                              mailbox: {
                                ...config.mailbox,
                                url: 'https://gamenote-mailbox.anchit-note.workers.dev',
                              },
                            };
                            handleSaveConfig(updated);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#38bdf8',
                            fontSize: '11px',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Reset to Default
                        </button>
                      </div>
                      <input
                        type="text"
                        value={config.mailbox.url}
                        onChange={(e) => {
                          const updated = {
                            ...config,
                            mailbox: { ...config.mailbox, url: e.target.value },
                          };
                          setConfig(updated);
                        }}
                        onBlur={() => config && handleSaveConfig(config)}
                        style={{
                          width: '100%',
                          background: '#27272a',
                          border: '1px solid #3f3f46',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          color: '#f8fafc',
                          fontSize: '12px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Server Port */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                          Device Role
                        </label>
                        <select
                          value={config.role}
                          onChange={(e) => {
                            const updated = { ...config, role: e.target.value };
                            handleSaveConfig(updated);
                          }}
                          style={{
                            width: '100%',
                            background: '#27272a',
                            border: '1px solid #3f3f46',
                            borderRadius: '6px',
                            padding: '6px 8px',
                            color: '#f8fafc',
                            fontSize: '12px',
                            boxSizing: 'border-box',
                          }}
                        >
                          <option value="hub">Laptop Hub (Server + Client)</option>
                          <option value="client">Client Only (Tablet / Phone)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                          Local Server Port
                        </label>
                        <input
                          type="number"
                          value={config.server.port}
                          onChange={(e) => {
                            const updated = {
                              ...config,
                              server: { ...config.server, port: parseInt(e.target.value) || 8765 },
                            };
                            handleSaveConfig(updated);
                          }}
                          style={{
                            width: '100%',
                            background: '#27272a',
                            border: '1px solid #3f3f46',
                            borderRadius: '6px',
                            padding: '6px 8px',
                            color: '#f8fafc',
                            fontSize: '12px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>

                    {/* Add Peer Manually */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '6px' }}>
                        Add Peer Manually (Direct IP / Tailscale)
                      </label>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                        <input
                          type="text"
                          placeholder="Name (e.g. Work PC)"
                          value={newPeerName}
                          onChange={(e) => setNewPeerName(e.target.value)}
                          style={{
                            flex: 1,
                            minWidth: '120px',
                            background: '#27272a',
                            border: '1px solid #3f3f46',
                            borderRadius: '6px',
                            padding: '6px 8px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                        />
                        <input
                          type="text"
                          placeholder="http://100.x.y.z:8765"
                          value={newPeerUrl}
                          onChange={(e) => setNewPeerUrl(e.target.value)}
                          style={{
                            flex: 2,
                            minWidth: '160px',
                            background: '#27272a',
                            border: '1px solid #3f3f46',
                            borderRadius: '6px',
                            padding: '6px 8px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                        />
                        <button
                          onClick={handleAddPeerManual}
                          disabled={!newPeerName.trim() || !newPeerUrl.trim()}
                          style={{
                            background: '#2563eb',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            color: '#fff',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Diagnostics Log */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px' }}>
                      <button
                        onClick={async () => {
                          const log = await syncService.exportLog();
                          setSyncLog(log);
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          color: '#cbd5e1',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <FileText size={12} />
                        <span>View Diagnostics</span>
                      </button>

                      <button
                        onClick={async () => {
                          await syncService.clearInactivePeers();
                          await loadData();
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#94a3b8',
                          fontSize: '11px',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        Clear Inactive Devices
                      </button>
                    </div>

                    {syncLog && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Diagnostic Log</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(syncLog);
                              setCopiedLog(true);
                              setTimeout(() => setCopiedLog(false), 2000);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: copiedLog ? '#4ade80' : '#38bdf8',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            {copiedLog ? 'Copied!' : 'Copy to Clipboard'}
                          </button>
                        </div>
                        <pre
                          style={{
                            background: '#09090b',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '6px',
                            padding: '8px',
                            color: '#a1a1aa',
                            fontSize: '10.5px',
                            maxHeight: '140px',
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            margin: 0,
                          }}
                        >
                          {syncLog}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pairing Dialog Modal */}
      {isPairingOpen && (
        <PairingDialog
          isOpen={isPairingOpen}
          onClose={() => setIsPairingOpen(false)}
          onPairingComplete={() => {
            setIsPairingOpen(false);
            loadData();
          }}
        />
      )}
    </div>
  );
};
