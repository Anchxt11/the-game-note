import React, { useState } from 'react';
import { ArrowLeft, Type, Trash2 } from 'lucide-react';
import { Element } from '../types';

interface ColumnActionSidebarProps {
  element: Element | null;
  onClose: () => void;
  onDelete: () => void;
  onStyleChange: (id: string, newStyle: Record<string, any>) => void;
  onRename: (columnId: string) => void;
}

const COLUMN_BG_COLORS = [
  '#272b35', '#dde1e7', '#4de6c0', '#6ce858', '#ffd046',
  '#ff8f35', '#f65555', '#fa65c2', '#a462fb', '#46b8fb',
  '#587af7', 'transparent'
];

const COLUMN_STRIP_COLORS = [
  '#dde1e7', '#6b7280', '#4de6c0', '#6ce858', '#ffd046',
  '#ff8f35', '#f65555', '#fa65c2', '#a462fb', '#46b8fb',
  '#587af7'
];

const COLUMN_PASTEL_COLORS = [
  '#ff8c00', '#f65555', '#f58d8d', '#be3232', '#32463b',
  '#284b38', '#748777'
];

export const ColumnActionSidebar: React.FC<ColumnActionSidebarProps> = ({
  element,
  onClose,
  onDelete,
  onStyleChange,
  onRename
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [colorMode, setColorMode] = useState<'background' | 'top_strip'>('background');

  if (!element) return null;

  const currentStyle = element.style || {};
  const activeBgColor = currentStyle.background_color || '#272b35';
  const activeTopStrip = currentStyle.top_strip_color || null;

  const handleColorSelect = (col: string) => {
    if (colorMode === 'background') {
      if (col === 'transparent' || col === '#272b35') {
        const { background_color, ...rest } = currentStyle;
        onStyleChange(element.id, rest);
      } else {
        onStyleChange(element.id, { ...currentStyle, background_color: col });
      }
    } else {
      if (col === 'none') {
        const { top_strip_color, ...rest } = currentStyle;
        onStyleChange(element.id, rest);
      } else {
        onStyleChange(element.id, { ...currentStyle, top_strip_color: col });
      }
    }
  };

  return (
    <aside className="milanote-sub-sidebar" style={{ position: 'relative', overflow: 'visible' }}>
      {/* Top Close Back Arrow */}
      <button 
        className="sub-sidebar-btn" 
        onClick={() => { setShowColorMenu(false); onClose(); }} 
        title="Deselect Column (Return to Toolbar)"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* COLOR ACTION BUTTON */}
      <div style={{ width: '100%', position: 'relative' }}>
        <button 
          className={`note-action-btn ${showColorMenu ? 'active' : ''}`}
          onClick={() => setShowColorMenu(!showColorMenu)}
          title="Change column background & top strip color"
        >
          <div className="note-action-icon-wrap">
            <div style={{ 
              width: '18px', 
              height: '16px', 
              borderRadius: '3px', 
              background: activeBgColor || '#272b35',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
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

        {/* FLOATING COLOR POPUP DRAWER (SCREENSHOT 1 PARITY) */}
        {showColorMenu && (
          <div className="color-menu-drawer" onClick={(e) => e.stopPropagation()} style={{ top: '6px', left: '64px', width: '220px' }}>
            {/* Mode Switcher Segmented Control */}
            <div className="color-mode-tabs">
              <button 
                className={`color-mode-tab ${colorMode === 'background' ? 'active' : ''}`}
                onClick={() => setColorMode('background')}
              >
                <div style={{ 
                  width: '14px', 
                  height: '11px', 
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
                  width: '14px', 
                  height: '11px', 
                  borderRadius: '2px', 
                  border: `1.5px solid ${colorMode === 'top_strip' ? '#ffffff' : '#9098a6'}`,
                  borderTop: `4px solid ${colorMode === 'top_strip' ? '#ffffff' : '#9098a6'}`
                }} />
                Top strip
              </button>
            </div>

            {/* Grid 1: Classic & Strip Colors */}
            <div className="color-swatches-grid-main">
              {colorMode === 'top_strip' && (
                <div 
                  className={`color-swatch-box ${!activeTopStrip ? 'selected' : ''}`}
                  style={{ backgroundColor: '#353c48', position: 'relative', overflow: 'hidden', border: !activeTopStrip ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
                  onClick={() => handleColorSelect('none')}
                  title="Remove top strip"
                >
                  <div style={{ width: '2px', height: '28px', background: '#fa3b72', position: 'absolute', left: '10px', top: '-4px', transform: 'rotate(45deg)' }} />
                </div>
              )}

              {(colorMode === 'background' ? COLUMN_BG_COLORS : COLUMN_STRIP_COLORS).map((col, idx) => {
                if (col === 'transparent') {
                  const isSelected = !currentStyle.background_color && colorMode === 'background';
                  return (
                    <div
                      key={idx}
                      className={`color-swatch-box color-swatch-transparent-grid ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleColorSelect('transparent')}
                      title="Default / Transparent"
                    />
                  );
                }

                const isSelected = colorMode === 'background' ? (currentStyle.background_color === col || (!currentStyle.background_color && col === '#272b35')) : (activeTopStrip === col);
                return (
                  <div
                    key={idx}
                    className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: col, border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
                    onClick={() => handleColorSelect(col)}
                    title={col}
                  />
                );
              })}
            </div>

            <div className="color-menu-divider" style={{ margin: '12px -14px 12px -14px' }} />

            {/* Grid 2: Pastel Colors */}
            <div className="color-swatches-grid-main" style={{ marginBottom: '10px' }}>
              {COLUMN_PASTEL_COLORS.map((col, idx) => {
                const isSelected = colorMode === 'background' ? (currentStyle.background_color === col) : (activeTopStrip === col);
                return (
                  <div
                    key={idx}
                    className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: col, border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
                    onClick={() => handleColorSelect(col)}
                    title={col}
                  />
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

      {/* RENAME BUTTON */}
      <button 
        className="note-action-btn" 
        onClick={() => {
          setShowColorMenu(false);
          onRename(element.id);
        }} 
        title="Rename column title"
      >
        <div className="note-action-icon-wrap">
          <Type size={16} />
        </div>
        <span className="note-action-label">Rename</span>
      </button>

      {/* TRASH BOTTOM BUTTON */}
      <button 
        className="sub-sidebar-btn trash-bottom" 
        style={{ flexDirection: 'column', gap: '2px', height: '48px', marginTop: 'auto' }}
        onClick={() => { setShowColorMenu(false); onDelete(); onClose(); }} 
        title="Delete column"
      >
        <Trash2 size={18} />
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '-0.2px' }}>Trash</span>
      </button>
    </aside>
  );
};
