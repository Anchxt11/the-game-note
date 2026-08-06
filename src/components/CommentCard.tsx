import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Element } from '../types';

interface CommentCardProps {
  el: Element;
  elements: Element[];
  isDragging?: boolean;
  isSelected?: boolean;
  onContentChange: (id: string, newContent: Record<string, any>) => void;
}

export const CommentCard: React.FC<CommentCardProps> = ({
  el,
  elements,
  isDragging,
  isSelected,
  onContentChange,
}) => {
  const [draft, setDraft] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  
  const hoverTimeRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const messages = Array.isArray(el.content?.messages) ? el.content.messages : [];
  const isPinned = Boolean(el.content?.is_pinned) && !el.style?.is_unsorted;
  const showInputBox = messages.length === 0 || isReplying;

  useEffect(() => {
    if (isSelected && isPinned) {
      setIsExpanded(true);
    }
  }, [isSelected, isPinned]);

  useEffect(() => {
    if (!isExpanded) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isExpanded]);

  // Real-time physical DOM intersection test to reliably detect overlap during mouse drags or rest
  const findIntersectingCardDom = useCallback((): Element | null => {
    const myDom = document.getElementById(`milanote-el-${el.id}`);
    if (!myDom) return null;
    const myRect = myDom.getBoundingClientRect();
    const myCenterX = myRect.left + myRect.width / 2;
    const myCenterY = myRect.top + myRect.height / 2;
    const myTopLeftX = myRect.left + (isPinned ? 12 : 30);
    const myTopLeftY = myRect.top + (isPinned ? 14 : 20);

    for (const other of elements) {
      if (other.id === el.id || other.element_type === 'comment' || other.element_type === 'connector' || other.element_type === 'nested_board' || other.id === el.style?.parent_column_id) {
        continue;
      }
      const otherDom = document.getElementById(`milanote-el-${other.id}`);
      if (!otherDom) continue;
      const otherRect = otherDom.getBoundingClientRect();
      
      const centerInside = myCenterX >= otherRect.left && myCenterX <= otherRect.right && myCenterY >= otherRect.top && myCenterY <= otherRect.bottom;
      const cornerInside = myTopLeftX >= otherRect.left && myTopLeftX <= otherRect.right && myTopLeftY >= otherRect.top && myTopLeftY <= otherRect.bottom;

      if (centerInside || cornerInside) {
        return other;
      }
    }
    return null;
  }, [el.id, elements, isPinned]);

  // Poll every 200ms to monitor live hover duration over target cards on the canvas
  useEffect(() => {
    if (el.style?.is_unsorted) return;
    const interval = setInterval(() => {
      const targetCard = findIntersectingCardDom();
      if (!isPinned) {
        if (targetCard) {
          if (hoverTargetId !== targetCard.id) {
            setHoverTargetId(targetCard.id);
            hoverTimeRef.current = 0;
          }
          hoverTimeRef.current = (hoverTimeRef.current || 0) + 200;
          if (hoverTimeRef.current >= 600) {
            // Hovered for 0.6 seconds over a card! Transform into blue teardrop pin drop!
            onContentChange(el.id, {
              ...el.content,
              is_pinned: true,
              pin_target_id: targetCard.id,
              rel_x: Math.max(5, el.x - targetCard.x),
              rel_y: Math.max(5, el.y - targetCard.y),
            });
            hoverTimeRef.current = 0;
            setHoverTargetId(null);
          }
        } else {
          hoverTimeRef.current = 0;
          if (hoverTargetId !== null) setHoverTargetId(null);
        }
      } else if (isDragging) {
        // Unpin if user drags pin drop out into empty canvas space for > 400ms
        if (!targetCard) {
          hoverTimeRef.current = (hoverTimeRef.current || 0) + 200;
          if (hoverTimeRef.current >= 400) {
            onContentChange(el.id, {
              ...el.content,
              is_pinned: false,
              pin_target_id: null,
              rel_x: 0,
              rel_y: 0,
            });
            setIsExpanded(false);
            hoverTimeRef.current = 0;
          }
        } else {
          hoverTimeRef.current = 0;
          if (targetCard.id !== el.content?.pin_target_id) {
            onContentChange(el.id, {
              ...el.content,
              pin_target_id: targetCard.id,
              rel_x: Math.max(5, el.x - targetCard.x),
              rel_y: Math.max(5, el.y - targetCard.y),
            });
          }
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isPinned, isDragging, el.id, el.x, el.y, el.content, findIntersectingCardDom, onContentChange, hoverTargetId]);

  const handleSend = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!draft.trim()) return;
    const newMsg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      author: 'A',
      text: draft.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    const nextMessages = [...messages, newMsg];
    onContentChange(el.id, { ...el.content, messages: nextMessages });
    setDraft('');
    setIsReplying(false);
  };

  const handleSaveEdit = (msgId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!editText.trim()) return;
    const nextMessages = messages.map((msg: any) => 
      msg.id === msgId ? { ...msg, text: editText.trim(), edited: true } : msg
    );
    onContentChange(el.id, { ...el.content, messages: nextMessages });
    setEditingMsgId(null);
    setEditText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      if (messages.length > 0) setIsReplying(false);
    }
  };

  const renderMessageList = () => (
    <div className="comment-messages-list">
      {messages.map((msg: any) => (
        <div key={msg.id} className="comment-message-item">
          <div className="comment-avatar-circle" style={{ width: 28, height: 28, fontSize: 13 }}>
            {msg.author || 'A'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexGrow: 1 }}>
            {editingMsgId === msg.id ? (
              <div className="comment-edit-row">
                <input
                  type="text"
                  className="comment-edit-field"
                  value={editText}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit(msg.id);
                    } else if (e.key === 'Escape') {
                      setEditingMsgId(null);
                    }
                  }}
                  autoFocus
                />
                <button className="comment-action-btn-primary" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => handleSaveEdit(msg.id, e)} type="button">
                  Save
                </button>
                <button className="comment-action-btn" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setEditingMsgId(null); }} type="button">
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="comment-message-bubble">
                  {msg.text}
                </div>
                <div className="comment-actions-bar">
                  <span
                    className="comment-action-link"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingMsgId(msg.id);
                      setEditText(msg.text || '');
                    }}
                    title="Edit comment"
                  >
                    Edit
                  </span>
                  <span className="comment-action-divider">•</span>
                  <span
                    className="comment-action-link"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsReplying(true);
                      setTimeout(() => {
                        if (inputRef.current) inputRef.current.focus();
                      }, 50);
                    }}
                    title="Reply to comment thread"
                  >
                    Reply
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const renderInputRow = () => (
    <div className="comment-input-row">
      <div className="comment-avatar-circle">A</div>
      <div className="comment-input-box-container">
        <input
          ref={inputRef}
          type="text"
          className="comment-input-field"
          placeholder="Write a comment..."
          value={draft}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="comment-send-btn" onMouseDown={(e) => e.stopPropagation()} onClick={handleSend} type="button">
          Send
        </button>
      </div>
    </div>
  );

  if (isPinned) {
    return (
      <div style={{ position: 'relative' }} ref={containerRef}>
        <div
          className="comment-pin-marker"
          onClick={(e) => {
            e.stopPropagation();
            if (!isDragging) {
              setIsExpanded((prev) => !prev);
            }
          }}
          title={isExpanded ? 'Click to collapse comment thread' : `Comment Pin (${messages.length} replies). Click to open`}
        >
          <div className="comment-pin-svg-wrap">
            <svg viewBox="0 0 36 42" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
              <path
                d="M18 0C8.05888 0 0 8.05888 0 18C0 27.9411 18 42 18 42C18 42 36 27.9411 36 18C36 8.05888 27.9411 0 18 0Z"
                fill={el.style?.pin_color || "#2b73f8"}
              />
            </svg>
          </div>
          <div className="comment-pin-badge">
            {messages.length}
          </div>
        </div>

        {isExpanded && (
          <div className="comment-popover-wrapper">
            <div className="comment-popover-arrow" />
            <div className="comment-popover-body">
              {messages.length > 0 && renderMessageList()}
              {showInputBox && renderInputRow()}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. STANDALONE COMMENT BOX MODE (Photo 1 Parity)
  return (
    <div className="comment-card-standalone" style={{ position: 'relative', overflow: 'hidden' }}>
      {el.style?.top_strip_color && (
        <div className="note-top-strip-bar" style={{ backgroundColor: el.style.top_strip_color }} />
      )}
      {messages.length > 0 && renderMessageList()}
      {showInputBox && renderInputRow()}
    </div>
  );
};
