import React, { useState } from 'react';
import { X, Plus, FileText, CheckSquare, ArrowRight } from 'lucide-react';
import { Element } from '../types';

interface UnsortedTrayProps {
  isOpen: boolean;
  onClose: () => void;
  unsortedElements: Element[];
  onCreateUnsorted: (type: 'note' | 'task_list', content: string) => void;
  onMoveToCanvas: (element: Element) => void;
}

export const UnsortedTray: React.FC<UnsortedTrayProps> = ({
  isOpen,
  onClose,
  unsortedElements,
  onCreateUnsorted,
  onMoveToCanvas,
}) => {
  const [newNoteText, setNewNoteText] = useState('');

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    onCreateUnsorted('note', newNoteText.trim());
    setNewNoteText('');
  };

  return (
    <aside className={`unsorted-tray ${isOpen ? '' : 'closed'}`}>
      <div className="tray-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          Unsorted Notes ({unsortedElements.length})
        </span>
        <button className="header-btn icon-only" onClick={onClose} title="Close Tray">
          <X size={18} />
        </button>
      </div>

      <div className="tray-body">
        <form onSubmit={handleQuickAdd} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            type="text"
            placeholder="Quick add note..."
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--milanote-border)',
              borderRadius: '6px',
              padding: '8px 10px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            className="unsorted-btn"
            style={{ padding: '6px 10px', background: 'var(--milanote-accent)' }}
            title="Add to Unsorted"
          >
            <Plus size={16} />
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {unsortedElements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--milanote-text-muted)', fontSize: '13px' }}>
              No unsorted notes! Type above to save quick ideas before positioning them on your board.
            </div>
          ) : (
            unsortedElements.map((el) => {
              const contentText = el.content.text || el.content.title || 'Untitled note';
              return (
                <div 
                  key={el.id}
                  style={{
                    background: 'var(--milanote-card-bg)',
                    border: '1px solid var(--milanote-border)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--milanote-text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', fontWeight: '700', fontSize: '10px' }}>
                      {el.element_type === 'task_list' ? <CheckSquare size={13} /> : <FileText size={13} />}
                      {el.element_type}
                    </span>
                    <button 
                      className="header-btn" 
                      style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--milanote-accent)' }}
                      onClick={() => onMoveToCanvas(el)}
                      title="Place onto current board canvas"
                    >
                      <span>Place</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                  <p style={{ fontSize: '13px', lineHeight: 1.4, color: 'var(--milanote-text-primary)' }}>
                    {contentText}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
};
