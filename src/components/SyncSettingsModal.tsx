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
  RotateCcw,
} from 'lucide-react';
import { syncService, ipcService, SyncConfig, PeerConfig, SyncStatus, BackupInfo } from '../services/ipc';
import { PairingDialog } from './PairingDialog';
import { isPhoneScreen, isTouchPrimary } from '../utils/platform';

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

  // Database Backups
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
  const [newPeerKind, setNewPeerKind] = useState<'lan'>('lan');
  const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null);
  const [peerTestResult, setPeerTestResult] = useState<{ url: string; success: boolean; message: string } | null>(null);

  // Diagnostics
  const [syncLog, setSyncLog] = useState<string | null>(null);
  const [copiedLog, setCopiedLog] = useState(false);

  // Responsive mobile/Android detection
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640 || isPhoneScreen());

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 640 || isPhoneScreen());
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

      setConfig(c);
      setStatus(s);
      setDeviceNameInput(c?.device_name || 'My Device');

      // Auto-check mailbox connectivity silently in background
      if (c?.mailbox?.enabled && c?.mailbox?.url) {
        checkMailboxConnection(c.mailbox.url);
      }

      await loadBackups();
    } catch (e) {
      console.error('Failed to load sync data:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      setLoadingBackups(true);
      const list = await ipcService.listBackups();
      setBackups(list);
    } catch (e) {
      console.warn('Failed to list backups:', e);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      setBackupNotice(null);
      const b = await ipcService.createBackup('manual');
      await loadBackups();
      setBackupNotice({ type: 'success', message: `Created backup snapshot: ${b.filename}` });
      setTimeout(() => setBackupNotice(null), 4000);
    } catch (e: any) {
      setBackupNotice({ type: 'error', message: `Backup failed: ${e?.message || e}` });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const ok = window.confirm(
      `Restoring from "${filename}" will overwrite your current active database with this snapshot.\n\nA safety backup (.bak) of your current database will be saved automatically first.\n\nDo you want to proceed?`
    );
    if (!ok) return;

    try {
      setRestoringFilename(filename);
      setBackupNotice(null);
      await ipcService.restoreBackup(filename);
      setBackupNotice({ type: 'success', message: 'Restored successfully! Safety backup preserved.' });
      await loadBackups();
      onSyncApplied?.();
      setTimeout(() => setBackupNotice(null), 5000);
    } catch (e: any) {
      setBackupNotice({ type: 'error', message: `Restore failed: ${e?.message || e}` });
    } finally {
      setRestoringFilename(null);
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
            flex: 1,
            minHeight: 0,
            padding: isMobile ? '16px 16px max(36px, env(safe-area-inset-bottom)) 16px' : '20px 24px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
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

                {/* Cloud Relay Endpoint URL Input (Always accessible directly in this card) */}
                <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 500 }}>
                      Cloud Relay Endpoint URL
                    </label>
                    {config.mailbox.url && (
                      <button
                        onClick={() => {
                          const updated = {
                            ...config,
                            mailbox: {
                              ...config.mailbox,
                              url: '',
                              enabled: false,
                            },
                          };
                          handleSaveConfig(updated);
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
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="https://gamenote-mailbox.<your-subdomain>.workers.dev"
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
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '5px' }}>
                    Deploy your own free worker via <code style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '4px' }}>cd mailbox &amp;&amp; npx wrangler deploy</code>
                  </div>
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

              {/* 5. Local Database Backups & Safety Snapshots */}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
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
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                        Local Database Backups
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
                        Atomic SQLite snapshots (VACUUM INTO) stored locally on this device
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleCreateBackup}
                    disabled={creatingBackup}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: '8px',
                      padding: isMobile ? '8px 14px' : '6px 12px',
                      minHeight: isMobile ? '40px' : '32px',
                      color: '#38bdf8',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: creatingBackup ? 'not-allowed' : 'pointer',
                      touchAction: 'manipulation',
                      userSelect: 'none',
                    }}
                  >
                    <Plus size={14} />
                    <span>{creatingBackup ? 'Creating Snapshot...' : 'Backup Now'}</span>
                  </button>
                </div>

                {backupNotice && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: backupNotice.type === 'success' ? 'rgba(74, 222, 128, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      border: backupNotice.type === 'success' ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                      color: backupNotice.type === 'success' ? '#4ade80' : '#f87171',
                    }}
                  >
                    {backupNotice.type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                    <span>{backupNotice.message}</span>
                  </div>
                )}

                {/* Backups List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {loadingBackups ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                      Loading snapshots...
                    </div>
                  ) : backups.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '12px', background: 'rgba(0, 0, 0, 0.15)', borderRadius: '8px' }}>
                      No manual snapshots yet. Click &quot;Backup Now&quot; to create a hot point-in-time snapshot.
                    </div>
                  ) : (
                    backups.slice(0, 6).map((b) => (
                      <div
                        key={b.filename}
                        style={{
                          background: 'rgba(0, 0, 0, 0.2)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: '8px',
                          padding: isMobile ? '10px 12px' : '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.filename}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#94a3b8', display: 'flex', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                            <span>{new Date(b.created_at * 1000).toLocaleString()}</span>
                            <span>•</span>
                            <span>{Math.round(b.size_bytes / 1024)} KB</span>
                            <span>•</span>
                            <span style={{ textTransform: 'capitalize', color: '#38bdf8' }}>{b.label}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRestoreBackup(b.filename)}
                          disabled={restoringFilename === b.filename}
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '6px',
                            padding: isMobile ? '8px 14px' : '4px 10px',
                            minHeight: isMobile ? '38px' : '28px',
                            color: '#f87171',
                            fontSize: isMobile ? '12px' : '11px',
                            fontWeight: 500,
                            cursor: restoringFilename === b.filename ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0,
                            touchAction: 'manipulation',
                            userSelect: 'none',
                          }}
                        >
                          <RotateCcw size={12} className={restoringFilename === b.filename ? 'spin-sync-icon' : ''} />
                          <span>{restoringFilename === b.filename ? 'Restoring...' : 'Restore'}</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 6. Collapsible Advanced Network Settings (For Power Users) */}
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
                        Add Peer Manually (Direct LAN IP)
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
