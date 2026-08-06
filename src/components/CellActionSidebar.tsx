import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Trash2, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  Check,
  ChevronRight
} from 'lucide-react';
import { Element } from '../types';

interface CellActionSidebarProps {
  element: Element | null;
  selectedCells: number[];
  onClose: () => void;
  onContentChange: (id: string, newContent: Record<string, any>) => void;
}

export const CellActionSidebar: React.FC<CellActionSidebarProps> = ({
  element,
  selectedCells,
  onClose,
  onContentChange
}) => {
  const [activeMenu, setActiveMenu] = useState<'textStyle' | 'cellType' | 'color' | 'formula' | 'alignment' | null>(null);

  if (!element || selectedCells.length === 0) return null;

  const content = element.content || {};
  const cellStyles: Record<number, any> = { ...(content.cellStyles || {}) };
  const cellTypes: Record<number, any> = { ...(content.cellTypes || {}) };
  const cells: Record<number, any> = { ...(content.cells || {}) };

  // Helper to apply style updates to all currently selected cells
  const applyStyleToSelectedCells = (styleUpdates: Record<string, any>) => {
    const updatedStyles = { ...cellStyles };
    selectedCells.forEach((idx) => {
      updatedStyles[idx] = { ...(updatedStyles[idx] || {}), ...styleUpdates };
    });
    onContentChange(element.id, { ...content, cellStyles: updatedStyles });
  };

  // Helper to apply cell type to all selected cells
  const applyTypeToSelectedCells = (type: string) => {
    const updatedTypes = { ...cellTypes };
    selectedCells.forEach((idx) => {
      updatedTypes[idx] = { ...(updatedTypes[idx] || {}), type };
    });
    onContentChange(element.id, { ...content, cellTypes: updatedTypes });
    setActiveMenu(null);
  };

  // Helper to set formula in primary selected cell
  const insertFormula = (formulaStr: string) => {
    const targetIdx = selectedCells[0] || 1;
    cells[targetIdx] = formulaStr;
    onContentChange(element.id, { ...content, cells });
    setActiveMenu(null);
  };

  // Add column function (insert column next to/right of selected cell without shifting contents)
  const handleAddColumn = () => {
    const currentCols = content.columns || 4;
    const currentRows = content.rows || 4;
    const newCols = currentCols + 1;
    
    const targetIdx = selectedCells[0] || 1;
    const targetCol = ((targetIdx - 1) % currentCols) + 1;

    const newCells: Record<number, any> = {};
    const newStyles: Record<number, any> = {};
    const newTypes: Record<number, any> = {};

    Object.keys(cells).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newC = c <= targetCol ? c : c + 1;
      const newIdx = (r - 1) * newCols + newC;
      newCells[newIdx] = cells[oldIdx];
    });

    Object.keys(cellStyles).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newC = c <= targetCol ? c : c + 1;
      const newIdx = (r - 1) * newCols + newC;
      newStyles[newIdx] = cellStyles[oldIdx];
    });

    Object.keys(cellTypes).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newC = c <= targetCol ? c : c + 1;
      const newIdx = (r - 1) * newCols + newC;
      newTypes[newIdx] = cellTypes[oldIdx];
    });

    const colWidths = Array.isArray(content.colWidths) ? [...content.colWidths] : Array(currentCols).fill(100);
    const targetWidth = colWidths[targetCol - 1] || 100;
    colWidths.splice(targetCol, 0, targetWidth);

    onContentChange(element.id, { 
      ...content, 
      columns: newCols,
      colWidths,
      cells: newCells,
      cellStyles: newStyles,
      cellTypes: newTypes
    });
  };

  // Add row function (insert row below selected cell without shifting contents)
  const handleAddRow = () => {
    const currentCols = content.columns || 4;
    const currentRows = content.rows || 4;
    const newRows = currentRows + 1;

    const targetIdx = selectedCells[0] || 1;
    const targetRow = Math.floor((targetIdx - 1) / currentCols) + 1;

    const newCells: Record<number, any> = {};
    const newStyles: Record<number, any> = {};
    const newTypes: Record<number, any> = {};

    Object.keys(cells).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newR = r <= targetRow ? r : r + 1;
      const newIdx = (newR - 1) * currentCols + c;
      newCells[newIdx] = cells[oldIdx];
    });

    Object.keys(cellStyles).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newR = r <= targetRow ? r : r + 1;
      const newIdx = (newR - 1) * currentCols + c;
      newStyles[newIdx] = cellStyles[oldIdx];
    });

    Object.keys(cellTypes).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newR = r <= targetRow ? r : r + 1;
      const newIdx = (newR - 1) * currentCols + c;
      newTypes[newIdx] = cellTypes[oldIdx];
    });

    const rowHeights = Array.isArray(content.rowHeights) ? [...content.rowHeights] : Array(currentRows).fill(38);
    const targetHeight = rowHeights[targetRow - 1] || 38;
    rowHeights.splice(targetRow, 0, targetHeight);

    onContentChange(element.id, { 
      ...content, 
      rows: newRows,
      rowHeights,
      cells: newCells,
      cellStyles: newStyles,
      cellTypes: newTypes
    });
  };

  // Clear cell contents (Option B: only clear content, don't delete structural rows/columns)
  const handleClearCells = () => {
    const updatedCells = { ...cells };
    selectedCells.forEach((idx) => {
      updatedCells[idx] = '';
    });
    onContentChange(element.id, { ...content, cells: updatedCells });
  };

  const currentPrimaryStyle = cellStyles[selectedCells[0]] || {};
  const currentPrimaryType = cellTypes[selectedCells[0]]?.type || 'auto';

  return (
    <aside 
      className="milanote-sub-sidebar cell-action-sidebar" 
      style={{ position: 'relative', overflow: 'visible' }}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Top Back Arrow to deselect cells and return to table sidebar */}
      <button 
        className="sub-sidebar-btn" 
        onClick={onClose} 
        title="Deselect cells (Return to Table actions)"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* TEXT STYLE BUTTON */}
      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <button 
          className={`note-action-btn ${activeMenu === 'textStyle' ? 'active' : ''}`}
          onClick={() => setActiveMenu(activeMenu === 'textStyle' ? null : 'textStyle')}
          title="Text style & color"
        >
          <div className="note-action-icon-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="cell-sidebar-icon-box">
              <span style={{ fontFamily: 'serif', fontWeight: 'bold', fontSize: '15px' }}>T</span>
              <span className="color-wheel-dot" />
            </div>
          </div>
          <span className="note-action-label">Text style</span>
        </button>

        {/* TEXT STYLE POPOVER */}
        {activeMenu === 'textStyle' && (
          <div className="cell-sidebar-popover text-style-popover">
            <div className="popover-section-label">Color</div>
            <div className="popover-color-grid">
              {[
                { label: 'A', color: '#ffffff', id: 'default' },
                { label: 'A', color: '#33a1fd', id: '#33a1fd' },
                { label: 'A', color: '#24d06a', id: '#24d06a' },
                { label: 'A', color: '#ff9800', id: '#ff9800' },
                { label: 'A', color: '#f44336', id: '#f44336' },
                { label: 'A', color: '#9e9e9e', id: '#9e9e9e' },
              ].map((item) => {
                const isSelected = currentPrimaryStyle.textColor === item.id || (!currentPrimaryStyle.textColor && item.id === 'default');
                return (
                  <button
                    key={item.id}
                    className={`popover-text-color-btn ${isSelected ? 'selected' : ''}`}
                    style={{ color: item.color }}
                    onClick={() => applyStyleToSelectedCells({ textColor: item.id === 'default' ? undefined : item.id })}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="popover-divider" />

            <div className="popover-section-label">Highlight</div>
            <div className="popover-color-grid">
              {[
                { bg: '#181a1f', text: '#ffffff', id: 'dark' },
                { bg: '#58daf6', text: '#181a1f', id: '#58daf6' },
                { bg: '#b8f331', text: '#181a1f', id: '#b8f331' },
                { bg: '#f9d72f', text: '#181a1f', id: '#f9d72f' },
                { bg: '#f785be', text: '#181a1f', id: '#f785be' },
                { bg: '#e2e8f0', text: '#181a1f', id: '#e2e8f0' },
              ].map((item, idx) => {
                const isSelected = currentPrimaryStyle.highlightColor === item.id;
                return (
                  <button
                    key={idx}
                    className={`popover-highlight-btn ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: item.bg, color: item.text }}
                    onClick={() => applyStyleToSelectedCells({ highlightColor: isSelected ? undefined : item.id })}
                  >
                    A
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* CELL TYPE BUTTON */}
      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <button 
          className={`note-action-btn ${activeMenu === 'cellType' ? 'active' : ''}`}
          onClick={() => setActiveMenu(activeMenu === 'cellType' ? null : 'cellType')}
          title="Cell type"
        >
          <div className="note-action-icon-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="cell-sidebar-icon-box">
              <span className="cell-type-icon-inner">A</span>
            </div>
          </div>
          <span className="note-action-label">Cell type</span>
        </button>

        {/* CELL TYPE POPOVER */}
        {activeMenu === 'cellType' && (
          <div className="cell-sidebar-popover cell-type-popover">
            {[
              { label: 'Auto', icon: 'A', type: 'auto' },
              { label: 'Number', icon: '123', type: 'number', hasArrow: true },
              { label: 'Currency', icon: '$', type: 'currency', hasArrow: true },
              { label: 'Percentage', icon: '%', type: 'percentage', hasArrow: true },
              { label: 'Text', icon: 'ABC', type: 'text' },
              { label: 'Date & Time', icon: '📅', type: 'date', hasArrow: true },
              { label: 'Checkbox', icon: '☑', type: 'checkbox' },
            ].map((item) => {
              const isChecked = currentPrimaryType === item.type;
              return (
                <button
                  key={item.type}
                  className={`cell-type-menu-item ${isChecked ? 'active' : ''}`}
                  onClick={() => applyTypeToSelectedCells(item.type)}
                >
                  <span className="menu-item-icon-col">{item.icon}</span>
                  <span className="menu-item-label-col">{item.label}</span>
                  <span className="menu-item-action-col">
                    {isChecked && <Check size={16} />}
                    {!isChecked && item.hasArrow && <ChevronRight size={14} opacity={0.6} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* COLOR BUTTON */}
      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <button 
          className={`note-action-btn ${activeMenu === 'color' ? 'active' : ''}`}
          onClick={() => setActiveMenu(activeMenu === 'color' ? null : 'color')}
          title="Cell background color"
        >
          <div className="note-action-icon-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="cell-sidebar-icon-box color-picker-preview-box" style={{ backgroundColor: currentPrimaryStyle.cellColor || '#383d47' }} />
          </div>
          <span className="note-action-label">Color</span>
        </button>

        {/* COLOR POPOVER */}
        {activeMenu === 'color' && (
          <div className="cell-sidebar-popover color-popover">
            <div className="popover-section-label">Cell Tint</div>
            <div className="popover-color-grid">
              {[
                { label: 'None', bg: 'transparent', border: '#586072', id: 'none' },
                { bg: '#2b3648', id: '#2b3648' },
                { bg: '#233d32', id: '#233d32' },
                { bg: '#423625', id: '#423625' },
                { bg: '#422828', id: '#422828' },
                { bg: '#353046', id: '#353046' },
              ].map((tint, idx) => {
                const isSelected = currentPrimaryStyle.cellColor === tint.id;
                return (
                  <button
                    key={idx}
                    className={`popover-tint-btn ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: tint.bg, border: `1px solid ${tint.border || tint.bg}` }}
                    onClick={() => applyStyleToSelectedCells({ cellColor: tint.id === 'none' ? undefined : tint.id })}
                    title="Apply Tint"
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* FORMULA BUTTON */}
      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <button 
          className={`note-action-btn ${activeMenu === 'formula' ? 'active' : ''}`}
          onClick={() => setActiveMenu(activeMenu === 'formula' ? null : 'formula')}
          title="Formula"
        >
          <div className="note-action-icon-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="cell-sidebar-icon-box">
              <span style={{ fontFamily: 'serif', fontStyle: 'italic', fontWeight: 'bold', fontSize: '15px' }}>fx</span>
            </div>
          </div>
          <span className="note-action-label">Formula</span>
        </button>

        {/* FORMULA POPOVER */}
        {activeMenu === 'formula' && (
          <div className="cell-sidebar-popover formula-popover">
            {[
              { label: 'SUM', fn: '=SUM()' },
              { label: 'IF', fn: '=IF()' },
              { label: 'MIN', fn: '=MIN()' },
              { label: 'MAX', fn: '=MAX()' },
              { label: 'COUNT', fn: '=COUNT()' },
              { label: 'AVERAGE', fn: '=AVERAGE()' },
            ].map((item) => (
              <button
                key={item.label}
                className="formula-menu-item"
                onClick={() => insertFormula(item.fn)}
              >
                {item.label}
              </button>
            ))}
            <div className="popover-divider" style={{ margin: '4px 0' }} />
            <button className="formula-menu-item help-item" onClick={() => setActiveMenu(null)}>
              <span>View formula help</span>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ALIGNMENT BUTTON */}
      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <button 
          className={`note-action-btn ${activeMenu === 'alignment' ? 'active' : ''}`}
          onClick={() => setActiveMenu(activeMenu === 'alignment' ? null : 'alignment')}
          title="Alignment"
        >
          <div className="note-action-icon-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="cell-sidebar-icon-box">
              <AlignLeft size={16} />
            </div>
          </div>
          <span className="note-action-label">Alignment</span>
        </button>

        {/* ALIGNMENT POPOVER */}
        {activeMenu === 'alignment' && (
          <div className="cell-sidebar-popover alignment-popover">
            <div className="alignment-row">
              <button
                className={`alignment-option-btn ${(!currentPrimaryStyle.alignX || currentPrimaryStyle.alignX === 'left') ? 'active' : ''}`}
                onClick={() => applyStyleToSelectedCells({ alignX: 'left' })}
                title="Left Align"
              >
                <AlignLeft size={16} />
              </button>
              <button
                className={`alignment-option-btn ${currentPrimaryStyle.alignX === 'center' ? 'active' : ''}`}
                onClick={() => applyStyleToSelectedCells({ alignX: 'center' })}
                title="Center Align"
              >
                <AlignCenter size={16} />
              </button>
              <button
                className={`alignment-option-btn ${currentPrimaryStyle.alignX === 'right' ? 'active' : ''}`}
                onClick={() => applyStyleToSelectedCells({ alignX: 'right' })}
                title="Right Align"
              >
                <AlignRight size={16} />
              </button>
            </div>

            <div className="popover-divider" style={{ margin: '8px 0' }} />

            <div className="alignment-row">
              <button
                className={`alignment-option-btn ${(!currentPrimaryStyle.alignY || currentPrimaryStyle.alignY === 'top') ? 'active' : ''}`}
                onClick={() => applyStyleToSelectedCells({ alignY: 'top' })}
                title="Top Align"
              >
                <div className="align-vertical-icon top" />
              </button>
              <button
                className={`alignment-option-btn ${currentPrimaryStyle.alignY === 'middle' ? 'active' : ''}`}
                onClick={() => applyStyleToSelectedCells({ alignY: 'middle' })}
                title="Middle Align"
              >
                <div className="align-vertical-icon middle" />
              </button>
              <button
                className={`alignment-option-btn ${currentPrimaryStyle.alignY === 'bottom' ? 'active' : ''}`}
                onClick={() => applyStyleToSelectedCells({ alignY: 'bottom' })}
                title="Bottom Align"
              >
                <div className="align-vertical-icon bottom" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ADD COLUMN BUTTON */}
      <button className="note-action-btn" onClick={handleAddColumn} title="Add column to right">
        <div className="note-action-icon-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="cell-sidebar-icon-box grid-add-col-icon">
            <div className="grid-cell-square" />
            <div className="grid-cell-square active-col" />
          </div>
        </div>
        <span className="note-action-label">Add column</span>
      </button>

      {/* ADD ROW BUTTON */}
      <button className="note-action-btn" onClick={handleAddRow} title="Add row to bottom">
        <div className="note-action-icon-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="cell-sidebar-icon-box grid-add-row-icon">
            <div className="grid-cell-square" />
            <div className="grid-cell-square active-row" />
          </div>
        </div>
        <span className="note-action-label">Add row</span>
      </button>

      {/* TRASH BOTTOM BUTTON (OPTION B: CLEAR CONTENT) */}
      <button 
        className="sub-sidebar-btn trash-bottom" 
        style={{ flexDirection: 'column', gap: '2px', height: '48px' }}
        onClick={handleClearCells}
        title="Clear cell contents"
      >
        <Trash2 size={18} />
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '-0.2px' }}>Trash</span>
      </button>
    </aside>
  );
};
