import React, { useState } from 'react';
import { Element, CardColorTint, CARD_COLORS, TableSubTarget } from '../types';
import { Check, ChevronRight } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  canvasX?: number;
  canvasY?: number;
  element: Element | null;
  onClose: () => void;
  onRecolor?: (tint: CardColorTint) => void;
  onDuplicate?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onMoveToUnsorted?: () => void;
  onDelete?: () => void;
  onToggleLock?: () => void;
  onConvertToBoard?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: (x?: number, y?: number) => void;
  onSelectAll?: () => void;
  onSpawnTool?: (tool: any, x: number, y: number) => void;
  onChangeBackground?: (color: string) => void;
  canPaste?: boolean;
  tableSubTarget?: TableSubTarget;
  onContentChange?: (id: string, newContent: Record<string, any>) => void;
  onCreateBoardShortcut?: (id: string) => void;
}

const BOARD_BACKGROUND_THEMES = [
  { label: 'Default Charcoal', color: 'rgb(35, 35, 35)' },
  { label: 'Pitch Black', color: '#0e0e11' },
  { label: 'Deep Navy', color: '#111823' },
  { label: 'Warm Mocha', color: '#231e1c' },
  { label: 'Slate Grey', color: '#2a2e37' },
  { label: 'Forest Moss', color: '#17211b' },
];

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  canvasX = 0,
  canvasY = 0,
  element,
  onClose,
  onRecolor = () => {},
  onDuplicate = () => {},
  onBringToFront = () => {},
  onSendToBack = () => {},
  onMoveToUnsorted = () => {},
  onDelete = () => {},
  onToggleLock = () => {},
  onConvertToBoard = () => {},
  onCut = () => {},
  onCopy = () => {},
  onPaste = () => {},
  onSelectAll = () => {},
  onSpawnTool = () => {},
  onChangeBackground = () => {},
  canPaste = false,
  tableSubTarget,
  onContentChange,
  onCreateBoardShortcut,
}) => {
  const [showBgSubmenu, setShowBgSubmenu] = useState(false);
  const [showAlignSubmenu, setShowAlignSubmenu] = useState(false);

  const menuWidth = 260;
  const menuEstimatedHeight = element ? 520 : 540;
  const clampedX = Math.max(16, Math.min(x, window.innerWidth - menuWidth - 20));
  const clampedY = Math.max(16, Math.min(y, window.innerHeight - menuEstimatedHeight - 20));

  const handleSpawn = (tool: string) => {
    onSpawnTool(tool, canvasX, canvasY);
    onClose();
  };

  // SPECIALIZED TABLE COMPONENT CONTEXT MENU
  if (element && element.element_type === 'table' && tableSubTarget && onContentChange) {
    const content = element.content || {};
    const cells: Record<number, any> = { ...(content.cells || {}) };
    const cellStyles: Record<number, any> = { ...(content.cellStyles || {}) };
    const cellTypes: Record<number, any> = { ...(content.cellTypes || {}) };
    const curCols = content.columns || 4;
    const curRows = content.rows || 4;
    
    const firstCellIdx = tableSubTarget.cellIndices?.[0] || 1;
    const tRow = tableSubTarget.rowIndex !== undefined ? tableSubTarget.rowIndex : Math.floor((firstCellIdx - 1) / curCols);
    const tCol = tableSubTarget.colIndex !== undefined ? tableSubTarget.colIndex : ((firstCellIdx - 1) % curCols);

    const handleInsertRow = (atRow: number) => {
      const newRows = curRows + 1;
      const newCells: Record<number, any> = {};
      const newStyles: Record<number, any> = {};
      const newTypes: Record<number, any> = {};

      Object.keys(cells).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        const newR = r >= atRow ? r + 1 : r;
        newCells[newR * curCols + c + 1] = cells[idx];
      });
      Object.keys(cellStyles).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        const newR = r >= atRow ? r + 1 : r;
        newStyles[newR * curCols + c + 1] = cellStyles[idx];
      });
      Object.keys(cellTypes).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        const newR = r >= atRow ? r + 1 : r;
        newTypes[newR * curCols + c + 1] = cellTypes[idx];
      });

      const rowHeights = Array.isArray(content.rowHeights) ? [...content.rowHeights] : Array(curRows).fill(38);
      rowHeights.splice(atRow, 0, 38);

      onContentChange(element.id, { ...content, rows: newRows, rowHeights, cells: newCells, cellStyles: newStyles, cellTypes: newTypes });
      onClose();
    };

    const handleInsertCol = (atCol: number) => {
      const newCols = curCols + 1;
      const newCells: Record<number, any> = {};
      const newStyles: Record<number, any> = {};
      const newTypes: Record<number, any> = {};

      Object.keys(cells).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        const newC = c >= atCol ? c + 1 : c;
        newCells[r * newCols + newC + 1] = cells[idx];
      });
      Object.keys(cellStyles).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        const newC = c >= atCol ? c + 1 : c;
        newStyles[r * newCols + newC + 1] = cellStyles[idx];
      });
      Object.keys(cellTypes).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        const newC = c >= atCol ? c + 1 : c;
        newTypes[r * newCols + newC + 1] = cellTypes[idx];
      });

      const colWidths = Array.isArray(content.colWidths) ? [...content.colWidths] : Array(curCols).fill(100);
      colWidths.splice(atCol, 0, 100);

      onContentChange(element.id, { ...content, columns: newCols, colWidths, cells: newCells, cellStyles: newStyles, cellTypes: newTypes });
      onClose();
    };

    const handleDeleteRow = (delRow: number) => {
      if (curRows <= 1) return onClose();
      const newRows = curRows - 1;
      const newCells: Record<number, any> = {};
      const newStyles: Record<number, any> = {};
      const newTypes: Record<number, any> = {};

      Object.keys(cells).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        if (r === delRow) return;
        const newR = r > delRow ? r - 1 : r;
        newCells[newR * curCols + c + 1] = cells[idx];
      });
      Object.keys(cellStyles).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        if (r === delRow) return;
        const newR = r > delRow ? r - 1 : r;
        newStyles[newR * curCols + c + 1] = cellStyles[idx];
      });
      Object.keys(cellTypes).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        if (r === delRow) return;
        const newR = r > delRow ? r - 1 : r;
        newTypes[newR * curCols + c + 1] = cellTypes[idx];
      });

      const rowHeights = Array.isArray(content.rowHeights) ? [...content.rowHeights] : Array(curRows).fill(38);
      rowHeights.splice(delRow, 1);

      onContentChange(element.id, { ...content, rows: newRows, rowHeights, cells: newCells, cellStyles: newStyles, cellTypes: newTypes });
      onClose();
    };

    const handleDeleteCol = (delCol: number) => {
      if (curCols <= 1) return onClose();
      const newCols = curCols - 1;
      const newCells: Record<number, any> = {};
      const newStyles: Record<number, any> = {};
      const newTypes: Record<number, any> = {};

      Object.keys(cells).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        if (c === delCol) return;
        const newC = c > delCol ? c - 1 : c;
        newCells[r * newCols + newC + 1] = cells[idx];
      });
      Object.keys(cellStyles).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        if (c === delCol) return;
        const newC = c > delCol ? c - 1 : c;
        newStyles[r * newCols + newC + 1] = cellStyles[idx];
      });
      Object.keys(cellTypes).forEach((k) => {
        const idx = parseInt(k, 10);
        if (isNaN(idx)) return;
        const r = Math.floor((idx - 1) / curCols);
        const c = (idx - 1) % curCols;
        if (c === delCol) return;
        const newC = c > delCol ? c - 1 : c;
        newTypes[r * newCols + newC + 1] = cellTypes[idx];
      });

      const colWidths = Array.isArray(content.colWidths) ? [...content.colWidths] : Array(curCols).fill(100);
      colWidths.splice(delCol, 1);

      onContentChange(element.id, { ...content, columns: newCols, colWidths, cells: newCells, cellStyles: newStyles, cellTypes: newTypes });
      onClose();
    };

    const handleApplyAlignment = (updates: Record<string, string>) => {
      const targetIndices = tableSubTarget.cellIndices && tableSubTarget.cellIndices.length > 0 
        ? tableSubTarget.cellIndices 
        : tableSubTarget.type === 'row' && tableSubTarget.rowIndex !== undefined
          ? Array.from({ length: curCols }, (_, c) => tableSubTarget.rowIndex! * curCols + c + 1)
          : tableSubTarget.type === 'column' && tableSubTarget.colIndex !== undefined
            ? Array.from({ length: curRows }, (_, r) => r * curCols + tableSubTarget.colIndex! + 1)
            : [firstCellIdx];

      const updatedStyles = { ...cellStyles };
      targetIndices.forEach((idx) => {
        updatedStyles[idx] = { ...(updatedStyles[idx] || {}), ...updates };
      });
      onContentChange(element.id, { ...content, cellStyles: updatedStyles });
      onClose();
    };

    const primaryStyle = cellStyles[firstCellIdx] || {};
    const alignX = primaryStyle.alignX || 'left';
    const alignY = primaryStyle.alignY || 'top';

    return (
      <>
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 999998 }} 
          onClick={onClose} 
          onContextMenu={(e) => { e.preventDefault(); onClose(); }} 
        />
        <div 
          className="context-menu-popup" 
          style={{ 
            position: 'fixed',
            left: clampedX, 
            top: clampedY,
            width: menuWidth,
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'visible',
            zIndex: 999999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sheet-drag-handle" />
          <div className="context-menu-item" onClick={() => { onCut(); onClose(); }}>
            <span>Cut</span>
          </div>
          <div className="context-menu-item" onClick={() => { onCopy(); onClose(); }}>
            <span>Copy</span>
          </div>
          <div className="context-menu-item" onClick={() => { onPaste(); onClose(); }}>
            <span>Paste</span>
          </div>

          <div className="context-menu-separator" />

          <div className="context-menu-item" onClick={() => handleInsertRow(tRow)}>
            <span>Add Row Above</span>
            <span className="shortcut-badge"><span className="key-cap">Alt</span><span className="key-cap">↑</span></span>
          </div>
          <div className="context-menu-item" onClick={() => handleInsertRow(tRow + 1)}>
            <span>Add Row Below</span>
            <span className="shortcut-badge"><span className="key-cap">Alt</span><span className="key-cap">↓</span></span>
          </div>

          <div className="context-menu-item" onClick={() => handleInsertCol(tCol)}>
            <span>Add Column Left</span>
            <span className="shortcut-badge"><span className="key-cap">Alt</span><span className="key-cap">←</span></span>
          </div>
          <div className="context-menu-item" onClick={() => handleInsertCol(tCol + 1)}>
            <span>Add Column Right</span>
            <span className="shortcut-badge"><span className="key-cap">Alt</span><span className="key-cap">→</span></span>
          </div>

          <div className="context-menu-separator" />

          <div className={`context-menu-item ${curRows <= 1 ? 'disabled' : 'danger'}`} onClick={() => handleDeleteRow(tRow)} style={curRows <= 1 ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
            <span>Delete Row</span>
          </div>
          <div className={`context-menu-item ${curCols <= 1 ? 'disabled' : 'danger'}`} onClick={() => handleDeleteCol(tCol)} style={curCols <= 1 ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
            <span>Delete Column</span>
          </div>

          <div className="context-menu-separator" />

          <div 
            className="context-menu-item submenu-trigger" 
            onMouseEnter={() => setShowAlignSubmenu(true)}
            onMouseLeave={() => setShowAlignSubmenu(false)}
            onClick={(e) => { e.stopPropagation(); setShowAlignSubmenu(!showAlignSubmenu); }}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span>Change Alignment...</span>
            <ChevronRight size={15} style={{ opacity: 0.6 }} />

            {showAlignSubmenu && (
              <div 
                className="context-menu-popup submenu context-submenu-popup" 
                style={{
                  position: 'absolute',
                  left: '100%',
                  top: '-4px',
                  width: '180px',
                  zIndex: 1000000,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  backgroundColor: 'rgb(77, 77, 77)',
                  borderRadius: 0,
                  border: '1px solid #3d424e',
                  overflow: 'hidden',
                  padding: '4px 0',
                }}
              >
                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleApplyAlignment({ alignX: 'left' }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Left</span>
                  {alignX === 'left' && <Check size={14} />}
                </div>
                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleApplyAlignment({ alignX: 'center' }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Center</span>
                  {alignX === 'center' && <Check size={14} />}
                </div>
                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleApplyAlignment({ alignX: 'right' }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Right</span>
                  {alignX === 'right' && <Check size={14} />}
                </div>

                <div className="context-menu-separator" />

                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleApplyAlignment({ alignY: 'top' }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Top</span>
                  {alignY === 'top' && <Check size={14} />}
                </div>
                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleApplyAlignment({ alignY: 'middle' }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Middle</span>
                  {alignY === 'middle' && <Check size={14} />}
                </div>
                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleApplyAlignment({ alignY: 'bottom' }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Bottom</span>
                  {alignY === 'bottom' && <Check size={14} />}
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // CANVAS CONTEXT MENU (When right-clicking on empty canvas)
  if (!element) {
    return (
      <>
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 999998 }} 
          onClick={onClose} 
          onContextMenu={(e) => { e.preventDefault(); onClose(); }} 
        />
        <div 
          className="context-menu-popup" 
          style={{ 
            position: 'fixed',
            left: clampedX, 
            top: clampedY,
            width: menuWidth,
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'visible',
            zIndex: 999999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sheet-drag-handle" />
          <div className="context-menu-item" onClick={() => { onSelectAll(); onClose(); }}>
            <span>Select All</span>
            <span className="shortcut-badge"><span className="key-cap">Ctrl</span><span className="key-cap">A</span></span>
          </div>
          {canPaste && (
            <div className="context-menu-item" onClick={() => { onPaste(canvasX, canvasY); onClose(); }}>
              <span>Paste</span>
              <span className="shortcut-badge"><span className="key-cap">Ctrl</span><span className="key-cap">V</span></span>
            </div>
          )}

          <div className="context-menu-separator" />

          <div className="context-menu-item" onClick={() => handleSpawn('note')}>
            <span>New Note</span>
          </div>
          <div className="context-menu-item" onClick={() => handleSpawn('link')}>
            <span>New Link</span>
          </div>
          <div className="context-menu-item" onClick={() => handleSpawn('task_list')}>
            <span>New To-do</span>
          </div>
          <div className="context-menu-item" onClick={() => handleSpawn('line')}>
            <span>New Line</span>
          </div>
          <div className="context-menu-item" onClick={() => handleSpawn('nested_board')}>
            <span>New Board</span>
          </div>
          <div className="context-menu-item" onClick={() => handleSpawn('column')}>
            <span>New Column</span>
          </div>
          <div className="context-menu-item" onClick={() => handleSpawn('comment')}>
            <span>New Comment</span>
          </div>
          <div className="context-menu-item" onClick={() => handleSpawn('table')}>
            <span>New Table</span>
          </div>

          <div className="context-menu-separator" />

          <div 
            className="context-menu-item"
            style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onMouseEnter={() => setShowBgSubmenu(true)}
            onMouseLeave={() => setShowBgSubmenu(false)}
            onClick={() => setShowBgSubmenu(!showBgSubmenu)}
          >
            <span>Change Board Background...</span>
            <span style={{ fontSize: '11px', opacity: 0.7 }}>►</span>

            {showBgSubmenu && (
              <div
                className="context-submenu-popup"
                style={{
                  position: 'absolute',
                  left: '100%',
                  top: '-4px',
                  width: '180px',
                  backgroundColor: 'rgb(77, 77, 77)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 0,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  padding: '4px 0',
                  zIndex: 1000000
                }}
              >
                {BOARD_BACKGROUND_THEMES.map((t) => (
                  <div
                    key={t.label}
                    className="context-menu-item"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeBackground(t.color);
                      onClose();
                    }}
                  >
                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: t.color, border: '1px solid #fff' }} />
                    <span style={{ fontSize: '13px' }}>{t.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="context-menu-separator" />

          <div className="context-menu-item" onClick={() => handleSpawn('image')}>
            <span>New Image/File Placeholder</span>
          </div>
        </div>
      </>
    );
  }

  // ELEMENT CONTEXT MENU (When right-clicking an existing element)
  const colorKeys = Object.keys(CARD_COLORS) as CardColorTint[];
  const isLocked = Boolean(element.style?.is_locked);

  return (
    <>
      <div 
        style={{ position: 'fixed', inset: 0, zIndex: 999998 }} 
        onClick={onClose} 
        onContextMenu={(e) => { e.preventDefault(); onClose(); }} 
      />
      
      <div 
        className="context-menu-popup" 
        style={{ 
          position: 'fixed',
          left: clampedX, 
          top: clampedY,
          width: menuWidth,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          zIndex: 999999
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-drag-handle" />
        <div className="color-palette-grid" style={{ display: 'flex', gap: '8px', padding: '10px 16px', justifyContent: 'center' }}>
          {colorKeys.map((colorKey) => {
            const swatch = CARD_COLORS[colorKey];
            const isCurrent = element.style?.color_tint === colorKey;
            return (
              <div
                key={colorKey}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: swatch.bg,
                  border: `2px solid ${isCurrent ? '#ffffff' : swatch.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.1s ease',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                }}
                onClick={() => { onRecolor(colorKey); onClose(); }}
                title={`Theme: ${swatch.name}`}
              />
            );
          })}
        </div>

        <div className="context-menu-separator" />

        <div className="context-menu-item" onClick={() => { onCut(); onClose(); }}>
          <span>Cut</span>
          <span className="shortcut-badge"><span className="key-cap">Ctrl</span><span className="key-cap">X</span></span>
        </div>
        <div className="context-menu-item" onClick={() => { onCopy(); onClose(); }}>
          <span>Copy</span>
          <span className="shortcut-badge"><span className="key-cap">Ctrl</span><span className="key-cap">C</span></span>
        </div>
        <div className="context-menu-item" onClick={() => { onDuplicate(); onClose(); }}>
          <span>Duplicate</span>
          <span className="shortcut-badge"><span className="key-cap">Ctrl</span><span className="key-cap">D</span></span>
        </div>
        <div className="context-menu-item danger" onClick={() => { onDelete(); onClose(); }}>
          <span>Move to Trash</span>
          <span className="shortcut-badge"><span className="key-cap">Backspace</span></span>
        </div>

        <div className="context-menu-separator" />

        <div className="context-menu-item" onClick={() => { onClose(); }}>
          <span>Rename</span>
          <span className="shortcut-badge"><span className="key-cap">Return</span></span>
        </div>

        <div className="context-menu-separator" />

        <div className="context-menu-item" onClick={() => { onToggleLock(); onClose(); }}>
          <span>{isLocked ? 'Unlock Position' : 'Lock Position'}</span>
        </div>

        <div className="context-menu-separator" />

        <div className="context-menu-item" onClick={() => { onBringToFront(); onClose(); }}>
          <span>Bring to Front</span>
        </div>
        <div className="context-menu-item" onClick={() => { onSendToBack(); onClose(); }}>
          <span>Send to Back</span>
        </div>

        <div className="context-menu-separator" />

        <div className="context-menu-item" onClick={() => { onConvertToBoard(); onClose(); }}>
          <span>Convert to Board</span>
        </div>
        {element.element_type === 'nested_board' && (
          <div className="context-menu-item" onClick={() => { onCreateBoardShortcut?.(element.id); onClose(); }}>
            <span>Create shortcut to this board</span>
          </div>
        )}

        <div className="context-menu-separator" />

        <div className="context-menu-footer" onClick={(e) => e.stopPropagation()}>
          <div className="creator-avatar">A</div>
          <div className="creator-info">
            <div>Created by you 3 weeks ago</div>
            <div className="creator-time">Last modified 1 minute ago</div>
          </div>
        </div>
      </div>
    </>
  );
};
