import React, { useState } from 'react';
import {
  ArrowLeft,
  FolderPlus,
  BookOpen,
  Brain,
  Palette,
  Globe,
  FileText,
  Share2,
  Layers,
  Film,
  Code,
  Volume2,
  Scale,
  History,
  HelpCircle,
  Image as ImageIcon,
  User,
  Type,
  Trash2
} from 'lucide-react';
import { Element } from '../types';

interface BoardActionSidebarProps {
  element: Element | null;
  onClose: () => void;
  onDelete: () => void;
  onStyleChange: (id: string, newStyle: Record<string, any>) => void;
  onSetIcon: (boardId: string, iconName: string) => void;
  onRename: (boardId: string) => void;
}

const SOLID_BOARD_COLORS = [
  '#dde1e7', '#6b7280', '#4de6c0', '#6ce858',
  '#f19e59', '#ffd046', '#ff8f35', '#f65555',
  '#fa65c2', '#a462fb', '#46b8fb', '#587af7'
];

const DIAGONAL_BOARD_SWATCHES = [
  { name: 'orange-brown', bg: '#8c562e', gradient: 'linear-gradient(135deg, #e5985b 50%, #462817 50%)' },
  { name: 'beige-brown', bg: '#977258', gradient: 'linear-gradient(135deg, #d3c0b0 50%, #462817 50%)' },
  { name: 'olive-green', bg: '#757d54', gradient: 'linear-gradient(135deg, #c7cdb1 50%, #343c24 50%)' },
  { name: 'cream-rust', bg: '#b68356', gradient: 'linear-gradient(135deg, #f1ebb8 50%, #7e4d29 50%)' },
];

const PASTEL_BOARD_COLORS = [
  '#d69068', '#cc907b', '#debba9', '#ded1c1', '#ded6b4',
  '#b6be9c', '#bec485'
];

const BOARD_ICON_GALLERY: Array<{ name: string; Icon: any }> = [
  { name: 'FolderPlus', Icon: FolderPlus },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'Brain', Icon: Brain },
  { name: 'Palette', Icon: Palette },
  { name: 'Globe', Icon: Globe },
  { name: 'FileText', Icon: FileText },
  { name: 'Share2', Icon: Share2 },
  { name: 'Layers', Icon: Layers },
  { name: 'Film', Icon: Film },
  { name: 'Code', Icon: Code },
  { name: 'Volume2', Icon: Volume2 },
  { name: 'Scale', Icon: Scale },
  { name: 'History', Icon: History },
  { name: 'HelpCircle', Icon: HelpCircle },
  { name: 'ImageIcon', Icon: ImageIcon },
  { name: 'User', Icon: User },
];

export const BoardActionSidebar: React.FC<BoardActionSidebarProps> = ({
  element,
  onClose,
  onDelete,
  onStyleChange,
  onSetIcon,
  onRename
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showIconMenu, setShowIconMenu] = useState(false);

  if (!element) return null;

  const currentStyle = element.style || {};
  const activeColor = currentStyle.board_color || null;
  const activeGradient = currentStyle.board_gradient || null;
  const activeIconName = element.content?.custom_icon || 'FolderPlus';

  const handleSolidColorSelect = (col: string) => {
    onStyleChange(element.id, { ...currentStyle, board_color: col, board_gradient: null });
  };

  const handleGradientSelect = (swatch: { bg: string; gradient: string }) => {
    onStyleChange(element.id, { ...currentStyle, board_color: swatch.bg, board_gradient: swatch.gradient });
  };

  // Find current icon component for preview button
  const ActiveIconComp = BOARD_ICON_GALLERY.find((x) => x.name === activeIconName)?.Icon || FolderPlus;

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
              background: activeGradient || activeColor || 'linear-gradient(135deg, #c7cdb1 50%, #343c24 50%)',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
            }} />
          </div>
          <span className="note-action-label">Color</span>
        </button>

        {/* FLOATING BOARD COLOR PALETTE DRAWER (SCREENSHOT 1 PARITY) */}
        {showColorMenu && (
          <div className="color-menu-drawer" onClick={(e) => e.stopPropagation()} style={{ top: '6px', left: '64px', width: '210px' }}>
            {/* Grid 1: 12 Solid Board Colors */}
            <div className="color-swatches-grid-main">
              {SOLID_BOARD_COLORS.map((col, idx) => {
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

            {/* Grid 2: 4 Two-Tone Diagonal Gradients (Screenshot 1 Parity) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', paddingLeft: '2px' }}>
              {DIAGONAL_BOARD_SWATCHES.map((swatch, idx) => {
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
              {PASTEL_BOARD_COLORS.map((col, idx) => {
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

      {/* ICON GALLERY BUTTON */}
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
              justifyContent: 'center' 
            }}>
              <ActiveIconComp size={13} color="#c5cbe0" />
            </div>
          </div>
          <span className="note-action-label">Icon</span>
        </button>

        {/* FLOATING ICON GALLERY DRAWER */}
        {showIconMenu && (
          <div className="icon-menu-drawer" onClick={(e) => e.stopPropagation()} style={{ top: '-10px', left: '64px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#9fa8bd', marginBottom: '8px', paddingLeft: '2px' }}>
              Select Board Icon
            </div>
            <div className="icon-gallery-grid">
              {BOARD_ICON_GALLERY.map((item, idx) => {
                const isSelected = activeIconName === item.name;
                const ItemIcon = item.Icon;
                return (
                  <button
                    key={idx}
                    className={`icon-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onSetIcon(element.id, item.name);
                      setShowIconMenu(false);
                    }}
                    title={item.name}
                  >
                    <ItemIcon size={18} />
                  </button>
                );
              })}
            </div>
          </div>
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
