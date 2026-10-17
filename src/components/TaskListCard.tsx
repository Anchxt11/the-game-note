import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Trash2, Menu } from 'lucide-react';
import { Element } from '../types';

interface TaskItem {
  id: string;
  text: string;
  is_checked: boolean;
}

interface TaskListCardProps {
  el: Element;
  isEditing: boolean;
  onContentChange: (id: string, newContent: Record<string, any>) => void;
  onSetEditingElement: (id: string | null) => void;
  onDetachOrMergeTask?: (sourceElId: string, item: TaskItem, clientX: number, clientY: number) => void;
  isMergeTarget?: boolean;
  onDeleteElement?: (id: string) => void;
}

interface TaskDragState {
  itemId: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  origWidth: number;
  hasExceededThreshold: boolean;
}

export const TaskListCard: React.FC<TaskListCardProps> = ({
  el,
  isEditing,
  onContentChange,
  onSetEditingElement,
  onDetachOrMergeTask,
  isMergeTarget = false,
  onDeleteElement,
}) => {
  const items = (el.content.items || []) as Array<TaskItem>;

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<TaskDragState | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const portalPreviewRef = useRef<HTMLDivElement | null>(null);
  const portalPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handlePointerMove = useCallback((e: PointerEvent | MouseEvent) => {
    if (!dragRef.current) return;

    const { itemId, startX, startY, offsetX, offsetY } = dragRef.current;
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);

    if (!dragRef.current.hasExceededThreshold && dist < 6) {
      return;
    }

    if (!dragRef.current.hasExceededThreshold) {
      dragRef.current.hasExceededThreshold = true;
      setActiveDragId(itemId);
      document.body.style.cursor = 'grabbing';
    }

    const currentLeft = e.clientX - offsetX;
    const currentTop = e.clientY - offsetY;
    portalPosRef.current = { x: currentLeft, y: currentTop };

    if (portalPreviewRef.current) {
      portalPreviewRef.current.style.transform = `translate3d(${currentLeft}px, ${currentTop}px, 0)`;
    }

    const cardEl = containerRef.current?.closest('.milanote-card') || containerRef.current;
    let isOutside = true;
    if (cardEl) {
      const cardRect = cardEl.getBoundingClientRect();
      if (
        e.clientX >= cardRect.left &&
        e.clientX <= cardRect.right &&
        e.clientY >= cardRect.top &&
        e.clientY <= cardRect.bottom
      ) {
        isOutside = false;
      }
    }

    const prevHighlight = document.querySelector('.task-list-merge-target');
    if (isOutside) {
      if (dropIndexRef.current !== null) {
        dropIndexRef.current = null;
        setDropIndex(null);
      }

      const elementsUnder = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [];
      let foundOtherCard: HTMLElement | null = null;
      for (const elem of elementsUnder) {
        const cardWrapper = elem.closest('.milanote-card.task-list-card-wrapper') as HTMLElement | null;
        if (cardWrapper && cardWrapper.id && cardWrapper.id !== `milanote-el-${el.id}`) {
          foundOtherCard = cardWrapper;
          break;
        }
      }

      if (prevHighlight && prevHighlight !== foundOtherCard) {
        prevHighlight.classList.remove('task-list-merge-target');
      }
      if (foundOtherCard && !foundOtherCard.classList.contains('task-list-merge-target')) {
        foundOtherCard.classList.add('task-list-merge-target');
      }
    } else {
      if (prevHighlight) {
        prevHighlight.classList.remove('task-list-merge-target');
      }

      const nonDraggedItems = items.filter((item) => item.id !== itemId);
      let targetIdx = nonDraggedItems.length;

      for (let i = 0; i < nonDraggedItems.length; i++) {
        const childDiv = document.getElementById(`milanote-task-item-${nonDraggedItems[i].id}`);
        if (childDiv) {
          const rect = childDiv.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) {
            targetIdx = i;
            break;
          }
        }
      }

      if (dropIndexRef.current !== targetIdx) {
        dropIndexRef.current = targetIdx;
        setDropIndex(targetIdx);
      }
    }
  }, [items, el.id]);

  const handlePointerUp = useCallback((e: PointerEvent | MouseEvent) => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
    window.removeEventListener('mousemove', handlePointerMove);
    window.removeEventListener('mouseup', handlePointerUp);

    document.body.style.cursor = '';
    document.querySelectorAll('.task-list-merge-target').forEach((target) => {
      target.classList.remove('task-list-merge-target');
    });

    if (!dragRef.current) return;
    const { itemId, hasExceededThreshold } = dragRef.current;
    const targetDropIndex = dropIndexRef.current;
    dragRef.current = null;
    dropIndexRef.current = null;
    setActiveDragId(null);
    setDropIndex(null);

    if (!hasExceededThreshold) return;

    const draggedItem = items.find((x) => x.id === itemId);
    if (!draggedItem) return;

    const cardEl = containerRef.current?.closest('.milanote-card') || containerRef.current;
    let releasedOutside = true;
    if (cardEl && e.clientX !== undefined && e.clientY !== undefined) {
      const rect = cardEl.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        releasedOutside = false;
      }
    }

    if (releasedOutside) {
      if (onDetachOrMergeTask) {
        onDetachOrMergeTask(el.id, draggedItem, e.clientX, e.clientY);
      }
    } else if (targetDropIndex !== null) {
      const nonDragged = items.filter((x) => x.id !== itemId);
      const newItems = [
        ...nonDragged.slice(0, targetDropIndex),
        draggedItem,
        ...nonDragged.slice(targetDropIndex),
      ];
      onContentChange(el.id, { ...el.content, items: newItems });
    }
  }, [handlePointerMove, items, el.id, el.content, onContentChange, onDetachOrMergeTask]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      document.body.style.cursor = '';
      document.querySelectorAll('.task-list-merge-target').forEach((target) => {
        target.classList.remove('task-list-merge-target');
      });
    };
  }, [handlePointerMove, handlePointerUp]);

  const handleItemStart = (e: React.PointerEvent | React.MouseEvent, item: TaskItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0 || items.length <= 1) return;
    if (dragRef.current) return;

    const targetEl = (e.currentTarget as HTMLElement).closest('.checklist-item') as HTMLElement || (e.currentTarget as HTMLElement);
    const rect = targetEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    dragRef.current = {
      itemId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      offsetX,
      offsetY,
      origWidth: rect.width,
      hasExceededThreshold: false,
    };

    portalPosRef.current = {
      x: rect.left,
      y: rect.top,
    };

    dropIndexRef.current = null;
    setDropIndex(null);

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp, { passive: false });
    window.addEventListener('pointercancel', handlePointerUp, { passive: false });
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
  };

  const isDragActive = Boolean(activeDragId && dragRef.current?.hasExceededThreshold);
  const draggedItem = items.find((x) => x.id === activeDragId);

  return (
    <div
      ref={containerRef}
      className="checklist-container"
      style={{ position: 'relative' }}
      onDoubleClick={(e) => { e.stopPropagation(); onSetEditingElement(el.id); }}
    >
      {isMergeTarget && (
        <div className="checklist-merge-banner">
          <span>Release to merge tasks here</span>
        </div>
      )}
      {el.content?.show_title && (
        <input
          type="text"
          className="checklist-title-input"
          value={el.content?.title !== undefined ? el.content.title : 'New To-do List'}
          readOnly={!isEditing}
          onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }}
          onMouseDown={(e) => { if (isEditing) e.stopPropagation(); }}
          onChange={(e) => onContentChange(el.id, { ...el.content, title: e.target.value })}
          placeholder="New To-do List"
        />
      )}
      {el.content?.due_date && (
        <div className="checklist-due-badge">
          <Calendar size={13} color="#abb3c6" />
          <span>Due {el.content.due_date}</span>
        </div>
      )}
      {items.map((item, index) => {
        const isCurrentDragging = item.id === activeDragId;
        const nonDragIdx = items.filter((x, idx) => idx < index && x.id !== activeDragId).length;

        return (
          <React.Fragment key={item.id}>
            {isDragActive && dropIndex === nonDragIdx && (
              <div key={`task-ind-${nonDragIdx}`} className="task-insertion-indicator" />
            )}
            <div
              id={`milanote-task-item-${item.id}`}
              className={`checklist-item ${isCurrentDragging ? 'checklist-item-drag-placeholder' : ''}`}
              style={isCurrentDragging ? { opacity: 0.25, pointerEvents: 'none' } : undefined}
            >
              <div
                className={item.is_checked ? 'checklist-checkbox-checked' : 'checklist-checkbox-empty'}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const copy = [...items];
                  copy[index] = { ...copy[index], is_checked: !copy[index].is_checked };
                  onContentChange(el.id, { ...el.content, items: copy });
                }}
              >
                {item.is_checked && '✓'}
              </div>
              <input
                type="text"
                className={`checklist-item-text ${item.is_checked ? 'checked-text' : ''}`}
                value={item.text}
                readOnly={!isEditing}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index] = { ...copy[index], text: e.target.value };
                  onContentChange(el.id, { ...el.content, items: copy });
                }}
                placeholder="Add a task..."
                onPointerDown={(e) => {
                  if (isEditing) e.stopPropagation();
                }}
                onMouseDown={(e) => {
                  if (isEditing) e.stopPropagation();
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextId = Date.now().toString();
                    const newItems = [...items, { id: nextId, text: '', is_checked: false }];
                    onContentChange(el.id, { ...el.content, items: newItems });
                  } else if (e.key === 'Backspace' && item.text === '' && items.length > 0) {
                    e.preventDefault();
                    const newItems = items.filter((_, idx) => idx !== index);
                    if (newItems.length === 0 && onDeleteElement) {
                      onDeleteElement(el.id);
                    } else {
                      onContentChange(el.id, { ...el.content, items: newItems });
                    }
                  }
                }}
              />
              <div className="checklist-item-actions">
                {item.is_checked && (
                  <button
                    type="button"
                    className="checklist-task-delete-btn"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const copy = items.filter((_, idx) => idx !== index);
                      if (copy.length === 0 && onDeleteElement) {
                        onDeleteElement(el.id);
                      } else {
                        onContentChange(el.id, { ...el.content, items: copy });
                      }
                    }}
                    title="Delete task"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                {items.length > 1 && (
                  <div
                    className="checklist-task-drag-handle"
                    title="Drag to reorder or detach"
                    onPointerDown={(e) => handleItemStart(e, item)}
                    onMouseDown={(e) => handleItemStart(e, item)}
                  >
                    <Menu size={15} />
                  </div>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {isDragActive && dropIndex !== null && dropIndex >= items.filter(x => x.id !== activeDragId).length && (
        <div key="task-ind-end" className="task-insertion-indicator" />
      )}

      {isDragActive && draggedItem && typeof document !== 'undefined' && createPortal(
        <div
          ref={portalPreviewRef}
          className="checklist-item dragging-task-portal"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            transform: `translate3d(${portalPosRef.current.x}px, ${portalPosRef.current.y}px, 0)`,
            width: `${dragRef.current?.origWidth || 320}px`,
            zIndex: 10000000,
            pointerEvents: 'none',
            backgroundColor: '#25272e',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '4px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65), 0 2px 6px rgba(0, 0, 0, 0.4)',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#ffffff',
            boxSizing: 'border-box',
          }}
        >
          <div className={draggedItem.is_checked ? 'checklist-checkbox-checked' : 'checklist-checkbox-empty'}>
            {draggedItem.is_checked && '✓'}
          </div>
          <span
            className={`checklist-item-text ${draggedItem.is_checked ? 'checked-text' : ''}`}
            style={{
              flex: 1,
              color: draggedItem.is_checked ? '#7a8190' : '#ffffff',
              textDecoration: draggedItem.is_checked ? 'line-through' : 'none',
              fontSize: '14px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {draggedItem.text || 'Add a task...'}
          </span>
          <div className="checklist-task-drag-handle" style={{ color: '#abb3c6' }}>
            <Menu size={15} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
