import React, { useState } from 'react';
import {
  ArrowLeft,
  Tag,
  Smile,
  MessageSquarePlus,
  Calendar,
  User,
  Trash2
} from 'lucide-react';
import { Element } from '../types';

interface TaskActionSidebarProps {
  element: Element | null;
  onClose: () => void;
  onDelete: () => void;
  onStyleChange: (id: string, newStyle: Record<string, any>) => void;
  onAddCommentPin: (taskId: string) => void;
  onToggleTitle: (taskId: string) => void;
  onSetDueDate: (taskId: string, dateStr: string | null) => void;
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

export const TaskActionSidebar: React.FC<TaskActionSidebarProps> = ({
  element,
  onClose,
  onDelete,
  onStyleChange,
  onAddCommentPin,
  onToggleTitle,
  onSetDueDate
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showDateMenu, setShowDateMenu] = useState(false);

  if (!element) return null;

  const currentStyle = element.style || {};
  const activeTopStrip = currentStyle.top_strip_color;
  const showTitle = Boolean(element.content?.show_title);
  const currentDueDate = element.content?.due_date || null;

  const handleColorSelect = (color: string) => {
    if (color === 'none') {
      const { top_strip_color, ...rest } = currentStyle;
      onStyleChange(element.id, rest);
    } else {
      onStyleChange(element.id, { ...currentStyle, top_strip_color: color });
    }
  };

  const setQuickDate = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    onSetDueDate(element.id, `${yyyy}-${mm}-${dd}`);
    setShowDateMenu(false);
  };

  return (
    <aside className="milanote-sub-sidebar" style={{ position: 'relative', overflow: 'visible' }}>
      {/* Top Close Back Arrow */}
      <button 
        className="sub-sidebar-btn" 
        onClick={() => { setShowColorMenu(false); setShowDateMenu(false); onClose(); }} 
        title="Deselect To-Do List (Return to Toolbar)"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* COLOR ACTION BUTTON */}
      <div style={{ width: '100%', position: 'relative' }}>
        <button 
          className={`note-action-btn ${showColorMenu ? 'active' : ''}`}
          onClick={() => { setShowDateMenu(false); setShowColorMenu(!showColorMenu); }}
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

        {/* FLOATING TOP STRIP COLOR POPUP DRAWER (SCREENSHOT 1 PARITY) */}
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

      {/* LABELS BUTTON (UI Stub) */}
      <button className="note-action-btn" title="Labels & Tags (Coming Soon)" onClick={() => { setShowColorMenu(false); setShowDateMenu(false); }}>
        <div className="note-action-icon-wrap">
          <Tag size={16} />
        </div>
        <span className="note-action-label">Labels</span>
      </button>

      {/* REACTIONS BUTTON (UI Stub) */}
      <button className="note-action-btn" title="Reactions (Coming Soon)" onClick={() => { setShowColorMenu(false); setShowDateMenu(false); }}>
        <div className="note-action-icon-wrap">
          <Smile size={16} />
        </div>
        <span className="note-action-label">Reactions</span>
      </button>

      {/* COMMENT BUTTON - DROPS A COMMENT PIN ON TO-DO LIST! */}
      <button 
        className="note-action-btn" 
        onClick={() => {
          setShowColorMenu(false);
          setShowDateMenu(false);
          onAddCommentPin(element.id);
        }} 
        title="Drop a comment pin onto this To-Do list"
      >
        <div className="note-action-icon-wrap">
          <MessageSquarePlus size={16} />
        </div>
        <span className="note-action-label">Comment</span>
      </button>

      {/* TITLE BUTTON - TOGGLES TITLE ON/OFF (SCREENSHOT 2 PARITY)! */}
      <button 
        className={`note-action-btn ${showTitle ? 'active' : ''}`}
        onClick={() => {
          setShowColorMenu(false);
          setShowDateMenu(false);
          onToggleTitle(element.id);
        }} 
        title={showTitle ? "Turn Title header off" : "Turn Title header on"}
      >
        <div className="note-action-icon-wrap">
          <div style={{ 
            width: '16px', 
            height: '14px', 
            borderRadius: '2px', 
            background: '#3f4654',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '2px', left: '2px', right: '2px', height: '3px', backgroundColor: '#ffffff', borderRadius: '1px' }} />
          </div>
        </div>
        <span className="note-action-label">Title</span>
      </button>

      {/* DUE DATE BUTTON - OPENS CALENDAR SCHEDULER! */}
      <div style={{ width: '100%', position: 'relative' }}>
        <button 
          className={`note-action-btn ${currentDueDate ? 'active' : ''} ${showDateMenu ? 'active' : ''}`}
          onClick={() => {
            setShowColorMenu(false);
            setShowDateMenu(!showDateMenu);
          }} 
          title={currentDueDate ? `Due on ${currentDueDate} (Click to change)` : "Set a Due Date"}
        >
          <div className="note-action-icon-wrap">
            <Calendar size={16} />
          </div>
          <span className="note-action-label">Due date</span>
        </button>

        {/* FLOATING DUE DATE SCHEDULER DRAWER */}
        {showDateMenu && (
          <div className="due-date-drawer" onClick={(e) => e.stopPropagation()} style={{ top: '-10px', left: '64px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#9fa8bd', marginBottom: '2px', paddingLeft: '2px' }}>
              Schedule Due Date
            </div>

            <button className="due-date-shortcut-btn" onClick={() => setQuickDate(0)}>
              <span>Today</span>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>+0d</span>
            </button>
            <button className="due-date-shortcut-btn" onClick={() => setQuickDate(1)}>
              <span>Tomorrow</span>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>+1d</span>
            </button>
            <button className="due-date-shortcut-btn" onClick={() => setQuickDate(7)}>
              <span>Next Week</span>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>+7d</span>
            </button>

            <div style={{ margin: '4px 0 2px 0', fontSize: '11px', color: '#858d9f', paddingLeft: '2px' }}>
              Custom Date
            </div>
            <input 
              type="date" 
              className="due-date-native-input"
              value={currentDueDate || ''} 
              onChange={(e) => {
                onSetDueDate(element.id, e.target.value || null);
                setShowDateMenu(false);
              }}
            />

            {currentDueDate && (
              <button 
                className="due-date-shortcut-btn" 
                style={{ marginTop: '4px', color: '#ff6666', justifyContent: 'center', fontWeight: 600 }}
                onClick={() => {
                  onSetDueDate(element.id, null);
                  setShowDateMenu(false);
                }}
              >
                Clear Due Date
              </button>
            )}
          </div>
        )}
      </div>

      {/* ASSIGN BUTTON (UI Stub) */}
      <button className="note-action-btn" title="Assign To-Do list to teammates (Coming Soon)" onClick={() => { setShowColorMenu(false); setShowDateMenu(false); }}>
        <div className="note-action-icon-wrap">
          <User size={16} />
        </div>
        <span className="note-action-label">Assign</span>
      </button>

      {/* TRASH BOTTOM BUTTON */}
      <button 
        className="sub-sidebar-btn trash-bottom" 
        style={{ flexDirection: 'column', gap: '2px', height: '48px', marginTop: 'auto' }}
        onClick={() => { setShowColorMenu(false); setShowDateMenu(false); onDelete(); onClose(); }} 
        title="Delete To-Do list element"
      >
        <Trash2 size={18} />
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '-0.2px' }}>Trash</span>
      </button>
    </aside>
  );
};
