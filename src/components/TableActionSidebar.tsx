import React from 'react';
import { ArrowLeft, Tag, Smile, MessageSquarePlus, Trash2 } from 'lucide-react';
import { Element } from '../types';

interface TableActionSidebarProps {
  element: Element | null;
  onClose: () => void;
  onDelete: () => void;
  onContentChange: (id: string, newContent: Record<string, any>) => void;
  onAddCommentPin: (id: string) => void;
}

export const TableActionSidebar: React.FC<TableActionSidebarProps> = ({
  element,
  onClose,
  onDelete,
  onContentChange,
  onAddCommentPin
}) => {
  if (!element) return null;

  const showTitle = Boolean(element.content?.show_title);
  const showCaption = Boolean(element.content?.show_caption);

  return (
    <aside className="milanote-sub-sidebar" style={{ position: 'relative', overflow: 'visible' }}>
      {/* Top Close Back Arrow */}
      <button 
        className="sub-sidebar-btn" 
        onClick={onClose} 
        title="Deselect Table (Return to Toolbar)"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* LABELS BUTTON */}
      <button className="note-action-btn" title="Labels & Tags (Coming Soon)">
        <div className="note-action-icon-wrap">
          <Tag size={16} />
        </div>
        <span className="note-action-label">Labels</span>
      </button>

      {/* REACTIONS BUTTON */}
      <button className="note-action-btn" title="Reactions (Coming Soon)">
        <div className="note-action-icon-wrap">
          <Smile size={16} />
        </div>
        <span className="note-action-label">Reactions</span>
      </button>

      {/* COMMENT BUTTON */}
      <button 
        className="note-action-btn" 
        onClick={() => onAddCommentPin(element.id)} 
        title="Add comment"
      >
        <div className="note-action-icon-wrap">
          <MessageSquarePlus size={16} />
        </div>
        <span className="note-action-label">Comment</span>
      </button>

      {/* TITLE TOGGLE BUTTON */}
      <button 
        className={`note-action-btn ${showTitle ? 'active' : ''}`}
        onClick={() => {
          onContentChange(element.id, { ...element.content, show_title: !showTitle });
        }} 
        title={showTitle ? "Remove title" : "Add title"}
      >
        <div className="note-action-icon-wrap">
          <div style={{ width: '16px', height: '14px', backgroundColor: '#353b47', border: '1px solid #586072', borderRadius: '3px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '2px' }}>
            <div style={{ width: '10px', height: '2px', backgroundColor: '#ffffff', borderRadius: '1px' }} />
          </div>
        </div>
        <span className="note-action-label">Title</span>
      </button>

      {/* CAPTION TOGGLE BUTTON */}
      <button 
        className={`note-action-btn ${showCaption ? 'active' : ''}`}
        onClick={() => {
          onContentChange(element.id, { ...element.content, show_caption: !showCaption });
        }} 
        title={showCaption ? "Remove caption" : "Add caption"}
      >
        <div className="note-action-icon-wrap">
          <div style={{ width: '16px', height: '14px', backgroundColor: '#353b47', border: '1px solid #586072', borderRadius: '3px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '2px' }}>
            <div style={{ width: '10px', height: '2px', backgroundColor: '#ffffff', borderRadius: '1px', marginBottom: '1px' }} />
            <div style={{ width: '7px', height: '1.5px', backgroundColor: '#a0a8b8', borderRadius: '1px' }} />
          </div>
        </div>
        <span className="note-action-label">Caption</span>
      </button>

      {/* TRASH BOTTOM BUTTON */}
      <button 
        className="sub-sidebar-btn trash-bottom" 
        onClick={onDelete}
        title="Delete Table"
      >
        <Trash2 size={18} />
        <span>Trash</span>
      </button>
    </aside>
  );
};
