import React, { useState } from 'react';
import {
  ArrowLeft,
  Tag,
  Smile,
  MessageSquarePlus,
  Edit2,
  Trash2,
  Contrast,
  Upload
} from 'lucide-react';
import { Element } from '../types';

interface ImageActionSidebarProps {
  element: Element | null;
  onClose: () => void;
  onDelete: () => void;
  onStyleChange: (id: string, newStyle: Record<string, any>) => void;
  onAddCommentPin: (imageId: string) => void;
  onToggleCaption: (imageId: string) => void;
  onUploadImage?: (file: File) => void;
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

export const ImageActionSidebar: React.FC<ImageActionSidebarProps> = ({
  element,
  onClose,
  onDelete,
  onStyleChange,
  onAddCommentPin,
  onToggleCaption,
  onUploadImage
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  if (!element) return null;

  const currentStyle = element.style || {};
  const activeTopStrip = currentStyle.top_strip_color;
  const showCaption = Boolean(element.content?.show_caption);

  const isPng = Boolean(
    element.content?.url && (
      element.content.url.toLowerCase().includes('png') ||
      element.content.url.toLowerCase().includes('webp') ||
      element.content.url.toLowerCase().includes('gif') ||
      element.content.url.startsWith('data:image/png') ||
      element.style?.is_transparent !== undefined ||
      element.content.url.includes('unsplash')
    )
  );
  const isTransparent = Boolean(currentStyle.is_transparent);

  const handleColorSelect = (color: string) => {
    if (color === 'none') {
      const { top_strip_color, ...rest } = currentStyle;
      onStyleChange(element.id, rest);
    } else {
      onStyleChange(element.id, { ...currentStyle, top_strip_color: color });
    }
  };

  return (
    <aside className="milanote-sub-sidebar" style={{ position: 'relative', overflow: 'visible' }}>
      {/* Top Close Back Arrow */}
      <button 
        className="sub-sidebar-btn" 
        onClick={() => { setShowColorMenu(false); onClose(); }} 
        title="Deselect Image (Return to Toolbar)"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUploadImage?.(file);
          }
        }}
      />

      {/* UPLOAD / REPLACE IMAGE ACTION BUTTON */}
      <button 
        className="note-action-btn"
        onClick={() => fileInputRef.current?.click()}
        title="Upload or replace image"
      >
        <div className="note-action-icon-wrap">
          <Upload size={18} />
        </div>
        <span className="note-action-label">Upload</span>
      </button>

