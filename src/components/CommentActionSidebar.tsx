import React, { useState } from 'react';
import { ArrowLeft, MapPin, Trash2 } from 'lucide-react';
import { Element } from '../types';

interface CommentActionSidebarProps {
  element: Element | null;
  onClose: () => void;
  onDelete: () => void;
  onStyleChange: (id: string, newStyle: Record<string, any>) => void;
  onTogglePin: (commentId: string, pinState: boolean) => void;
}

const STRIP_COLORS_MAIN = [
  '#dde1e7', '#6b7280', '#4de6c0', '#6ce858',
  '#f19e59', '#ffd046', '#ff8f35', '#f65555',
  '#fa65c2', '#a462fb', '#46b8fb', '#587af7'
];

const STRIP_COLORS_PASTEL = [
  '#d69068', '#cc907b', '#debba9', '#ded1c1', '#ded6b4',
  '#b6be9c', '#bec485'
];

const SOLID_PIN_COLORS = [
  '#2b73f8', '#f55b6a', '#4ca674', '#ffd046',
  '#a462fb', '#ff8f35', '#4de6c0', '#fa65c2',
  '#6b7280', '#c27c3e', '#74bfc8', '#ded1c1'
];

export const CommentActionSidebar: React.FC<CommentActionSidebarProps> = ({
  element,
  onClose,
  onDelete,
  onStyleChange,
  onTogglePin
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);

  if (!element) return null;

  const currentStyle = element.style || {};
  const isPinned = Boolean(element.content?.is_pinned);

  const activeTopStrip = currentStyle.top_strip_color || null;
  const activePinColor = currentStyle.pin_color || '#2b73f8';

  const handleTopStripSelect = (col: string | null) => {
    if (!col) {
      const { top_strip_color, ...rest } = currentStyle;
      onStyleChange(element.id, rest);
    } else {
      onStyleChange(element.id, { ...currentStyle, top_strip_color: col });
    }
  };

  const handlePinColorSelect = (col: string) => {
    onStyleChange(element.id, { ...currentStyle, pin_color: col });
  };

  return (
    <aside className="milanote-sub-sidebar" style={{ position: 'relative', overflow: 'visible' }}>
      {/* Top Close Back Arrow */}
      <button 
        className="sub-sidebar-btn" 
        onClick={() => { setShowColorMenu(false); onClose(); }} 
        title="Deselect Comment (Return to Toolbar)"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* COLOR ACTION BUTTON */}
      <div style={{ width: '100%', position: 'relative' }}>
        <button 
          className={`note-action-btn ${showColorMenu ? 'active' : ''}`}
          onClick={() => setShowColorMenu(!showColorMenu)}
          title={isPinned ? 'Change pin marker fill color' : 'Change comment box top strip color'}
        >
          <div className="note-action-icon-wrap">
            {isPinned ? (
              /* Solid pin color square preview (Screenshot 3 Parity) */
              <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '4px',
                backgroundColor: activePinColor,
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
              }} />
            ) : activeTopStrip ? (
              /* Active top strip preview */
              <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '3px',
                backgroundColor: activeTopStrip,
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
              }} />
            ) : (
              /* Uncolored Top Strip Slash Icon (Screenshot 2 Parity) */
              <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#353c48', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '2px', height: '28px', background: '#fa3b72', transform: 'rotate(45deg)', transformOrigin: 'center' }} />
              </div>
            )}
          </div>
          <span className="note-action-label">Color</span>
        </button>

        {/* COLOR PALETTE DRAWER */}
        {showColorMenu && (
          <div className="color-menu-drawer" onClick={(e) => e.stopPropagation()} style={{ top: '6px', left: '64px' }}>
            {isPinned ? (
              /* SOLID PIN COLOR SELECTOR */
              <>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#9fa8bd', marginBottom: '8px', paddingLeft: '2px' }}>
                  Pin Color
                </div>
                <div className="color-swatches-grid-main">
                  {SOLID_PIN_COLORS.map((col, idx) => {
                    const isSelected = activePinColor === col;
                    return (
                      <div
                        key={idx}
                        className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                        style={{ backgroundColor: col, border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
                        onClick={() => handlePinColorSelect(col)}
                        title={col}
                      />
                    );
                  })}
                </div>
                <label className="custom-color-btn" title="Choose any custom pin color...">
                  <div className="rainbow-circle-icon" />
                  <span>Custom color...</span>
                  <input 
                    type="color" 
                    style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0 }}
                    value={activePinColor}
                    onChange={(e) => handlePinColorSelect(e.target.value)}
                  />
                </label>
              </>
            ) : (
              /* TOP STRIP COLOR SELECTOR (Screenshot 2 Parity) */
              <>
                <div className="color-swatches-grid-main">
                  <div 
                    className="color-swatch-box" 
                    style={{ background: '#353b47', position: 'relative', overflow: 'hidden', border: !activeTopStrip ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
                    onClick={() => handleTopStripSelect(null)}
                    title="Remove Top Strip Color"
                  >
                    <div style={{ width: '2px', height: '28px', background: '#fa3b72', position: 'absolute', left: '10px', top: '-4px', transform: 'rotate(45deg)' }} />
                  </div>
                  {STRIP_COLORS_MAIN.map((col, idx) => {
                    const isSelected = activeTopStrip === col;
                    return (
                      <div
                        key={idx}
                        className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                        style={{ backgroundColor: col, border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
                        onClick={() => handleTopStripSelect(col)}
                        title={col}
                      />
                    );
                  })}
                </div>

                <div className="color-menu-divider" />

                <div className="color-swatches-grid-main" style={{ marginBottom: '10px' }}>
                  {STRIP_COLORS_PASTEL.map((col, idx) => {
                    const isSelected = activeTopStrip === col;
                    return (
                      <div
                        key={idx}
                        className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                        style={{ backgroundColor: col, border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
                        onClick={() => handleTopStripSelect(col)}
                        title={col}
                      />
                    );
                  })}
                </div>

                <label className="custom-color-btn" title="Choose custom top strip color...">
                  <div className="rainbow-circle-icon" />
                  <span>Custom color...</span>
                  <input 
                    type="color" 
                    style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0 }}
                    onChange={(e) => handleTopStripSelect(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
        )}
      </div>

      {/* COLLAPSE / UN-COLLAPSE TOGGLE BUTTON (Screenshots 2 & 3 Parity) */}
      {!element.style?.is_unsorted && (
        <button 
          className={`note-action-btn ${isPinned ? 'active' : ''}`}
          style={isPinned ? {
            border: '1.5px solid #ffffff',
            backgroundColor: '#2b303d',
            boxShadow: '0 0 10px rgba(255, 255, 255, 0.45)',
            borderRadius: '8px'
          } : {}}
          onClick={() => {
            setShowColorMenu(false);
            onTogglePin(element.id, !isPinned);
          }} 
          title={isPinned ? 'Un-collapse pin back into full comment box' : 'Collapse comment box into canvas drop pin'}
        >
          <div className="note-action-icon-wrap">
            <MapPin size={17} color={isPinned ? '#ffffff' : '#c5cbe0'} />
          </div>
          <span className="note-action-label" style={isPinned ? { color: '#ffffff', fontWeight: 600 } : {}}>Collapse</span>
        </button>
      )}

      {/* TRASH BOTTOM BUTTON */}
      <button 
        className="sub-sidebar-btn trash-bottom" 
        style={{ flexDirection: 'column', gap: '2px', height: '48px', marginTop: 'auto' }}
        onClick={() => { setShowColorMenu(false); onDelete(); onClose(); }} 
        title="Delete comment"
      >
        <Trash2 size={18} />
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '-0.2px' }}>Trash</span>
      </button>
    </aside>
  );
};
