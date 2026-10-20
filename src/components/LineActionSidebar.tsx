import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Trash2,
  Tag,
  Menu
} from 'lucide-react';
import { Element } from '../types';

interface LineActionSidebarProps {
  element: Element | null;
  onClose: () => void;
  onDelete: () => void;
  onStyleChange: (id: string, newStyle: Record<string, any>) => void;
  onContentChange: (id: string, newContent: Record<string, any>) => void;
}

const CLASSIC_STRIP_COLORS = [
  '#a8b0c0', '#48d6b5', '#6ee655', '#e89858',
  '#f5cc47', '#ff8830', '#f75454', '#f763bd', '#a863f7',
  '#45b7fb', '#5578f7'
];

const PASTEL_STRIP_COLORS = [
  '#d69068', '#cc907b', '#debba9', '#ded1c1', '#ded6b4',
  '#b6be9c', '#bec485'
];

export const LineActionSidebar: React.FC<LineActionSidebarProps> = ({
  element,
  onClose,
  onDelete,
  onStyleChange,
  onContentChange
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showWeightMenu, setShowWeightMenu] = useState(false);

  if (!element) return null;

  const currentStyle = element.style || {};
  const currentContent = element.content || {};

  const activeColor = currentStyle.line_color || '#a8b0c0';
  const startArrow = currentStyle.start_arrow || 'none';
  const endArrow = currentStyle.end_arrow === undefined ? 'arrow' : currentStyle.end_arrow;
  const isDashed = Boolean(currentStyle.is_dashed);
  const showLabel = Boolean(currentContent.show_label || (currentContent.label && currentContent.label.trim().length > 0));
  const activeWeight = currentStyle.line_weight || 2;

  const handleColorSelect = (color: string) => {
    onStyleChange(element.id, { ...currentStyle, line_color: color });
  };

  const handleWeightSelect = (weight: number) => {
    onStyleChange(element.id, { ...currentStyle, line_weight: weight });
    setShowWeightMenu(false);
  };

  return (
    <aside className="milanote-sub-sidebar" style={{ position: 'relative', overflow: 'visible' }}>
      {/* Top Close Back Arrow */}
      <button 
        className="sub-sidebar-btn" 
        onClick={() => { setShowColorMenu(false); setShowWeightMenu(false); onClose(); }} 
        title="Deselect Line (Return to Toolbar)"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* COLOR ACTION BUTTON */}
      <div style={{ width: '100%', position: 'relative' }}>
        <button 
          className={`note-action-btn ${showColorMenu ? 'active' : ''}`}
          onClick={() => { setShowColorMenu(!showColorMenu); setShowWeightMenu(false); }}
          title="Change line color"
        >
          <div className="note-action-icon-wrap">
            <div style={{ 
              width: '18px', 
              height: '16px', 
              borderRadius: '3px', 
              backgroundColor: activeColor,
              border: '1px solid rgba(255, 255, 255, 0.4)'
            }} />
          </div>
          <span className="note-action-label">Color</span>
        </button>

        {/* FLOATING COLOR SWATCH POPUP DRAWER */}
        {showColorMenu && (
          <div className="color-menu-drawer" onClick={(e) => e.stopPropagation()} style={{ top: '0px', left: '64px' }}>
            <div className="color-swatches-grid-main">
              {CLASSIC_STRIP_COLORS.map((col, idx) => {
                const isSelected = activeColor === col;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: '#353c48', border: 'none', padding: 0, cursor: 'pointer' }}
                    onPointerDown={(e) => { e.stopPropagation(); handleColorSelect(col); }}
                    onClick={() => handleColorSelect(col)}
                    title={col}
                  >
                    <div className="color-swatch-top-strip-preview" style={{ backgroundColor: col, height: '100%' }} />
                  </button>
                );
              })}
            </div>

            <div className="color-menu-divider" style={{ margin: '12px -14px 12px -14px' }} />

            <div className="color-swatches-grid-main" style={{ marginBottom: '10px' }}>
              {PASTEL_STRIP_COLORS.map((col, idx) => {
                const isSelected = activeColor === col;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: '#353c48', border: 'none', padding: 0, cursor: 'pointer' }}
                    onPointerDown={(e) => { e.stopPropagation(); handleColorSelect(col); }}
                    onClick={() => handleColorSelect(col)}
                    title={col}
                  >
                    <div className="color-swatch-top-strip-preview" style={{ backgroundColor: col, height: '100%' }} />
                  </button>
                );
              })}
            </div>

            <label className="custom-color-btn" title="Choose any custom color...">
              <div className="rainbow-circle-icon" />
              <span>Custom color...</span>
              <input 
                type="color" 
                style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0 }}
                value={activeColor.startsWith('#') && activeColor.length === 7 ? activeColor : '#a8b0c0'}
                onChange={(e) => handleColorSelect(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {/* START ARROW TOGGLE */}
      <button 
        className={`note-action-btn ${startArrow === 'arrow' ? 'active' : ''}`}
        onClick={() => {
          setShowColorMenu(false);
          setShowWeightMenu(false);
          onStyleChange(element.id, { ...currentStyle, start_arrow: startArrow === 'arrow' ? 'none' : 'arrow' });
        }}
        title="Toggle Start Arrow"
      >
        <div className="note-action-icon-wrap">
          <ArrowLeft size={16} />
        </div>
        <span className="note-action-label">Start</span>
      </button>

      {/* END ARROW TOGGLE */}
      <button 
        className={`note-action-btn ${endArrow === 'arrow' ? 'active' : ''}`}
        onClick={() => {
          setShowColorMenu(false);
          setShowWeightMenu(false);
          onStyleChange(element.id, { ...currentStyle, end_arrow: endArrow === 'arrow' ? 'none' : 'arrow' });
        }}
        title="Toggle End Arrow"
      >
        <div className="note-action-icon-wrap">
          <ArrowRight size={16} />
        </div>
        <span className="note-action-label">End</span>
      </button>

      {/* LABEL TOGGLE */}
      <button 
        className={`note-action-btn ${showLabel ? 'active' : ''}`}
        onClick={() => {
          setShowColorMenu(false);
          setShowWeightMenu(false);
          const nextShow = !showLabel;
          onContentChange(element.id, { ...currentContent, show_label: nextShow, label: nextShow ? (currentContent.label || 'Label') : '' });
        }}
        title="Toggle Text Label on Line"
      >
        <div className="note-action-icon-wrap">
          <Tag size={16} />
        </div>
        <span className="note-action-label">Label</span>
      </button>

      {/* DASHED TOGGLE */}
      <button 
        className={`note-action-btn ${isDashed ? 'active' : ''}`}
        onClick={() => {
          setShowColorMenu(false);
          setShowWeightMenu(false);
          onStyleChange(element.id, { ...currentStyle, is_dashed: !isDashed });
        }}
        title="Toggle Dashed vs Solid Line"
      >
        <div className="note-action-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round">
            <line x1="3" y1="15" x2="15" y2="3" />
          </svg>
        </div>
        <span className="note-action-label">Dashed</span>
      </button>

      {/* WEIGHT SELECTOR BUTTON */}
      <div style={{ width: '100%', position: 'relative' }}>
        <button 
          className={`note-action-btn ${showWeightMenu ? 'active' : ''}`}
          onClick={() => { setShowWeightMenu(!showWeightMenu); setShowColorMenu(false); }}
          title="Change line thickness"
        >
          <div className="note-action-icon-wrap">
            <Menu size={16} />
          </div>
          <span className="note-action-label">Weight</span>
        </button>

        {/* FLOATING WEIGHT DRAWER */}
        {showWeightMenu && (
          <div className="weight-menu-drawer" onClick={(e) => e.stopPropagation()}>
            {/* Thin (2px) */}
            <button
              className={`weight-option-btn ${activeWeight === 2 ? 'active' : ''}`}
              onClick={() => handleWeightSelect(2)}
              title="Thin line weight (2px)"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="5" y1="19" x2="19" y2="5" />
              </svg>
            </button>
            {/* Medium (4px) */}
            <button
              className={`weight-option-btn ${activeWeight === 4 ? 'active' : ''}`}
              onClick={() => handleWeightSelect(4)}
              title="Medium line weight (4px)"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                <line x1="5" y1="19" x2="19" y2="5" />
              </svg>
            </button>
            {/* Thick (6px) */}
            <button
              className={`weight-option-btn ${activeWeight === 6 ? 'active' : ''}`}
              onClick={() => handleWeightSelect(6)}
              title="Thick line weight (6px)"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round">
                <line x1="5" y1="19" x2="19" y2="5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* TRASH BOTTOM BUTTON */}
      <button 
        className="sub-sidebar-btn trash-bottom" 
        style={{ flexDirection: 'column', gap: '2px', height: '48px', marginTop: 'auto' }}
        onClick={() => { setShowColorMenu(false); setShowWeightMenu(false); onDelete(); onClose(); }} 
        title="Delete line element"
      >
        <Trash2 size={18} />
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '-0.2px' }}>Trash</span>
      </button>
    </aside>
  );
};