      {/* COLOR ACTION BUTTON */}
      <div style={{ width: '100%', position: 'relative' }}>
        <button 
          className={`note-action-btn ${showColorMenu ? 'active' : ''}`}
          onClick={() => setShowColorMenu(!showColorMenu)}
          title="Change color strip"
        >
          <div className="note-action-icon-wrap">
            <div style={{ 
              width: '18px', 
              height: '16px', 
              borderRadius: '3px', 
              background: '#353c48',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {activeTopStrip ? (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px', backgroundColor: activeTopStrip }} />
              ) : (
                <div style={{ width: '24px', height: '2px', backgroundColor: '#f75454', transform: 'rotate(-35deg)', position: 'absolute' }} />
              )}
            </div>
          </div>
          <span className="note-action-label">Color</span>
        </button>

        {/* FLOATING TOP STRIP COLOR POPUP DRAWER */}
        {showColorMenu && (
          <div className="color-menu-drawer" onClick={(e) => e.stopPropagation()} style={{ top: '6px', left: '64px' }}>
            {/* Grid 1: Remove Slash & Classic Colors */}
            <div className="color-swatches-grid-main">
              <div 
                className={`color-swatch-box ${!activeTopStrip ? 'selected' : ''}`}
                style={{ backgroundColor: '#353c48' }}
                onClick={() => handleColorSelect('none')}
                title="Remove top strip"
              >
                <div className="color-swatch-none-slash" />
              </div>

              {CLASSIC_STRIP_COLORS.map((col, idx) => {
                const isSelected = activeTopStrip === col;
                return (
                  <div
                    key={idx}
                    className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: '#353c48' }}
                    onClick={() => handleColorSelect(col)}
                    title={col}
                  >
                    <div className="color-swatch-top-strip-preview" style={{ backgroundColor: col }} />
                  </div>
                );
              })}
            </div>

            <div className="color-menu-divider" style={{ margin: '12px -14px 12px -14px' }} />

            {/* Grid 2: Neutral Pastel Swatches */}
            <div className="color-swatches-grid-main" style={{ marginBottom: '10px' }}>
              {PASTEL_STRIP_COLORS.map((col, idx) => {
                const isSelected = activeTopStrip === col;
                return (
                  <div
                    key={idx}
                    className={`color-swatch-box ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: '#353c48' }}
                    onClick={() => handleColorSelect(col)}
                    title={col}
                  >
                    <div className="color-swatch-top-strip-preview" style={{ backgroundColor: col }} />
                  </div>
                );
              })}
            </div>

            {/* Custom Color Rainbow Button */}
            <label className="custom-color-btn" title="Choose any custom top strip color...">
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

      {/* LABELS BUTTON */}
      <button className="note-action-btn" title="Labels & Tags (Coming Soon)" onClick={() => setShowColorMenu(false)}>
        <div className="note-action-icon-wrap">
          <Tag size={16} />
        </div>
        <span className="note-action-label">Labels</span>
      </button>

      {/* REACTIONS BUTTON */}
      <button className="note-action-btn" title="Reactions (Coming Soon)" onClick={() => setShowColorMenu(false)}>
        <div className="note-action-icon-wrap">
          <Smile size={16} />
        </div>
        <span className="note-action-label">Reactions</span>
      </button>

      {/* COMMENT BUTTON - DROPS A COMMENT PIN ON IMAGE! */}
      <button 
        className="note-action-btn" 
        onClick={() => {
          setShowColorMenu(false);
          onAddCommentPin(element.id);
        }} 
        title="Drop a comment pin onto this image"
      >
        <div className="note-action-icon-wrap">
          <MessageSquarePlus size={16} />
        </div>
        <span className="note-action-label">Comment</span>
      </button>

      {/* DRAW ON BUTTON */}
      <button 
        className="note-action-btn" 
        onClick={() => {
          setShowColorMenu(false);
        }} 
        title="Draw on image (Coming Soon)"
      >
        <div className="note-action-icon-wrap">
          <Edit2 size={16} />
        </div>
        <span className="note-action-label">Draw on</span>
      </button>

      {/* CAPTION TOGGLE BUTTON - TURNS CAPTION ON/OFF! */}
      <button 
        className={`note-action-btn ${showCaption ? 'active' : ''}`}
        onClick={() => {
          setShowColorMenu(false);
          onToggleCaption(element.id);
        }} 
        title={showCaption ? "Turn caption off" : "Turn caption on"}
      >
        <div className="note-action-icon-wrap">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <div style={{ width: '14px', height: '8px', backgroundColor: '#586072', borderRadius: '2px' }} />
            <div style={{ width: '14px', height: '2px', backgroundColor: '#ffffff', borderRadius: '1px' }} />
            <div style={{ width: '10px', height: '1.5px', backgroundColor: '#a0a8b8', borderRadius: '1px' }} />
          </div>
        </div>
        <span className="note-action-label">Caption</span>
      </button>

      {/* TRANSPARENT TOGGLE BUTTON - FOR PNG IMAGES ONLY */}
      {isPng && (
        <button 
          className={`note-action-btn ${isTransparent ? 'active' : ''}`}
          onClick={() => {
            setShowColorMenu(false);
            onStyleChange(element.id, { ...currentStyle, is_transparent: !isTransparent });
          }} 
          title={isTransparent ? "Turn background transparency off" : "Turn background transparency on"}
        >
          <div className="note-action-icon-wrap">
            <Contrast size={16} />
          </div>
          <span className="note-action-label">Transparent</span>
        </button>
      )}

      {/* TRASH BOTTOM BUTTON */}
      <button 
        className="sub-sidebar-btn trash-bottom" 
        style={{ flexDirection: 'column', gap: '2px', height: '48px', marginTop: 'auto' }}
        onClick={() => { setShowColorMenu(false); onDelete(); onClose(); }} 
        title="Delete image element"
      >
        <Trash2 size={18} />
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '-0.2px' }}>Trash</span>
      </button>
    </aside>
  );
};
