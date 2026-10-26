import React, { useState } from 'react';
import { ArrowLeft, Type, Trash2 } from 'lucide-react';
import { Element } from '../types';
import { BoardIconPanel } from './BoardIconPanel';
import {
  BoardIconRenderer,
  getBoardThemeForTitle,
  MILANOTE_SOLID_BOARD_COLORS,
  MILANOTE_DIAGONAL_SWATCHES,
  MILANOTE_PASTEL_COLORS
} from '../utils/boardIconUtils';

interface BoardActionSidebarProps {
  element: Element | null;
  onClose: () => void;
  onDelete: () => void;
  onStyleChange: (id: string, newStyle: Record<string, any>) => void;
  onSetIcon: (boardId: string, iconName: string, imageUrl?: string) => void;
  onRemoveImageIcon?: (boardId: string) => void;
  onRename: (boardId: string) => void;
}

export const BoardActionSidebar: React.FC<BoardActionSidebarProps> = ({
  element,
  onClose,
  onDelete,
  onStyleChange,
  onSetIcon,
  onRemoveImageIcon,
  onRename
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showIconMenu, setShowIconMenu] = useState(false);

  if (!element) return null;

  const currentStyle = element.style || {};
  const activeColor = currentStyle.board_color || null;
  const activeGradient = currentStyle.board_gradient || null;

  // Auto theme matching board title if custom icon/color isn't manually locked
  const autoTheme = getBoardThemeForTitle(element.content?.title);
  const activeIconName = element.content?.custom_icon || autoTheme.icon;
  const activeImageUrl = element.content?.custom_image_url || null;

  const handleSolidColorSelect = (col: string) => {
    onStyleChange(element.id, {
      ...currentStyle,
      board_color: col,
      board_color_locked: true,
      board_gradient: null
    });
  };

  const handleGradientSelect = (swatch: { bg: string; gradient: string }) => {
    onStyleChange(element.id, {
      ...currentStyle,
      board_color: swatch.bg,
      board_color_locked: true,
      board_gradient: swatch.gradient
    });
  };

  return (
    <aside className="milanote-sub-sidebar" style={{ position: 'relative', overflow: 'visible' }}>
      {/* Top Close Back Arrow */}
      <button 
        className="sub-sidebar-btn" 
        onClick={() => { setShowColorMenu(false); setShowIconMenu(false); onClose(); }} 
        title="Deselect Board (Return to Toolbar)"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* COLOR ACTION BUTTON */}
      <div style={{ width: '100%', position: 'relative' }}>
        <button 
          className={`note-action-btn ${showColorMenu ? 'active' : ''}`}
          onClick={() => { setShowIconMenu(false); setShowColorMenu(!showColorMenu); }}
          title="Change board badge color"
        >
          <div className="note-action-icon-wrap">
            <div style={{ 
              width: '18px', 
              height: '16px', 
              borderRadius: '3px', 
              background: activeGradient || activeColor || autoTheme.color || 'linear-gradient(135deg, #c7cdb1 50%, #343c24 50%)',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
            }} />
          </div>
          <span className="note-action-label">Color</span>
        </button>

        {/* FLOATING BOARD COLOR PALETTE DRAWER */}
        {showColorMenu && (
          <div className="color-menu-drawer" onClick={(e) => e.stopPropagation()} style={{ top: '6px', left: '64px', width: '210px' }}>
            {/* Grid 1: 12 Solid Board Colors */}
            <div className="color-swatches-grid-main">
              {MILANOTE_SOLID_BOARD_COLORS.map((col, idx) => {
                const isSelected = activeColor === col && !activeGradient;
                return (
                  <div
                    key={idx}
                    className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: col, border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
                    onClick={() => handleSolidColorSelect(col)}
                    title={col}
                  />
                );
              })}
            </div>

            <div className="color-menu-divider" style={{ margin: '12px -14px 12px -14px' }} />

            {/* Grid 2: 4 Two-Tone Diagonal Gradients */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', paddingLeft: '2px' }}>
              {MILANOTE_DIAGONAL_SWATCHES.map((swatch, idx) => {
                const isSelected = activeGradient === swatch.gradient || activeColor === swatch.bg;
                return (
                  <div
                    key={idx}
                    className={`color-swatch-diagonal-box ${isSelected ? 'selected' : ''}`}
                    style={{ background: swatch.gradient }}
                    onClick={() => handleGradientSelect(swatch)}
                    title={`Two-tone: ${swatch.name}`}
                  />
                );
              })}
            </div>

            <div className="color-menu-divider" style={{ margin: '12px -14px 12px -14px' }} />

            {/* Grid 3: Neutral Pastels */}
            <div className="color-swatches-grid-main" style={{ marginBottom: '10px' }}>
              {MILANOTE_PASTEL_COLORS.map((col, idx) => {
                const isSelected = activeColor === col && !activeGradient;
                return (
                  <div
                    key={idx}
                    className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: col, border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
                    onClick={() => handleSolidColorSelect(col)}
                    title={col}
                  />
                );
              })}
            </div>

            {/* Custom Color Rainbow Button */}
            <label className="custom-color-btn" title="Choose any custom board color...">
              <div className="rainbow-circle-icon" />
              <span>Custom color...</span>
              <input 
                type="color" 
                style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0 }}
                onChange={(e) => handleSolidColorSelect(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {/* ICON ACTION BUTTON & MILANOTE POPOVER PANEL */}
      <div style={{ width: '100%', position: 'relative' }}>
        <button 
          className={`note-action-btn ${showIconMenu ? 'active' : ''}`}
          onClick={() => { setShowColorMenu(false); setShowIconMenu(!showIconMenu); }}
          title="Change board badge icon"
        >
          <div className="note-action-icon-wrap">
            <div style={{ 
              width: '20px', 
              height: '20px', 
              borderRadius: '4px', 
              background: '#353c48', 
              border: '1px solid rgba(255,255,255,0.2)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              overflow: 'hidden'
            }}>
              <BoardIconRenderer
                iconName={activeIconName}
                imageUrl={activeImageUrl}
                size={14}
                color="#c5cbe0"
              />
            </div>
          </div>
          <span className="note-action-label">Icon</span>
        </button>

        {/* MILANOTE EXACT ICON PANEL POPOVER */}
        {showIconMenu && (
          <BoardIconPanel
            element={element}
            onSelectIcon={(iconName) => {
              onSetIcon(element.id, iconName);
            }}
            onUploadImage={(dataUrl) => {
              onSetIcon(element.id, 'IMAGE_UPLOAD', dataUrl);
            }}
            onRemoveImage={() => {
              if (onRemoveImageIcon) {
                onRemoveImageIcon(element.id);
              } else {
                onSetIcon(element.id, autoTheme.icon);
              }
            }}
            onClose={() => setShowIconMenu(false)}
          />
        )}
      </div>

      {/* RENAME BUTTON */}
      <button 
        className="note-action-btn" 
        onClick={() => {
          setShowColorMenu(false);
          setShowIconMenu(false);
          onRename(element.id);
        }} 
        title="Rename board title"
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
        onClick={() => { setShowColorMenu(false); setShowIconMenu(false); onDelete(); onClose(); }} 
        title="Delete board element"
      >
        <Trash2 size={18} />
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '-0.2px' }}>Trash</span>
      </button>
    </aside>
  );
};
