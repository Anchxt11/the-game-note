import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Trash2, Menu } from 'lucide-react';
import { generateKeyBetween } from 'fractional-indexing';
import { Element } from '../types';

export interface TaskItem {
  id: string;
  text: string;
  is_checked: boolean;
  order_index?: string;
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
  const lastPointerPosRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const elRef = useRef(el);
  elRef.current = el;
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const onDetachOrMergeTaskRef = useRef(onDetachOrMergeTask);
  onDetachOrMergeTaskRef.current = onDetachOrMergeTask;

  const cleanupListenersRef = useRef<(() => void) | null>(null);

  const endDragSession = useCallback(() => {
    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
      cleanupListenersRef.current = null;
    }
    document.body.style.cursor = '';
    document.querySelectorAll('.task-list-merge-target').forEach((target) => {
      target.classList.remove('task-list-merge-target');
    });
    dragRef.current = null;
    dropIndexRef.current = null;
    setActiveDragId(null);
    setDropIndex(null);
  }, []);

  useEffect(() => {
    return () => {
      endDragSession();
    };
  }, [endDragSession]);

  const handleItemStart = (e: React.PointerEvent | React.MouseEvent, item: TaskItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0 || itemsRef.current.length <= 1) return;
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

    lastPointerPosRef.current = { clientX: e.clientX, clientY: e.clientY };
    portalPosRef.current = {
      x: rect.left,
      y: rect.top,
    };

    dropIndexRef.current = null;
    setDropIndex(null);

    const onPointerMove = (ev: PointerEvent | MouseEvent) => {
      if (!dragRef.current) return;
      lastPointerPosRef.current = { clientX: ev.clientX, clientY: ev.clientY };

      const { itemId: curItemId, startX, startY, offsetX: offX, offsetY: offY } = dragRef.current;
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);

      if (!dragRef.current.hasExceededThreshold && dist < 6) {
        return;
      }

      if (!dragRef.current.hasExceededThreshold) {
        dragRef.current.hasExceededThreshold = true;
        setActiveDragId(curItemId);
        document.body.style.cursor = 'grabbing';
      }

      const currentLeft = ev.clientX - offX;
      const currentTop = ev.clientY - offY;
      portalPosRef.current = { x: currentLeft, y: currentTop };

      if (portalPreviewRef.current) {
        portalPreviewRef.current.style.transform = `translate(${Math.round(currentLeft)}px, ${Math.round(currentTop)}px)`;
      }

      const cardEl = containerRef.current?.closest('.milanote-card') || containerRef.current;
      let isOutside = true;
      if (cardEl) {
        const cardRect = cardEl.getBoundingClientRect();
        if (
          ev.clientX >= cardRect.left &&
          ev.clientX <= cardRect.right &&
          ev.clientY >= cardRect.top &&
          ev.clientY <= cardRect.bottom
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

        const elementsUnder = document.elementsFromPoint ? document.elementsFromPoint(ev.clientX, ev.clientY) : [];
        let foundOtherCard: HTMLElement | null = null;
        for (const elem of elementsUnder) {
          const cardWrapper = elem.closest('.milanote-card.task-list-card-wrapper') as HTMLElement | null;
          if (cardWrapper && cardWrapper.id && cardWrapper.id !== `milanote-el-${elRef.current.id}`) {
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

        const curItems = itemsRef.current;
        const nonDraggedItems = curItems.filter((it) => it.id !== curItemId);
        let targetIdx = nonDraggedItems.length;

        for (let i = 0; i < nonDraggedItems.length; i++) {
          const childDiv = document.getElementById(`milanote-task-item-${nonDraggedItems[i].id}`);
          if (childDiv) {
            const r = childDiv.getBoundingClientRect();
            const midY = r.top + r.height / 2;
            if (ev.clientY < midY) {
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
    };

    const onPointerUp = (ev: PointerEvent | MouseEvent) => {
      const clientX = ev.clientX !== undefined && ev.clientX !== 0 ? ev.clientX : lastPointerPosRef.current.clientX;
      const clientY = ev.clientY !== undefined && ev.clientY !== 0 ? ev.clientY : lastPointerPosRef.current.clientY;

      const curDrag = dragRef.current;
      const targetDropIndex = dropIndexRef.current;

      endDragSession();

      if (!curDrag || !curDrag.hasExceededThreshold) return;

      const curItems = itemsRef.current;
      const draggedItem = curItems.find((x) => x.id === curDrag.itemId);
      if (!draggedItem) return;

      const currentEl = elRef.current;
      const cardEl = containerRef.current?.closest('.milanote-card') || containerRef.current;
      let releasedOutside = true;
      if (cardEl && clientX !== undefined && clientY !== undefined) {
        const rect = cardEl.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          releasedOutside = false;
        }
      }

      if (releasedOutside) {
        if (onDetachOrMergeTaskRef.current) {
          onDetachOrMergeTaskRef.current(currentEl.id, draggedItem, clientX, clientY);
        }
      } else if (targetDropIndex !== null) {
        const nonDragged = curItems.filter((x) => x.id !== curDrag.itemId);
        const prevKey = targetDropIndex > 0 ? (nonDragged[targetDropIndex - 1]?.order_index || null) : null;
        const nextKey = targetDropIndex < nonDragged.length ? (nonDragged[targetDropIndex]?.order_index || null) : null;
        let newOrderIndex: string;
        try {
          newOrderIndex = generateKeyBetween(prevKey, nextKey);
        } catch {
          newOrderIndex = 'a0';
        }
        const updatedDragged = { ...draggedItem, order_index: newOrderIndex };
        const newItems = [
          ...nonDragged.slice(0, targetDropIndex),
          updatedDragged,
          ...nonDragged.slice(targetDropIndex),
        ];
        onContentChangeRef.current(currentEl.id, { ...currentEl.content, items: newItems });
      }
    };

    const removeListeners = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
    };

    cleanupListenersRef.current = removeListeners;

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    window.addEventListener('pointercancel', onPointerUp, { passive: false });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
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
          onClick={(e) => {
            if (isEditing) {
              e.stopPropagation();
            } else {
              onSetEditingElement(el.id);
            }
          }}
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
                onClick={(e) => {
                  if (isEditing) {
                    e.stopPropagation();
                  } else {
                    onSetEditingElement(el.id);
                  }
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextId = Date.now().toString();
                    const lastKey = items.length > 0 ? (items[items.length - 1]?.order_index || null) : null;
                    let newKey: string;
                    try {
                      newKey = generateKeyBetween(lastKey, null);
                    } catch {
                      newKey = 'a0';
                    }
                    const newItems = [...items, { id: nextId, text: '', is_checked: false, order_index: newKey }];
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
            transform: `translate(${Math.round(portalPosRef.current.x)}px, ${Math.round(portalPosRef.current.y)}px)`,
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
