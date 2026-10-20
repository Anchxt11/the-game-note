import React from 'react';
import { 
  Home, 
  ChevronRight, 
  Undo2, 
  Redo2, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Sparkles, 
  HelpCircle, 
  Settings,
  FolderOpen
} from 'lucide-react';
import { Board } from '../types';
import { SyncStatusIndicator } from './SyncStatusIndicator';

interface TopBarProps {
  currentBoard: Board | null;
  breadcrumbs: Board[];
  onSelectBoard: (board: Board | null) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenSearch: () => void;
  unsortedCount: number;
  onToggleUnsorted: () => void;
  isUnsortedOpen: boolean;
  onOpenSyncSettings?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentBoard,
  breadcrumbs,
  onSelectBoard,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenSearch,
  unsortedCount,
  onToggleUnsorted,
  isUnsortedOpen,
  onOpenSyncSettings,
}) => {
  return (
    <header className="milanote-header">
      <div className="header-left">
        <button 
          className="header-btn" 
          onClick={() => onSelectBoard(null)}
          title="Return to Root Workspace"
        >
          <Home size={18} />
          <span>Home</span>
        </button>

        {breadcrumbs.length > 0 && (
          <nav className="breadcrumb-path">
            {breadcrumbs.map((b, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={b.id}>
                  <ChevronRight size={15} className="text-muted" style={{ opacity: 0.5 }} />
                  <button
                    className={`breadcrumb-item ${isLast ? 'active' : ''}`}
                    onClick={() => !isLast && onSelectBoard(b)}
                  >
                    {b.title}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        )}
      </div>

      <div className="header-right">
        <span className="promo-tag">
          Infinite Canvas — No Limits <Sparkles size={14} />
        </span>

        <div className="header-divider" />

        <button 
          className="header-btn icon-only" 
          onClick={onUndo} 
          disabled={!canUndo} 
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={18} />
        </button>
        <button 
          className="header-btn icon-only" 
          onClick={onRedo} 
          disabled={!canRedo} 
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={18} />
        </button>

        <div className="header-divider" />

        <button 
          className="header-btn icon-only" 
          onClick={onOpenSearch} 
          title="Search Board & Notes (Cmd/Ctrl + K)"
        >
          <Search size={18} />
        </button>

        <div className="header-divider" />

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button className="header-btn icon-only" onClick={onZoomOut} title="Zoom Out">
            <ZoomOut size={17} />
          </button>
          <button 
            className="header-btn" 
            onClick={onResetZoom} 
            style={{ minWidth: '56px', padding: '4px 6px', fontSize: '12px' }}
            title="Reset Zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button className="header-btn icon-only" onClick={onZoomIn} title="Zoom In">
            <ZoomIn size={17} />
          </button>
          <button className="header-btn icon-only" onClick={onResetZoom} title="Reset Viewpoint">
            <Maximize2 size={16} />
          </button>
        </div>

        <div className="header-divider" />

        <SyncStatusIndicator onOpenSettings={onOpenSyncSettings || (() => {})} />

        <button className="header-btn icon-only" title="Help & Documentation">
          <HelpCircle size={18} />
        </button>
        <button 
          className="header-btn icon-only" 
          title="Sync & Workspace Settings"
          onClick={onOpenSyncSettings}
        >
          <Settings size={18} />
        </button>

        <button 
          className="unsorted-btn" 
          onClick={onToggleUnsorted}
          style={isUnsortedOpen ? { borderColor: '#5865f2', background: 'rgba(88,101,242,0.15)' } : {}}
          title="Open Unsorted Notes Tray"
        >
          <FolderOpen size={16} />
          <span>{unsortedCount} Unsorted</span>
        </button>
      </div>
    </header>
  );
};
