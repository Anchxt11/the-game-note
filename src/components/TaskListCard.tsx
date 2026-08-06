import React, { useState, useRef, useCallback } from 'react';
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

  const dragRef = useRef<TaskDragState | null>(null);
  const dropIndexRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;

    const { itemId, startX, startY, offsetX, offsetY, origWidth } = dragRef.current;
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);

    if (!dragRef.current.hasExceededThreshold && dist < 8) {
      return;
    }

    if (!dragRef.current.hasExceededThreshold) {
      dragRef.current.hasExceededThreshold = true;
      setActiveDragId(itemId);
    }

    const elDiv = document.getElementById(`milanote-task-item-${itemId}`);
    if (elDiv) {
      const containerEl = elDiv.parentElement;
      if (containerEl) {
        const containerRect = containerEl.getBoundingClientRect();
        const scale = containerRect.width / (containerEl.offsetWidth || 1);
        const left = (e.clientX - containerRect.left) / scale - offsetX;
        const top = (e.clientY - containerRect.top) / scale - offsetY;

        elDiv.style.position = 'absolute';
        elDiv.style.left = `${left}px`;
        elDiv.style.top = `${top}px`;
        elDiv.style.width = `${origWidth}px`;
        elDiv.style.zIndex = '999999';
      }
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

    dropIndexRef.current = targetIdx;
    setDropIndex(targetIdx);
  }, [items]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);

    if (!dragRef.current) return;
    const { itemId, hasExceededThreshold } = dragRef.current;
    dragRef.current = null;
    setActiveDragId(null);

    const elDiv = document.getElementById(`milanote-task-item-${itemId}`);
    if (elDiv) {
      elDiv.style.position = '';
      elDiv.style.left = '';
      elDiv.style.top = '';
      elDiv.style.width = '';
      elDiv.style.zIndex = '';
    }

    if (hasExceededThreshold) {
      const draggedItem = items.find((x) => x.id === itemId);
      const cardDiv = document.getElementById(`milanote-el-${el.id}`);
      let releasedOutside = false;
      if (cardDiv && e && e.clientX !== undefined && e.clientY !== undefined) {
        const rect = cardDiv.getBoundingClientRect();
        if (e.clientX < rect.left - 20 || e.clientX > rect.right + 20 || e.clientY < rect.top - 20 || e.clientY > rect.bottom + 20) {
          releasedOutside = true;
        }
      }

      if (releasedOutside && draggedItem && onDetachOrMergeTask && e) {
        onDetachOrMergeTask(el.id, draggedItem, e.clientX, e.clientY);
      } else if (dropIndexRef.current !== null && draggedItem) {
        const nonDragged = items.filter((x) => x.id !== itemId);
        const insertIdx = dropIndexRef.current;
        const newItems = [
          ...nonDragged.slice(0, insertIdx),
          draggedItem,
          ...nonDragged.slice(insertIdx),
        ];
        onContentChange(el.id, { ...el.content, items: newItems });
      }
    }

    dropIndexRef.current = null;
    setDropIndex(null);
  }, [handleMouseMove, items, el.id, el.content, onContentChange, onDetachOrMergeTask]);

  const handleItemMouseDown = (e: React.MouseEvent, item: TaskItem) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.button !== 0 || items.length <= 1) return;

    const targetEl = (e.currentTarget as HTMLElement).closest('.checklist-item') as HTMLElement || (e.currentTarget as HTMLElement);
    const rect = targetEl.getBoundingClientRect();
    const scale = rect.width / (targetEl.offsetWidth || 1);
    const offsetX = (e.clientX - rect.left) / scale;
    const offsetY = (e.clientY - rect.top) / scale;

    dragRef.current = {
      itemId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      offsetX,
      offsetY,
      origWidth: rect.width,
      hasExceededThreshold: false,
    };

    dropIndexRef.current = null;
    setDropIndex(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const isDragActive = Boolean(activeDragId && dragRef.current?.hasExceededThreshold);

  return (
    <div className="checklist-container" style={{ position: 'relative' }} onDoubleClick={(e) => { e.stopPropagation(); onSetEditingElement(el.id); }}>
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
      {(() => {
        if (!isDragActive) {
          return items.map((item, index) => (
            <div
              key={item.id}
              id={`milanote-task-item-${item.id}`}
              className="checklist-item"
            >
              <div
                className={item.is_checked ? 'checklist-checkbox-checked' : 'checklist-checkbox-empty'}
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
                onMouseDown={(e) => {
                  if (isEditing) {
                    e.stopPropagation();
                  }
                }}
              />
              <div className="checklist-item-actions">
                {item.is_checked && (
                  <button
                    type="button"
                    className="checklist-task-delete-btn"
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
                  <div className="checklist-task-drag-handle" title="Drag to reorder" onMouseDown={(e) => handleItemMouseDown(e, item)}>
                    <Menu size={15} />
                  </div>
                )}
              </div>
            </div>
          ));
        }

        const childNodes: React.ReactNode[] = [];
        let nonDragIdx = 0;

        items.forEach((item, index) => {
          const isCurrentDragging = item.id === activeDragId;

          if (!isCurrentDragging) {
            if (dropIndex === nonDragIdx) {
              childNodes.push(<div key={`task-ind-${nonDragIdx}`} className="task-insertion-indicator" />);
            }
            childNodes.push(
              <div
                key={item.id}
                id={`milanote-task-item-${item.id}`}
                className="checklist-item"
              >
                <div
                  className={item.is_checked ? 'checklist-checkbox-checked' : 'checklist-checkbox-empty'}
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
                  onMouseDown={(e) => {
                    if (isEditing) {
                      e.stopPropagation();
                    }
                  }}
                />
                <div className="checklist-item-actions">
                  {item.is_checked && (
                    <button
                      type="button"
                      className="checklist-task-delete-btn"
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
                    <div className="checklist-task-drag-handle" title="Drag to reorder" onMouseDown={(e) => handleItemMouseDown(e, item)}>
                      <Menu size={15} />
                    </div>
                  )}
                </div>
              </div>
            );
            nonDragIdx++;
          } else {
            childNodes.push(
              <div
                key={item.id}
                id={`milanote-task-item-${item.id}`}
                className="checklist-item dragging-task"
                style={{ position: 'absolute', zIndex: 999999, width: dragRef.current?.origWidth }}
                onMouseDown={(e) => handleItemMouseDown(e, item)}
              >
                <div className={item.is_checked ? 'checklist-checkbox-checked' : 'checklist-checkbox-empty'}>
                  {item.is_checked && '✓'}
                </div>
                <input
                  type="text"
                  className={`checklist-item-text ${item.is_checked ? 'checked-text' : ''}`}
                  value={item.text}
                  readOnly
                  placeholder="Add a task..."
                />
                <div className="checklist-item-actions">
                  {item.is_checked && (
                    <button
                      type="button"
                      className="checklist-task-delete-btn"
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Delete task"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                  {items.length > 1 && (
                    <div className="checklist-task-drag-handle" title="Drag to reorder">
                      <Menu size={15} />
                    </div>
                  )}
                </div>
              </div>
            );
          }
        });

        if (dropIndex !== null && dropIndex >= nonDragIdx) {
          childNodes.push(<div key="task-ind-end" className="task-insertion-indicator" />);
        }

        return childNodes;
      })()}
    </div>
  );
};
