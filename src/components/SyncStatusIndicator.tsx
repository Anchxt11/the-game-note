import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Cloud, 
  Wifi, 
  WifiOff, 
  Settings as SettingsIcon,
  ChevronDown
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { syncService, SyncStatus } from '../services/ipc';

interface SyncStatusIndicatorProps {
  onOpenSettings: () => void;
  compact?: boolean;
  dropdownAlign?: 'left' | 'right';
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ 
  onOpenSettings, 
  compact,
  dropdownAlign = 'right' 
}) => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const fetchStatus = async () => {
    try {
      const s = await syncService.getStatus();
      setStatus(s);
    } catch (e) {
      console.error('Failed to get sync status:', e);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Poll periodically every 15s in foreground
    const interval = setInterval(fetchStatus, 15000);

    // Listen for live status events from backend
    let unlistenStatus: (() => void) | undefined;
    listen<SyncStatus>('sync-status-changed', (event) => {
      if (event.payload) {
        setStatus(event.payload);
      } else {
        fetchStatus();
      }
    }).then((unsub) => {
      unlistenStatus = unsub;
    });

    return () => {
      clearInterval(interval);
      if (unlistenStatus) unlistenStatus();
    };
  }, []);

  const handleManualSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSyncing(true);
    try {
      await syncService.clearInactivePeers().catch(() => {});
      await syncService.triggerSync();
      await fetchStatus();
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusDisplay = () => {
    if (isSyncing || status?.state === 'syncing') {
      return {
        icon: <RefreshCw size={14} className="spin-sync-icon" color="#fbbf24" />,
        text: 'Syncing...',
        color: '#fbbf24',
        type: 'syncing',
      };
    }

    if (status?.last_error) {
      return {
        icon: <AlertCircle size={14} color="#f97316" />,
        text: 'Attention needed',
        color: '#f97316',
        type: 'error',
      };
    }

    if (status?.active_transport === 'mailbox') {
      return {
        icon: <Cloud size={14} color="#38bdf8" />,
        text: 'Mailbox synced',
        color: '#38bdf8',
        type: 'mailbox',
      };
    }

    if (status?.peers && status.peers.length > 0) {
      const anyConnected = status.peers.some((p) => p.active_transport);
      if (anyConnected || status.pending_local_changes === 0) {
        return {
          icon: <CheckCircle2 size={14} color="#4ade80" />,
          text: status.pending_local_changes > 0 ? `${status.pending_local_changes} local` : 'Up to date',
          color: '#4ade80',
          type: 'online',
        };
      }
    }

    if (status?.pending_local_changes && status.pending_local_changes > 0) {
      return {
        icon: <WifiOff size={14} color="#94a3b8" />,
        text: `${status.pending_local_changes} unsynced`,
        color: '#94a3b8',
        type: 'offline_pending',
      };
    }

    return {
      icon: <Wifi size={14} color="#94a3b8" />,
      text: 'Sync ready',
      color: '#94a3b8',
      type: 'idle',
    };
  };

  const formatLastSynced = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const elapsedSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (elapsedSeconds < 10) return 'Just now';
    if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    return `${elapsedHours}h ago`;
  };

  const display = getStatusDisplay();

  return (
    <div className="sync-status-indicator-container" style={{ position: 'relative' }}>
      <button
        className="sync-status-pill"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        title="Sync Status & Settings"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: `1px solid rgba(255, 255, 255, 0.1)`,
          borderRadius: '20px',
          padding: '4px 10px',
          fontSize: '12px',
          fontWeight: 500,
          color: '#e2e8f0',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        {display.icon}
        {!compact && <span>{display.text}</span>}
        {!compact && <ChevronDown size={12} style={{ opacity: 0.6 }} />}
      </button>

      {isDropdownOpen && (
        <>
          <div
            className="sync-status-backdrop"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 998,
            }}
            onClick={() => setIsDropdownOpen(false)}
          />
          <div
            className="sync-status-dropdown"
            style={{
              position: 'absolute',
              top: '100%',
              ...(dropdownAlign === 'left' ? { left: 0 } : { right: 0 }),
              marginTop: '6px',
              width: '260px',
              maxWidth: 'calc(100vw - 28px)',
              background: '#1a1a1d',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '10px',
              padding: '12px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              zIndex: 999,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              color: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Sync Status</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {status?.peers && status.peers.some((p) => !p.active_transport) && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await syncService.clearInactivePeers().catch(() => {});
                      await fetchStatus();
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                    title="Remove offline peers from list"
                  >
                    Clear Offline
                  </button>
                )}
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {formatLastSynced(status?.last_synced_at || null)}
                </span>
              </div>
            </div>

            {status?.last_error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  color: '#fca5a5',
                  wordBreak: 'break-word',
                }}
              >
                {status.last_error}
              </div>
            )}

            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {status?.peers && status.peers.length > 0 ? (
                <div>
                  {status.peers.map((p) => (
                    <div
                      key={p.peer_id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <span style={{ color: '#cbd5e1' }}>{p.name}</span>
                      <span style={{ textTransform: 'capitalize', color: p.active_transport ? '#4ade80' : '#64748b' }}>
                        {p.active_transport || 'Offline'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div>No devices paired yet</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#fff',
                  cursor: isSyncing ? 'not-allowed' : 'pointer',
                  opacity: isSyncing ? 0.7 : 1,
                }}
              >
                <RefreshCw size={13} className={isSyncing ? 'spin-sync-icon' : ''} />
                <span>Sync Now</span>
              </button>

              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  onOpenSettings();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                }}
                title="Open Settings"
              >
                <SettingsIcon size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
