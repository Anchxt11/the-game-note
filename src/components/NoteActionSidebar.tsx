import React, { useState } from 'react';
import {
  ArrowLeft,
  Tag,
  Smile,
  MessageSquarePlus,
  Trash2
} from 'lucide-react';
import { Element } from '../types';

interface NoteActionSidebarProps {
  element: Element | null;
  onClose: () => void;
  onDelete: () => void;
  onStyleChange: (id: string, newStyle: Record<string, any>) => void;
  onAddCommentPin: (noteId: string) => void;
}

const CLASSIC_COLORS = [
  '#2c3340', '#a8b0c0', '#48d6b5', '#6ee655', '#e89858',
  '#f5cc47', '#ff8830', '#f75454', '#f763bd', '#a863f7',
  '#45b7fb', '#5578f7', 'transparent'
];

const LETTERED_PRESETS = [
  { color: '#d69068', text: '#3c2415' },
  { color: '#cc907b', text: '#3a221a' },
  { color: '#b6be9c', text: '#2b3120' },
  { color: '#ded6b4', text: '#3f3b2d' },
];

const PASTEL_COLORS = [
  '#d69068', '#cc907b', '#debba9', '#ded1c1', '#ded6b4',
  '#b6be9c', '#bec485'
];

export const NoteActionSidebar: React.FC<NoteActionSidebarProps> = ({
  element,
  onClose,
  onDelete,
  onStyleChange,
  onAddCommentPin,
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [colorMode, setColorMode] = useState<'background' | 'top_strip'>('background');

  if (!element) return null;

  const currentStyle = element.style || {};
  const activeBgColor = currentStyle.background_color;
  const activeTopStrip = currentStyle.top_strip_color;

  const handleColorSelect = (color: string) => {
    if (colorMode === 'background') {
      if (color === 'transparent') {
        const { background_color, ...rest } = currentStyle;
        onStyleChange(element.id, rest);
      } else {
        onStyleChange(element.id, { ...currentStyle, background_color: color });
      }
    } else {
      if (color === 'none') {
        const { top_strip_color, ...rest } = currentStyle;
        onStyleChange(element.id, rest);
      } else {
        onStyleChange(element.id, { ...currentStyle, top_strip_color: color });
      }
    }
  };

  return (
    <aside className="milanote-sub-sidebar" style={{ position: 'relative', overflow: 'visible' }}>
      {/* Top Close Back Arrow */}
      <button 
        className="sub-sidebar-btn" 
        onClick={() => { setShowColorMenu(false); onClose(); }} 
        title="Deselect Note (Return to Toolbar)"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* COLOR ACTION BUTTON */}
      <div style={{ width: '100%', position: 'relative' }}>
        <button 
          className={`note-action-btn ${showColorMenu ? 'active' : ''}`}
          onClick={() => setShowColorMenu(!showColorMenu)}
          title="Change colors"
        >
          <div className="note-action-icon-wrap">
            <div style={{ 
              width: '16px', 
              height: '14px', 
              borderRadius: '3px', 
              background: activeBgColor || '#434a58',
              border: '1.5px solid rgba(255, 255, 255, 0.4)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {activeTopStrip && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', backgroundColor: activeTopStrip }} />
              )}
            </div>
          </div>
          <span className="note-action-label">Color</span>
        </button>

        {/* FLOATING COLOR POPUP DRAWER */}
        {showColorMenu && (
          <div className="color-menu-drawer" onClick={(e) => e.stopPropagation()}>
            {/* Mode Switcher Segmented Control */}
            <div className="color-mode-tabs">
              <button 
                className={`color-mode-tab ${colorMode === 'background' ? 'active' : ''}`}
                onClick={() => setColorMode('background')}
              >
                <div style={{ 
                  width: '16px', 
                  height: '12px', 
                  borderRadius: '2px', 
                  backgroundColor: colorMode === 'background' ? '#ffffff' : '#9098a6' 
                }} />
                Background
              </button>
              <button 
                className={`color-mode-tab ${colorMode === 'top_strip' ? 'active' : ''}`}
                onClick={() => setColorMode('top_strip')}
              >
                <div style={{ 
                  width: '16px', 
                  height: '12px', 
                  borderRadius: '2px', 
                  border: `1.5px solid ${colorMode === 'top_strip' ? '#ffffff' : '#9098a6'}`,
                  borderTop: `4px solid ${colorMode === 'top_strip' ? '#ffffff' : '#9098a6'}`
                }} />
                Top strip
              </button>
            </div>

            {/* Grid 1: Classic Colors & None */}
            <div className="color-swatches-grid-main">
              {colorMode === 'top_strip' && (
                <div 
                  className={`color-swatch-box ${!activeTopStrip ? 'selected' : ''}`}
                  style={{ backgroundColor: '#353c48' }}
                  onClick={() => handleColorSelect('none')}
                  title="Remove top strip"
                >
                  <div className="color-swatch-none-slash" />
                </div>
              )}

              {CLASSIC_COLORS.map((col, idx) => {
                if (colorMode === 'top_strip' && col === 'transparent') return null;

                const isTransparent = col === 'transparent';
                const isSelected = colorMode === 'background' ? (activeBgColor === col || (!activeBgColor && isTransparent)) : (activeTopStrip === col);

                return (
                  <div
                    key={idx}
                    className={`color-swatch-box ${isTransparent ? 'color-swatch-transparent-grid' : ''} ${isSelected ? 'selected' : ''}`}
                    style={colorMode === 'background' ? { backgroundColor: isTransparent ? undefined : col } : { backgroundColor: '#353c48' }}
                    onClick={() => handleColorSelect(col)}
                    title={col}
                  >
                    {colorMode === 'top_strip' && !isTransparent && (
                      <div className="color-swatch-top-strip-preview" style={{ backgroundColor: col }} />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="color-menu-divider" />

            {/* Grid 2: Lettered Presets (In Background Mode) */}
            {colorMode === 'background' && (
              <>
                <div className="color-swatches-grid-presets">
                  {LETTERED_PRESETS.map((preset, idx) => {
                    const isSelected = activeBgColor === preset.color;
                    return (
                      <div
                        key={idx}
                        className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                        style={{ backgroundColor: preset.color, fontWeight: 700, fontSize: '15px', color: preset.text }}
                        onClick={() => handleColorSelect(preset.color)}
                        title="Themed note color"
                      >
                        A
                      </div>
                    );
                  })}
                </div>
                <div className="color-menu-divider" />
              </>
            )}

            {/* Grid 3: Pastel Swatches */}
            <div className="color-swatches-grid-main" style={{ marginBottom: '8px' }}>
              {PASTEL_COLORS.map((col, idx) => {
                const isSelected = colorMode === 'background' ? (activeBgColor === col) : (activeTopStrip === col);
                return (
                  <div
                    key={idx}
                    className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                    style={colorMode === 'background' ? { backgroundColor: col } : { backgroundColor: '#353c48' }}
                    onClick={() => handleColorSelect(col)}
                    title={col}
                  >
                    {colorMode === 'top_strip' && (
                      <div className="color-swatch-top-strip-preview" style={{ backgroundColor: col }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Custom Color Rainbow Button */}
            <label className="custom-color-btn" title="Choose any custom color...">
              <div className="rainbow-circle-icon" />
              <span>Custom color...</span>
              <input 
                type="color" 
                style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0 }}
                onChange={(e) => handleColorSelect(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {/* LABELS BUTTON (UI Stub) */}
      <button className="note-action-btn" title="Labels & Tags (Coming Soon)" onClick={() => setShowColorMenu(false)}>
        <div className="note-action-icon-wrap">
          <Tag size={16} />
        </div>
        <span className="note-action-label">Labels</span>
      </button>

      {/* REACTIONS BUTTON (UI Stub) */}
      <button className="note-action-btn" title="Reactions (Coming Soon)" onClick={() => setShowColorMenu(false)}>
        <div className="note-action-icon-wrap">
          <Smile size={16} />
        </div>
        <span className="note-action-label">Reactions</span>
      </button>

      {/* COMMENT BUTTON - DROPS A COMMENT PIN! */}
      <button 
        className="note-action-btn" 
        onClick={() => {
          setShowColorMenu(false);
          onAddCommentPin(element.id);
        }} 
        title="Drop a comment pin onto this note"
      >
        <div className="note-action-icon-wrap">
          <MessageSquarePlus size={16} />
        </div>
        <span className="note-action-label">Comment</span>
      </button>

      {/* TRASH BOTTOM BUTTON */}
      <button 
        className="sub-sidebar-btn trash-bottom" 
        style={{ flexDirection: 'column', gap: '2px', height: '48px', marginTop: 'auto' }}
        onClick={() => { setShowColorMenu(false); onDelete(); onClose(); }} 
        title="Delete text box"
      >
        <Trash2 size={18} />
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '-0.2px' }}>Trash</span>
      </button>
    </aside>
  );
};
