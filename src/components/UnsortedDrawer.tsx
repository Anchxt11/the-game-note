import React, { useState, useRef } from 'react';
import { Element, ToolType } from '../types';
import { Folder, ArrowLeft, X } from 'lucide-react';

interface UnsortedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  unsortedElements: Element[];
  onMoveToCanvas: (element: Element, clientX: number, clientY: number) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onSelectElement: (id: string) => void;
  selectedElementId: string | null;
  selectedIds?: string[];
  onMultiSelect?: (ids: string[]) => void;
  onDropNewTool?: (tool: ToolType) => void;
  renderElement: (el: Element, onMouseDown: (e: React.MouseEvent, el: Element) => void) => React.ReactNode;
}

export const UnsortedDrawer: React.FC<UnsortedDrawerProps> = ({
  isOpen,
  onClose,
  unsortedElements,
  onMoveToCanvas,
  onReorder,
  onSelectElement,
  selectedElementId,
  selectedIds = [],
  onMultiSelect,
  onDropNewTool,
  renderElement,
}) => {
  const [draggedEl, setDraggedEl] = useState<{ element: Element; startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null);
  const dropInsertIndexRef = useRef<number | null>(null);
  const dragTargetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Marquee Selection state
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent, el: Element) => {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'))) {
      if (selectedElementId !== el.id && !selectedIds.includes(el.id)) {
        onSelectElement(el.id);
      }
      return;
    }

    if (e.shiftKey && onMultiSelect) {
      if (selectedIds.includes(el.id)) {
        onMultiSelect(selectedIds.filter(id => id !== el.id));
      } else {
        onMultiSelect([...selectedIds, el.id]);
      }
    } else if (!selectedIds.includes(el.id)) {
      onSelectElement(el.id);
      if (onMultiSelect) onMultiSelect([el.id]);
    }

    setDraggedEl({
      element: el,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setDraggedEl(prev => prev ? { ...prev, currentX: moveEvent.clientX, currentY: moveEvent.clientY } : null);

      const dx = moveEvent.clientX - e.clientX;
      const dy = moveEvent.clientY - e.clientY;
      if (Math.sqrt(dx * dx + dy * dy) > 15) {
        if (containerRef.current && moveEvent.clientX >= containerRef.current.getBoundingClientRect().left) {
          const cards = document.querySelectorAll('.unsorted-item-card-wrap');
          let foundTargetId: string | null = null;
          let foundIdx: number | null = null;

          cards.forEach((domEl, idx) => {
            const rect = domEl.getBoundingClientRect();
            if (moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom) {
              const id = domEl.getAttribute('data-id');
              if (id && id !== el.id) {
                foundTargetId = id;
                const mid = rect.top + rect.height / 2;
                foundIdx = moveEvent.clientY < mid ? idx : idx + 1;
              }
            }
          });
          dragTargetIdRef.current = foundTargetId;
          dropInsertIndexRef.current = foundIdx;
          setDropInsertIndex(foundIdx);
        } else {
          dragTargetIdRef.current = null;
          dropInsertIndexRef.current = null;
          setDropInsertIndex(null);
        }
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const dx = upEvent.clientX - e.clientX;
      const dy = upEvent.clientY - e.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 15) {
        if (containerRef.current && upEvent.clientX < containerRef.current.getBoundingClientRect().left) {
          onMoveToCanvas(el, upEvent.clientX, upEvent.clientY);
        } else if (dragTargetIdRef.current) {
          onReorder(el.id, dragTargetIdRef.current);
        }
      }
      setDraggedEl(null);
      dragTargetIdRef.current = null;
      dropInsertIndexRef.current = null;
      setDropInsertIndex(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Marquee rubber band selection inside drawer
  const handleDrawerEmptyMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.unsorted-item-card-wrap')) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    const containerEl = e.currentTarget;
    const rect = containerEl.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top + containerEl.scrollTop;

    setSelectionBox({ startX, startY, currentX: startX, currentY: startY });
    onSelectElement(null as any);
    if (onMultiSelect) onMultiSelect([]);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (moveEvent.buttons === 0) {
        handleMouseUp();
        return;
      }
      const currentX = moveEvent.clientX - rect.left;
      const currentY = moveEvent.clientY - rect.top + containerEl.scrollTop;
      setSelectionBox(prev => prev ? { ...prev, currentX, currentY } : null);

      const minX = Math.min(startX, currentX);
      const maxX = Math.max(startX, currentX);
      const minY = Math.min(startY, currentY);
      const maxY = Math.max(startY, currentY);

      const cards = containerEl.querySelectorAll('.unsorted-item-card-wrap');
      const selected: string[] = [];
      cards.forEach((card) => {
        const cRect = card.getBoundingClientRect();
        const cardTop = cRect.top - rect.top + containerEl.scrollTop;
        const cardLeft = cRect.left - rect.left;
        const cardBottom = cardTop + cRect.height;
        const cardRight = cardLeft + cRect.width;

        if (cardLeft < maxX && cardRight > minX && cardTop < maxY && cardBottom > minY) {
          const id = card.getAttribute('data-id');
          if (id) selected.push(id);
        }
      });
      if (onMultiSelect) {
        onMultiSelect(selected);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setSelectionBox(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const isDragActive = Boolean(draggedEl && Math.sqrt((draggedEl.currentX - draggedEl.startX) ** 2 + (draggedEl.currentY - draggedEl.startY) ** 2) > 15);

  return (
    <>
      {/* Ghost draggable preview when pulling an item onto the canvas */}
      {isDragActive && draggedEl && (
        <div
          style={{
            position: 'fixed',
            left: draggedEl.currentX - 140,
            top: draggedEl.currentY - 20,
            width: 280,
            pointerEvents: 'none',
            zIndex: 9999999,
            boxShadow: '0 12px 28px rgba(0,0,0,0.5)',
            opacity: 0.95,
          }}
        >
          {renderElement(draggedEl.element, () => {})}
        </div>
      )}

      {/* Mobile Backdrop for bottom sheet mode */}
      <div
        className="mobile-unsorted-backdrop"
        onClick={onClose}
      />

      <aside
        ref={containerRef}
        className="unsorted-drawer"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 'var(--unsorted-drawer-width, 340px)',
          maxWidth: '100vw',
          height: '100%',
          backgroundColor: 'rgb(33, 33, 33)',
          borderLeft: '1px solid rgb(51, 51, 51)',
          zIndex: 5,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'none',
          userSelect: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const toolId = e.dataTransfer.getData('application/milanote-tool') as ToolType || (window as any).__MILANOTE_DRAGGED_TOOL__;
          if (toolId && toolId !== 'line' && onDropNewTool) {
            onDropNewTool(toolId);
          }
        }}
      >
        {/* Header */}
        <div
          className="unsorted-drawer-header"
          style={{
            height: '52px',
            borderBottom: '1px solid rgb(51, 51, 51)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            padding: '0 16px',
            flexShrink: 0,
            background: 'rgb(38, 38, 38)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="drawer-mobile-back-btn"
              onClick={onClose}
              title="Back to board"
            >
              <ArrowLeft size={18} />
            </button>
            <Folder className="drawer-header-folder-icon" size={18} color="#aaa" />
            <span style={{ color: '#fff', fontSize: '15px', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
              Unsorted {unsortedElements.length > 0 ? `(${unsortedElements.length})` : ''}
            </span>
          </div>
          <button
            onClick={onClose}
            className="drawer-close-btn"
            style={{
              background: 'none',
              border: 'none',
              color: '#999',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: '4px',
              transition: 'color 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minHeight: '36px',
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#999')}
          >
            <span>Close</span>
            <X size={16} />
          </button>
        </div>

        {/* Body / Item List with Marquee selection */}
        <div
          onMouseDown={handleDrawerEmptyMouseDown}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            position: 'relative',
          }}
        >
          {selectionBox && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                height: Math.abs(selectionBox.currentY - selectionBox.startY),
                border: '1px solid rgba(255, 255, 255, 0.85)',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                pointerEvents: 'none',
                zIndex: 100,
              }}
            />
          )}

          {unsortedElements.length === 0 ? (
            <div
              style={{
                margin: 'auto 0',
                textAlign: 'center',
                color: 'rgb(140, 140, 140)',
                fontSize: '13.5px',
                lineHeight: '1.5',
                padding: '40px 20px',
              }}
            >
              A place to put things while you decide where they should go
            </div>
          ) : (
            (() => {
              const nodes: React.ReactNode[] = [];
              let idxCounter = 0;

              unsortedElements.forEach((el) => {
                const isThisDragging = isDragActive && draggedEl?.element.id === el.id;

                if (isDragActive && dropInsertIndex === idxCounter && !isThisDragging) {
                  nodes.push(<div key={`drop-line-${idxCounter}`} className="column-insertion-indicator" style={{ margin: '2px 0' }} />);
                }

                if (!isThisDragging) {
                  idxCounter++;
                }

                nodes.push(
                  <div
                    key={el.id}
                    data-id={el.id}
                    className="unsorted-item-card-wrap"
                    style={{
                      opacity: isThisDragging ? 0.4 : 1,
                      width: '100%',
                      margin: 0,
                    }}
                  >
                    {renderElement(el, handleMouseDown)}
                  </div>
                );
              });

              if (isDragActive && dropInsertIndex !== null && dropInsertIndex >= idxCounter) {
                nodes.push(<div key="drop-line-end" className="column-insertion-indicator" style={{ margin: '2px 0' }} />);
              }

              return nodes;
            })()
          )}
        </div>
      </aside>
    </>
  );
};
