import React, { useState, useEffect, useRef } from 'react';
import { Element, ToolType, CardColorTint } from '../types';
import {
  MoreHorizontal,
  Plus,
  Undo2,
  Redo2,
  HelpCircle,
  Search,
  Bell,
  Settings,
  AlignLeft,
  Link2,
  CheckSquare,
  LayoutGrid,
  Columns,
  MessageSquare,
  Camera,
  Table as TableIcon,
  Minus,
  Tag,
  Smile,
  MessageSquarePlus,
  Copy,
  Trash2,
  Check,
  Calendar,
  Type,
  Folder,
  FolderPlus,
  ArrowLeft,
  ArrowRight,
  Rows,
  AlignRight,
  ChevronRight,
  List,
  ListOrdered,
  Indent,
  Outdent,
  AlignCenter,
  Code,
  Upload,
  RefreshCw
} from 'lucide-react';
import { SyncStatusIndicator } from './SyncStatusIndicator';

interface MobileBottomBarProps {
  currentBoardId: string;
  boardTitle: string;
  unsortedCount: number;
  onOpenUnsorted: () => void;
  onOpenBoardsMenu: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSearch: () => void;
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  selectedElement: Element | null;
  selectedIds: string[];
  onDeselect: () => void;
  onRecolor: (tintOrColor: CardColorTint | string) => void;
  onCut: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onAddCommentPin?: (targetId: string) => void;
  onToggleTaskTitle?: (id: string) => void;
  onSetTaskDueDate?: (id: string, date: string | null) => void;
  onToggleCaption?: (id: string) => void;
  onRename?: (id: string) => void;
  onSetIcon?: (id: string, icon: string) => void;
  resetTrigger?: number;
  editingElement?: Element | null;
  onDoneEditing?: () => void;
  onStyleChange?: (id: string, newStyle: Record<string, any>) => void;
  onContentChange?: (id: string, newContent: Record<string, any>) => void;
  onDropToolAtScreen?: (tool: ToolType, clientX: number, clientY: number) => void;
  isUnsortedOpen?: boolean;
  onMoveElementToCanvas?: (element: Element) => void;
  onMoveElementToUnsorted?: (elementId: string) => void;
  selectedTableCells?: { tableId: string; cellIndices: number[] } | null;
  onDeselectTableCells?: () => void;
  onUploadImageForElement?: (elementId: string, dataUrl: string) => void;
  onOpenSyncSettings?: () => void;
  isRootBoard?: boolean;
}

const CLASSIC_COLORS = [
  '#2c3340', '#a8b0c0', '#48d6b5', '#6ee655', '#e89858',
  '#f5cc47', '#ff8830', '#f75454', '#f763bd', '#a863f7',
  '#45b7fb', '#5578f7', 'transparent'
];

const LETTERED_PRESETS = [
  { color: '#d69068', text: '#3c2415' },
  { color: '#cc907b', text: '#3a221a' },
  { color: '#b6be9c', text: '#2b3120' },
  { color: '#ded6b4', text: '#3f3b2d' },
];

const PASTEL_COLORS = [
  '#d69068', '#cc907b', '#debba9', '#ded1c1', '#ded6b4',
  '#b6be9c', '#bec485'
];

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  currentBoardId,
  boardTitle,
  unsortedCount,
  onOpenUnsorted,
  onOpenBoardsMenu,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenSearch,
  activeTool,
  onSelectTool,
  selectedElement,
  selectedIds,
  onDeselect,
  onRecolor,
  onCut,
  onCopy,
  onDuplicate,
  onDelete,
  onToggleLock,
  onBringToFront,
  onSendToBack,
  onAddCommentPin,
  onToggleTaskTitle,
  onSetTaskDueDate,
  onToggleCaption,
  onRename,
  onSetIcon,
  resetTrigger,
  editingElement,
  onDoneEditing,
  onStyleChange,
  onContentChange,
  onDropToolAtScreen,
  isUnsortedOpen,
  onMoveElementToCanvas,
  onMoveElementToUnsorted,
  selectedTableCells,
  onDeselectTableCells,
  onUploadImageForElement,
  onOpenSyncSettings,
  isRootBoard,
}) => {
  const isRoot = isRootBoard ?? (currentBoardId === 'root-board');
  // Navigation mode: 'default' | 'system' | 'tools'
  const [activeMenu, setActiveMenu] = useState<'default' | 'system' | 'tools'>('default');
  const [showMoreContextMenu, setShowMoreContextMenu] = useState(false);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [showLineWeightMenu, setShowLineWeightMenu] = useState(false);
  const [activeCellMenu, setActiveCellMenu] = useState<'textStyle' | 'cellType' | 'color' | 'alignment' | null>(null);
  const [colorMode, setColorMode] = useState<'background' | 'top_strip'>('background');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  // Touch drag-and-drop state for tool shelf
  const [draggedTool, setDraggedTool] = useState<{
    tool: ToolType;
    label: string;
    icon: React.ReactNode;
    isBlue?: boolean;
    x: number;
    y: number;
  } | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const toolPointerStartRef = useRef<{
    x: number;
    y: number;
    tool: ToolType;
    label: string;
    icon: React.ReactNode;
    isBlue?: boolean;
    startTime: number;
    hasLifted: boolean;
  } | null>(null);
  const isDraggingToolRef = useRef(false);

  // Soft keyboard visual viewport tracking
  useEffect(() => {
    const handleViewportChange = () => {
      if (!window.visualViewport) return;
      const vv = window.visualViewport;
      const kbOffset = Math.max(0, window.innerHeight - (vv.height + (vv.offsetTop || 0)));
      setKeyboardHeight(Math.round(kbOffset));
      document.documentElement.style.setProperty('--mobile-keyboard-height', `${Math.round(kbOffset)}px`);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
      handleViewportChange();
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, []);

  const hasSelection = Boolean(selectedElement || selectedIds.length > 0);
  const isTyping = Boolean(editingElement && editingElement.element_type === 'note');

  useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger > 0) {
      setActiveMenu('default');
      setShowColorPalette(false);
      setShowMoreContextMenu(false);
      setShowDateMenu(false);
      setShowLineWeightMenu(false);
      setActiveCellMenu(null);
    }
  }, [resetTrigger]);

  // If selection changes, reset submenus
  useEffect(() => {
    if (!hasSelection) {
      setShowMoreContextMenu(false);
      setShowColorPalette(false);
      setShowDateMenu(false);
      setShowLineWeightMenu(false);
      setActiveCellMenu(null);
    } else {
      setActiveMenu('default');
    }
  }, [hasSelection]);

  // Click-outside listener: resets bottom bar to default when user taps canvas
  useEffect(() => {
    const handleWindowPointerDown = (e: PointerEvent | MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('.mobile-main-bottom-bar') &&
        !target.closest('.mobile-color-drawer') &&
        !target.closest('.mobile-date-drawer') &&
        !target.closest('.mobile-line-weight-drawer') &&
        !target.closest('.mobile-cell-menu-drawer') &&
        !target.closest('.mobile-context-sheet') &&
        !target.closest('.mobile-two-finger-sheet')
      ) {
        if (
          activeMenu !== 'default' ||
          showColorPalette ||
          showMoreContextMenu ||
          showDateMenu ||
          showLineWeightMenu ||
          activeCellMenu !== null
        ) {
          setActiveMenu('default');
          setShowColorPalette(false);
          setShowMoreContextMenu(false);
          setShowDateMenu(false);
          setShowLineWeightMenu(false);
          setActiveCellMenu(null);
        }
      }
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => window.removeEventListener('pointerdown', handleWindowPointerDown);
  }, [activeMenu, showColorPalette, showMoreContextMenu, showDateMenu, showLineWeightMenu, activeCellMenu]);

  const handleToggleSystemMenu = () => {
    setActiveMenu((prev) => (prev === 'system' ? 'default' : 'system'));
  };

  const handleToggleToolsMenu = () => {
    setActiveMenu((prev) => (prev === 'tools' ? 'default' : 'tools'));
  };

  const handleToolClick = (tool: ToolType) => {
    onSelectTool(tool);
    if (activeTool === tool) {
      setActiveMenu('default');
    }
  };

  const TOOL_SHELF_ITEMS: Array<{ tool: ToolType; label: string; icon: React.ReactNode; isBlue?: boolean }> = [
    { tool: 'note', label: 'Note', icon: <AlignLeft size={20} /> },
    { tool: 'link', label: 'Link', icon: <Link2 size={20} /> },
    { tool: 'task_list', label: 'To-do', icon: <CheckSquare size={20} /> },
    { tool: 'nested_board', label: 'Board', icon: <LayoutGrid size={20} />, isBlue: true },
    { tool: 'column', label: 'Column', icon: <Columns size={20} /> },
    { tool: 'comment', label: 'Comment', icon: <MessageSquare size={20} /> },
    { tool: 'image', label: 'Image', icon: <Camera size={20} /> },
    { tool: 'table', label: 'Table', icon: <TableIcon size={20} /> },
    { tool: 'line', label: 'Line', icon: <Minus size={20} /> },
  ];

  const handleToolPointerDown = (
    item: { tool: ToolType; label: string; icon: React.ReactNode; isBlue?: boolean },
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    const startX = e.clientX;
    const startY = e.clientY;

    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    toolPointerStartRef.current = {
      x: startX,
      y: startY,
      tool: item.tool,
      label: item.label,
      icon: item.icon,
      isBlue: item.isBlue,
      startTime: Date.now(),
      hasLifted: false,
    };
    isDraggingToolRef.current = false;

    // Helper to trigger lift into floating drag follower
    const triggerLift = (curX: number, curY: number) => {
      if (!toolPointerStartRef.current || toolPointerStartRef.current.hasLifted) return;
      toolPointerStartRef.current.hasLifted = true;
      isDraggingToolRef.current = true;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(35); } catch (_) {}
      }
      setDraggedTool({
        tool: toolPointerStartRef.current.tool,
        label: toolPointerStartRef.current.label,
        icon: toolPointerStartRef.current.icon,
        isBlue: toolPointerStartRef.current.isBlue,
        x: curX,
        y: curY,
      });
    };

    // 160ms hold-to-lift timer
    holdTimerRef.current = window.setTimeout(() => {
      if (toolPointerStartRef.current && !toolPointerStartRef.current.hasLifted) {
        triggerLift(toolPointerStartRef.current.x, toolPointerStartRef.current.y);
      }
      holdTimerRef.current = null;
    }, 160);

    const handlePointerMove = (evt: any) => {
      if (!toolPointerStartRef.current) return;
      const pt = evt.touches?.[0] || evt;
      const curX = pt.clientX;
      const curY = pt.clientY;
      const dx = curX - toolPointerStartRef.current.x;
      const dy = curY - toolPointerStartRef.current.y;
      const dist = Math.hypot(dx, dy);

      if (!isDraggingToolRef.current) {
        if (dy < -8 || dist > 14) {
          if (holdTimerRef.current) {
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
          }
          triggerLift(curX, curY);
        } else if (Math.abs(dx) > 12 && Math.abs(dy) < 8) {
          // Horizontal scrolling in progress: cancel hold timer
          if (holdTimerRef.current) {
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
          }
        }
      }

      if (isDraggingToolRef.current) {
        if (evt.cancelable) {
          evt.preventDefault();
        }
        setDraggedTool({
          tool: toolPointerStartRef.current.tool,
          label: toolPointerStartRef.current.label,
          icon: toolPointerStartRef.current.icon,
          isBlue: toolPointerStartRef.current.isBlue,
          x: curX,
          y: curY,
        });
      }
    };

    const handlePointerUp = (evt: any) => {
      if (holdTimerRef.current) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);

      const pt = evt.changedTouches?.[0] || evt;
      const curX = pt.clientX;
      const curY = pt.clientY;

      if (isDraggingToolRef.current && toolPointerStartRef.current) {
        const bottomBarEl = document.querySelector('.mobile-main-bottom-bar');
        const bottomBarTop = bottomBarEl ? bottomBarEl.getBoundingClientRect().top : (window.innerHeight - 70);

        if (curY < bottomBarTop) {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate(30); } catch (_) {}
          }
          onDropToolAtScreen?.(toolPointerStartRef.current.tool, curX, curY);
          setActiveMenu('default');
        }
        setDraggedTool(null);
        setTimeout(() => {
          isDraggingToolRef.current = false;
        }, 60);
      } else if (toolPointerStartRef.current) {
        const elapsed = Date.now() - toolPointerStartRef.current.startTime;
        const dx = curX - toolPointerStartRef.current.x;
        const dy = curY - toolPointerStartRef.current.y;
        if (elapsed < 320 && Math.hypot(dx, dy) < 12) {
          handleToolClick(toolPointerStartRef.current.tool);
        }
      }

      toolPointerStartRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
  };

  const isLocked = Boolean(selectedElement?.style?.is_locked);
  const currentBgColor = selectedElement?.style?.background_color;
  const currentTopStrip = selectedElement?.style?.top_strip_color;

  const handleColorSelect = (color: string) => {
    if (!selectedElement) return;
    const currentStyle = selectedElement.style || {};

    if (selectedElement.element_type === 'nested_board') {
      const updatedStyle = { ...currentStyle, board_color: color, board_gradient: undefined };
      onStyleChange?.(selectedElement.id, updatedStyle);
      onRecolor(color);
      return;
    }

    if (selectedElement.element_type === 'column') {
      const updatedStyle = { ...currentStyle, background_color: color === 'transparent' ? undefined : color };
      onStyleChange?.(selectedElement.id, updatedStyle);
      onRecolor(color);
      return;
    }

    if (selectedElement.element_type === 'line') {
      const updatedStyle = { ...currentStyle, line_color: color };
      onStyleChange?.(selectedElement.id, updatedStyle);
      return;
    }

    if (selectedElement.element_type === 'table') {
      const updatedStyle = { ...currentStyle, background_color: color === 'transparent' ? undefined : color };
      onStyleChange?.(selectedElement.id, updatedStyle);
      onRecolor(color);
      return;
    }

    if (colorMode === 'background') {
      const updatedStyle = { ...currentStyle, background_color: color === 'transparent' ? undefined : color };
      onStyleChange?.(selectedElement.id, updatedStyle);
      onRecolor(color);
    } else {
      const updatedStyle = { ...currentStyle, top_strip_color: color === 'none' ? undefined : color };
      onStyleChange?.(selectedElement.id, updatedStyle);
    }
  };

  const isCellSelected = Boolean(
    selectedElement?.element_type === 'table' &&
    selectedTableCells &&
    selectedTableCells.tableId === selectedElement.id &&
    selectedTableCells.cellIndices.length > 0
  );

  const primarySelectedCellIdx = isCellSelected ? selectedTableCells!.cellIndices[0] : 1;
  const currentCellStyles = selectedElement?.content?.cellStyles || {};
  const currentCellTypes = selectedElement?.content?.cellTypes || {};
  const primaryCellStyle = currentCellStyles[primarySelectedCellIdx] || {};
  const primaryCellType = currentCellTypes[primarySelectedCellIdx]?.type || 'auto';
  const currentDueDate = selectedElement?.content?.due_date || null;

  const setQuickDate = (daysFromNow: number) => {
    if (!selectedElement) return;
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    onSetTaskDueDate?.(selectedElement.id, `${yyyy}-${mm}-${dd}`);
    setShowDateMenu(false);
  };

  const applyCellStyles = (styleUpdates: Record<string, any>) => {
    if (!selectedElement || !selectedTableCells) return;
    const content = selectedElement.content || {};
    const updatedStyles = { ...(content.cellStyles || {}) };
    selectedTableCells.cellIndices.forEach((idx) => {
      updatedStyles[idx] = { ...(updatedStyles[idx] || {}), ...styleUpdates };
    });
    onContentChange?.(selectedElement.id, { ...content, cellStyles: updatedStyles });
  };

  const applyCellType = (type: string) => {
    if (!selectedElement || !selectedTableCells) return;
    const content = selectedElement.content || {};
    const updatedTypes = { ...(content.cellTypes || {}) };
    selectedTableCells.cellIndices.forEach((idx) => {
      updatedTypes[idx] = { ...(updatedTypes[idx] || {}), type };
    });
    onContentChange?.(selectedElement.id, { ...content, cellTypes: updatedTypes });
    setActiveCellMenu(null);
  };

  const clearSelectedCells = () => {
    if (!selectedElement || !selectedTableCells) return;
    const content = selectedElement.content || {};
    const cells = { ...(content.cells || {}) };
    selectedTableCells.cellIndices.forEach((idx) => {
      cells[idx] = '';
    });
    onContentChange?.(selectedElement.id, { ...content, cells });
  };

  const handleAddTableColumn = (targetColIndex?: number) => {
    if (!selectedElement) return;
    const content = selectedElement.content || {};
    const currentCols = content.columns || 4;
    const currentRows = content.rows || 4;
    const newCols = currentCols + 1;

    let targetCol = targetColIndex;
    if (targetCol === undefined) {
      if (isCellSelected) {
        targetCol = ((primarySelectedCellIdx - 1) % currentCols) + 1;
      } else {
        targetCol = currentCols;
      }
    }

    const cells = content.cells || {};
    const cellStyles = content.cellStyles || {};
    const cellTypes = content.cellTypes || {};

    const newCells: Record<number, any> = {};
    const newStyles: Record<number, any> = {};
    const newTypes: Record<number, any> = {};

    Object.keys(cells).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newC = c <= targetCol! ? c : c + 1;
      const newIdx = (r - 1) * newCols + newC;
      newCells[newIdx] = cells[oldIdx];
    });

    Object.keys(cellStyles).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newC = c <= targetCol! ? c : c + 1;
      const newIdx = (r - 1) * newCols + newC;
      newStyles[newIdx] = cellStyles[oldIdx];
    });

    Object.keys(cellTypes).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newC = c <= targetCol! ? c : c + 1;
      const newIdx = (r - 1) * newCols + newC;
      newTypes[newIdx] = cellTypes[oldIdx];
    });

    const colWidths = Array.isArray(content.colWidths) ? [...content.colWidths] : Array(currentCols).fill(100);
    const targetWidth = colWidths[targetCol! - 1] || 100;
    colWidths.splice(targetCol!, 0, targetWidth);

    onContentChange?.(selectedElement.id, {
      ...content,
      columns: newCols,
      colWidths,
      cells: newCells,
      cellStyles: newStyles,
      cellTypes: newTypes,
    });
  };

  const handleAddTableRow = (targetRowIndex?: number) => {
    if (!selectedElement) return;
    const content = selectedElement.content || {};
    const currentCols = content.columns || 4;
    const currentRows = content.rows || 4;
    const newRows = currentRows + 1;

    let targetRow = targetRowIndex;
    if (targetRow === undefined) {
      if (isCellSelected) {
        targetRow = Math.floor((primarySelectedCellIdx - 1) / currentCols) + 1;
      } else {
        targetRow = currentRows;
      }
    }

    const cells = content.cells || {};
    const cellStyles = content.cellStyles || {};
    const cellTypes = content.cellTypes || {};

    const newCells: Record<number, any> = {};
    const newStyles: Record<number, any> = {};
    const newTypes: Record<number, any> = {};

    Object.keys(cells).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newR = r <= targetRow! ? r : r + 1;
      const newIdx = (newR - 1) * currentCols + c;
      newCells[newIdx] = cells[oldIdx];
    });

    Object.keys(cellStyles).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newR = r <= targetRow! ? r : r + 1;
      const newIdx = (newR - 1) * currentCols + c;
      newStyles[newIdx] = cellStyles[oldIdx];
    });

    Object.keys(cellTypes).forEach((key) => {
      const oldIdx = parseInt(key, 10);
      if (isNaN(oldIdx)) return;
      const r = Math.floor((oldIdx - 1) / currentCols) + 1;
      const c = ((oldIdx - 1) % currentCols) + 1;
      const newR = r <= targetRow! ? r : r + 1;
      const newIdx = (newR - 1) * currentCols + c;
      newTypes[newIdx] = cellTypes[oldIdx];
    });

    const rowHeights = Array.isArray(content.rowHeights) ? [...content.rowHeights] : Array(currentRows).fill(38);
    const targetHeight = rowHeights[targetRow! - 1] || 38;
    rowHeights.splice(targetRow!, 0, targetHeight);

    onContentChange?.(selectedElement.id, {
      ...content,
      rows: newRows,
      rowHeights,
      cells: newCells,
      cellStyles: newStyles,
      cellTypes: newTypes,
    });
  };

  const handleTextFormat = (cmd: string, val: string = '') => {
    const editor = editingElement
      ? (document.querySelector(`#milanote-el-${editingElement.id} .note-rich-editor`) as HTMLElement | null)
      : null;
    if (editor && document.activeElement !== editor && !editor.contains(document.activeElement)) {
      editor.focus();
    }

    if (cmd === 'code') {
      const sel = window.getSelection();
      if (sel && sel.toString().trim() !== '') {
        document.execCommand('insertHTML', false, `<code class="milanote-inline-code">${sel.toString()}</code>&nbsp;`);
      }
    } else if (cmd === 'heading') {
      const cur = document.queryCommandValue('formatBlock');
      const nextTag = cur === 'h2' ? '<p>' : '<h2>';
      document.execCommand('formatBlock', false, nextTag);
    } else {
      document.execCommand(cmd, false, val);
    }

    // Sync editor HTML back to note
    if (editingElement) {
      setTimeout(() => {
        const ed = document.querySelector(`#milanote-el-${editingElement.id} .note-rich-editor`) as HTMLElement | null;
        if (ed) {
          onContentChange?.(editingElement.id, { ...editingElement.content, text: ed.innerHTML });
        }
      }, 10);
    }
  };

  return (
    <>
      {/* Hidden File Input for Image Element Replacement */}
      <input
        type="file"
        ref={imageFileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && selectedElement) {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                onUploadImageForElement?.(selectedElement.id, reader.result);
              }
            };
            reader.readAsDataURL(file);
          }
          e.target.value = '';
        }}
      />

      {/* TOP-LEFT FLOATING SYNC STATUS PILL (ON ROOT BOARD & CANVAS) */}
      {!isTyping && isRoot && (
        <div className="mobile-sync-floating-pill">
          <SyncStatusIndicator dropdownAlign="left" onOpenSettings={onOpenSyncSettings || (() => {})} />
        </div>
      )}

      {/* TOP-RIGHT FLOATING UNSORTED PILL (IMAGE 2) */}
      {!isTyping && (
        <button
          className={`mobile-unsorted-floating-pill ${!isRoot ? 'under-topbar' : ''}`}
          onClick={onOpenUnsorted}
          title="Open Unsorted drawer"
        >
          <span className="mobile-unsorted-pill-count">{unsortedCount}</span>
          <span className="mobile-unsorted-pill-text">Unsorted</span>
        </button>
      )}

      {/* SCREEN 5: CONTEXT MENU BOTTOM SHEET (TRIGGERED BY '...' IN SELECTION BAR) */}
      {showMoreContextMenu && hasSelection && (
        <div
          className="mobile-context-sheet-backdrop"
          onClick={() => setShowMoreContextMenu(false)}
        >
          <div
            className="mobile-context-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="mobile-context-sheet-item"
              onClick={() => {
                onCut();
                setShowMoreContextMenu(false);
              }}
            >
              <span>Cut</span>
            </button>

            <button
              className="mobile-context-sheet-item"
              onClick={() => {
                onCopy();
                setShowMoreContextMenu(false);
              }}
            >
              <span>Copy</span>
            </button>

            <button
              className="mobile-context-sheet-item"
              onClick={() => {
                onDuplicate();
                setShowMoreContextMenu(false);
              }}
            >
              <span>Duplicate</span>
            </button>

            <button
              className="mobile-context-sheet-item"
              onClick={() => {
                onToggleLock();
                setShowMoreContextMenu(false);
              }}
            >
              <span>{isLocked ? 'Unlock Position' : 'Lock Position'}</span>
            </button>

            <button
              className="mobile-context-sheet-item"
              onClick={() => {
                onBringToFront();
                setShowMoreContextMenu(false);
              }}
            >
              <span>Bring to Front</span>
            </button>

            <button
              className="mobile-context-sheet-item"
              onClick={() => {
                onSendToBack();
                setShowMoreContextMenu(false);
              }}
            >
              <span>Send to Back</span>
            </button>

            {selectedElement?.style?.is_unsorted ? (
              <button
                className="mobile-context-sheet-item"
                onClick={() => {
                  onMoveElementToCanvas?.(selectedElement);
                  setShowMoreContextMenu(false);
                  onDeselect();
                }}
              >
                <span>Place on Board</span>
              </button>
            ) : (
              <button
                className="mobile-context-sheet-item"
                onClick={() => {
                  if (selectedElement) onMoveElementToUnsorted?.(selectedElement.id);
                  setShowMoreContextMenu(false);
                  onDeselect();
                }}
              >
                <span>Move to Unsorted</span>
              </button>
            )}

            <button
              className="mobile-context-sheet-item danger"
              onClick={() => {
                onDelete();
                setShowMoreContextMenu(false);
              }}
            >
              <span>Move to Trash</span>
            </button>
          </div>
        </div>
      )}

      {/* MOBILE COLOR PALETTE DRAWER (ABOVE SELECTION BAR) - EXACT DESKTOP CAPABILITY */}
      {showColorPalette && hasSelection && !isCellSelected && (
        <div
          className="mobile-color-drawer"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mode Switcher Tabs for elements supporting Top Strip */}
          {selectedElement?.element_type !== 'nested_board' && selectedElement?.element_type !== 'line' && selectedElement?.element_type !== 'table' && (
            <div className="mobile-color-mode-tabs">
              <button
                className={`mobile-color-mode-tab ${colorMode === 'background' ? 'active' : ''}`}
                onClick={() => setColorMode('background')}
              >
                <div style={{
                  width: '14px',
                  height: '11px',
                  borderRadius: '2px',
                  backgroundColor: colorMode === 'background' ? '#ffffff' : '#9098a6'
                }} />
                Background
              </button>
              <button
                className={`mobile-color-mode-tab ${colorMode === 'top_strip' ? 'active' : ''}`}
                onClick={() => setColorMode('top_strip')}
              >
                <div style={{
                  width: '14px',
                  height: '11px',
                  borderRadius: '2px',
                  border: `1.5px solid ${colorMode === 'top_strip' ? '#ffffff' : '#9098a6'}`,
                  borderTop: `3.5px solid ${colorMode === 'top_strip' ? '#ffffff' : '#9098a6'}`
                }} />
                Top strip
              </button>
            </div>
          )}

          {/* Grid 1: Classic Colors & None */}
          <div className="mobile-color-swatches-grid">
            {colorMode === 'top_strip' && selectedElement?.element_type !== 'line' && selectedElement?.element_type !== 'table' && (
              <button
                className={`mobile-color-swatch-box ${!currentTopStrip ? 'selected' : ''}`}
                style={{ backgroundColor: '#353c48' }}
                onClick={() => handleColorSelect('none')}
                title="Remove top strip"
              >
                <div className="color-swatch-none-slash" />
              </button>
            )}

            {CLASSIC_COLORS.map((col, idx) => {
              if (colorMode === 'top_strip' && col === 'transparent') return null;

              const isTransparent = col === 'transparent';
              const isSelected = selectedElement?.element_type === 'line'
                ? ((selectedElement.style?.line_color || '#a8b0c0') === col)
                : colorMode === 'background'
                  ? (currentBgColor === col || (!currentBgColor && isTransparent))
                  : (currentTopStrip === col);

              return (
                <button
                  key={idx}
                  className={`mobile-color-swatch-box ${isTransparent ? 'color-swatch-transparent-grid' : ''} ${isSelected ? 'selected' : ''}`}
                  style={selectedElement?.element_type === 'line' ? { backgroundColor: '#353c48' } : colorMode === 'background' ? { backgroundColor: isTransparent ? undefined : col } : { backgroundColor: '#353c48' }}
                  onClick={() => handleColorSelect(col)}
                  title={col}
                >
                  {(colorMode === 'top_strip' || selectedElement?.element_type === 'line') && !isTransparent && (
                    <div className="color-swatch-top-strip-preview" style={{ backgroundColor: col, height: selectedElement?.element_type === 'line' ? '100%' : undefined }} />
                  )}
                  {isSelected && <Check size={14} color="#ffffff" />}
                </button>
              );
            })}
          </div>

          {/* Grid 2: Lettered Presets (In Background Mode) */}
          {colorMode === 'background' && selectedElement?.element_type !== 'line' && selectedElement?.element_type !== 'table' && (
            <div className="mobile-color-presets-row">
              {LETTERED_PRESETS.map((preset, idx) => {
                const isSelected = currentBgColor === preset.color;
                return (
                  <button
                    key={idx}
                    className={`mobile-color-swatch-box ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: preset.color, fontWeight: 700, fontSize: '14px', color: preset.text }}
                    onClick={() => handleColorSelect(preset.color)}
                    title="Themed note color"
                  >
                    A
                  </button>
                );
              })}
            </div>
          )}

          {/* Grid 3: Pastel Colors */}
          <div className="mobile-color-swatches-grid pastels">
            {PASTEL_COLORS.map((col, idx) => {
              const isSelected = selectedElement?.element_type === 'line'
                ? ((selectedElement.style?.line_color || '#a8b0c0') === col)
                : colorMode === 'background' ? (currentBgColor === col) : (currentTopStrip === col);
              return (
                <button
                  key={idx}
                  className={`mobile-color-swatch-box ${isSelected ? 'selected' : ''}`}
                  style={selectedElement?.element_type === 'line' ? { backgroundColor: '#353c48' } : colorMode === 'background' ? { backgroundColor: col } : { backgroundColor: '#353c48' }}
                  onClick={() => handleColorSelect(col)}
                  title={col}
                >
                  {(colorMode === 'top_strip' || selectedElement?.element_type === 'line') && (
                    <div className="color-swatch-top-strip-preview" style={{ backgroundColor: col, height: selectedElement?.element_type === 'line' ? '100%' : undefined }} />
                  )}
                  {isSelected && <Check size={14} color="#ffffff" />}
                </button>
              );
            })}
          </div>

          {/* Custom Color Rainbow Button */}
          <label className="mobile-custom-color-btn" title="Choose custom color">
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

      {/* MOBILE DUE DATE SCHEDULER DRAWER (FOR TO-DO LIST) */}
      {showDateMenu && selectedElement?.element_type === 'task_list' && (
        <div className="mobile-date-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-drawer-header">
            <span>Schedule Due Date</span>
            {currentDueDate && (
              <span className="mobile-date-badge">Due {currentDueDate}</span>
            )}
          </div>

          <div className="mobile-date-shortcuts-row">
            <button className="mobile-date-shortcut-btn" onClick={() => setQuickDate(0)}>
              <span>Today</span>
              <span className="mobile-date-offset">+0d</span>
            </button>
            <button className="mobile-date-shortcut-btn" onClick={() => setQuickDate(1)}>
              <span>Tomorrow</span>
              <span className="mobile-date-offset">+1d</span>
            </button>
            <button className="mobile-date-shortcut-btn" onClick={() => setQuickDate(7)}>
              <span>Next Week</span>
              <span className="mobile-date-offset">+7d</span>
            </button>
          </div>

          <div className="mobile-date-custom-section">
            <label>Custom Date</label>
            <input
              type="date"
              className="mobile-date-native-input"
              value={currentDueDate || ''}
              onChange={(e) => {
                onSetTaskDueDate?.(selectedElement.id, e.target.value || null);
                setShowDateMenu(false);
              }}
            />
          </div>

          {currentDueDate && (
            <button
              className="mobile-date-clear-btn"
              onClick={() => {
                onSetTaskDueDate?.(selectedElement.id, null);
                setShowDateMenu(false);
              }}
            >
              Clear Due Date
            </button>
          )}
        </div>
      )}

      {/* MOBILE LINE WEIGHT DRAWER (FOR LINE ELEMENT) */}
      {showLineWeightMenu && selectedElement?.element_type === 'line' && (
        <div className="mobile-line-weight-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-drawer-header">
            <span>Line Weight</span>
          </div>
          <div className="mobile-line-weight-row">
            <button
              className={`mobile-weight-option-btn ${(selectedElement.style?.line_weight || 2) === 2 ? 'active' : ''}`}
              onClick={() => {
                onStyleChange?.(selectedElement.id, { ...(selectedElement.style || {}), line_weight: 2 });
                setShowLineWeightMenu(false);
              }}
              title="Thin (2px)"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="20" x2="20" y2="4" />
              </svg>
              <span>2px</span>
            </button>

            <button
              className={`mobile-weight-option-btn ${(selectedElement.style?.line_weight || 2) === 4 ? 'active' : ''}`}
              onClick={() => {
                onStyleChange?.(selectedElement.id, { ...(selectedElement.style || {}), line_weight: 4 });
                setShowLineWeightMenu(false);
              }}
              title="Medium (4px)"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                <line x1="4" y1="20" x2="20" y2="4" />
              </svg>
              <span>4px</span>
            </button>

            <button
              className={`mobile-weight-option-btn ${(selectedElement.style?.line_weight || 2) === 6 ? 'active' : ''}`}
              onClick={() => {
                onStyleChange?.(selectedElement.id, { ...(selectedElement.style || {}), line_weight: 6 });
                setShowLineWeightMenu(false);
              }}
              title="Thick (6px)"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round">
                <line x1="4" y1="20" x2="20" y2="4" />
              </svg>
              <span>6px</span>
            </button>
          </div>
        </div>
      )}

      {/* MOBILE CELL MENU DRAWER (FOR CELL FORMATTING IN TABLE) */}
      {isCellSelected && activeCellMenu && (
        <div className="mobile-cell-menu-drawer" onClick={(e) => e.stopPropagation()}>
          {activeCellMenu === 'textStyle' && (
            <>
              <div className="mobile-drawer-header">
                <span>Text Color</span>
              </div>
              <div className="mobile-color-swatches-grid">
                {[
                  { label: 'A', color: '#ffffff', id: 'default' },
                  { label: 'A', color: '#33a1fd', id: '#33a1fd' },
                  { label: 'A', color: '#24d06a', id: '#24d06a' },
                  { label: 'A', color: '#ff9800', id: '#ff9800' },
                  { label: 'A', color: '#f44336', id: '#f44336' },
                  { label: 'A', color: '#9e9e9e', id: '#9e9e9e' },
                ].map((item) => {
                  const isSel = primaryCellStyle.textColor === item.id || (!primaryCellStyle.textColor && item.id === 'default');
                  return (
                    <button
                      key={item.id}
                      className={`mobile-color-swatch-box ${isSel ? 'selected' : ''}`}
                      style={{ color: item.color, backgroundColor: '#353c48', fontSize: '15px', fontWeight: 'bold' }}
                      onClick={() => applyCellStyles({ textColor: item.id === 'default' ? undefined : item.id })}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="mobile-drawer-header" style={{ marginTop: '8px' }}>
                <span>Highlight</span>
              </div>
              <div className="mobile-color-swatches-grid">
                {[
                  { bg: '#181a1f', text: '#ffffff', id: 'dark' },
                  { bg: '#58daf6', text: '#181a1f', id: '#58daf6' },
                  { bg: '#b8f331', text: '#181a1f', id: '#b8f331' },
                  { bg: '#f9d72f', text: '#181a1f', id: '#f9d72f' },
                  { bg: '#f785be', text: '#181a1f', id: '#f785be' },
                  { bg: '#e2e8f0', text: '#181a1f', id: '#e2e8f0' },
                ].map((item, idx) => {
                  const isSel = primaryCellStyle.highlightColor === item.id;
                  return (
                    <button
                      key={idx}
                      className={`mobile-color-swatch-box ${isSel ? 'selected' : ''}`}
                      style={{ backgroundColor: item.bg, color: item.text, fontSize: '15px', fontWeight: 'bold' }}
                      onClick={() => applyCellStyles({ highlightColor: isSel ? undefined : item.id })}
                    >
                      A
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {activeCellMenu === 'cellType' && (
            <div className="mobile-cell-type-list">
              {[
                { label: 'Auto', icon: 'A', type: 'auto' },
                { label: 'Number', icon: '123', type: 'number' },
                { label: 'Currency', icon: '$', type: 'currency' },
                { label: 'Percentage', icon: '%', type: 'percentage' },
                { label: 'Text', icon: 'ABC', type: 'text' },
                { label: 'Date & Time', icon: '📅', type: 'date' },
                { label: 'Checkbox', icon: '☑', type: 'checkbox' },
              ].map((item) => {
                const isChecked = primaryCellType === item.type;
                return (
                  <button
                    key={item.type}
                    className={`mobile-cell-type-btn ${isChecked ? 'active' : ''}`}
                    onClick={() => applyCellType(item.type)}
                  >
                    <span className="mobile-cell-type-icon">{item.icon}</span>
                    <span className="mobile-cell-type-label">{item.label}</span>
                    {isChecked && <Check size={16} />}
                  </button>
                );
              })}
            </div>
          )}

          {activeCellMenu === 'color' && (
            <>
              <div className="mobile-drawer-header">
                <span>Cell Tint</span>
              </div>
              <div className="mobile-color-swatches-grid">
                {[
                  { bg: 'transparent', border: '#586072', id: 'none' },
                  { bg: '#2b3648', id: '#2b3648' },
                  { bg: '#233d32', id: '#233d32' },
                  { bg: '#423625', id: '#423625' },
                  { bg: '#422828', id: '#422828' },
                  { bg: '#353046', id: '#353046' },
                ].map((tint, idx) => {
                  const isSel = (primaryCellStyle.cellColor || 'none') === tint.id;
                  return (
                    <button
                      key={idx}
                      className={`mobile-color-swatch-box ${isSel ? 'selected' : ''}`}
                      style={{ backgroundColor: tint.bg, border: `1px solid ${tint.border || tint.bg}` }}
                      onClick={() => applyCellStyles({ cellColor: tint.id === 'none' ? undefined : tint.id })}
                    >
                      {isSel && <Check size={14} color="#ffffff" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {activeCellMenu === 'alignment' && (
            <div className="mobile-cell-align-grid">
              <div className="mobile-drawer-header">
                <span>Horizontal Alignment</span>
              </div>
              <div className="mobile-cell-align-row">
                <button
                  className={`mobile-cell-align-btn ${(!primaryCellStyle.alignX || primaryCellStyle.alignX === 'left') ? 'active' : ''}`}
                  onClick={() => applyCellStyles({ alignX: 'left' })}
                  title="Left"
                >
                  <AlignLeft size={18} />
                </button>
                <button
                  className={`mobile-cell-align-btn ${primaryCellStyle.alignX === 'center' ? 'active' : ''}`}
                  onClick={() => applyCellStyles({ alignX: 'center' })}
                  title="Center"
                >
                  <AlignCenter size={18} />
                </button>
                <button
                  className={`mobile-cell-align-btn ${primaryCellStyle.alignX === 'right' ? 'active' : ''}`}
                  onClick={() => applyCellStyles({ alignX: 'right' })}
                  title="Right"
                >
                  <AlignRight size={18} />
                </button>
              </div>

              <div className="mobile-drawer-header" style={{ marginTop: '6px' }}>
                <span>Vertical Alignment</span>
              </div>
              <div className="mobile-cell-align-row">
                <button
                  className={`mobile-cell-align-btn ${(!primaryCellStyle.alignY || primaryCellStyle.alignY === 'top') ? 'active' : ''}`}
                  onClick={() => applyCellStyles({ alignY: 'top' })}
                  title="Top"
                >
                  <span>Top</span>
                </button>
                <button
                  className={`mobile-cell-align-btn ${primaryCellStyle.alignY === 'middle' ? 'active' : ''}`}
                  onClick={() => applyCellStyles({ alignY: 'middle' })}
                  title="Middle"
                >
                  <span>Middle</span>
                </button>
                <button
                  className={`mobile-cell-align-btn ${primaryCellStyle.alignY === 'bottom' ? 'active' : ''}`}
                  onClick={() => applyCellStyles({ alignY: 'bottom' })}
                  title="Bottom"
                >
                  <span>Bottom</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FLOATING DRAGGED TOOL PREVIEW FOLLOWER */}
      {draggedTool && (
        <div
          className="mobile-tool-drag-preview"
          style={{
            left: `${draggedTool.x}px`,
            top: `${draggedTool.y}px`,
          }}
        >
          <div className={`mobile-tool-dock-icon ${draggedTool.isBlue ? 'board-blue' : ''}`}>
            {draggedTool.icon}
          </div>
          <span>{draggedTool.label}</span>
        </div>
      )}

      {/* FIXED MOBILE BOTTOM BAR WRAPPER */}
      <nav
        className={`mobile-main-bottom-bar ${keyboardHeight > 50 ? 'keyboard-open' : ''}`}
        style={keyboardHeight > 0 ? { bottom: `${keyboardHeight}px` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===================================================================
            SCREEN: TEXT FORMATTING ACCESSORY BAR (WHILE TYPING / EDITING A NOTE)
            (MATCHING SCREENSHOT 2 & 3)
            =================================================================== */}
        {isTyping ? (
          <div className="mobile-text-formatting-bar">
            <div className="mobile-text-format-actions-scroll">
              {/* T button with rainbow dot (Screenshot 2) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  handleTextFormat('heading');
                }}
                title="Text style"
              >
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>T</span>
                  <div className="mobile-format-rainbow-dot" />
                </div>
              </button>

              {/* Bold (B) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  handleTextFormat('bold');
                }}
                title="Bold"
              >
                <span style={{ fontWeight: 800, fontSize: 16 }}>B</span>
              </button>

              {/* Italic (I) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  handleTextFormat('italic');
                }}
                title="Italic"
              >
                <span style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 16, fontFamily: 'serif' }}>I</span>
              </button>

              {/* Strikethrough (S) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  handleTextFormat('strikeThrough');
                }}
                title="Strikethrough"
              >
                <span style={{ textDecoration: 'line-through', fontWeight: 600, fontSize: 16 }}>S</span>
              </button>

              {/* Underline (U) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  handleTextFormat('underline');
                }}
                title="Underline"
              >
                <span style={{ textDecoration: 'underline', fontWeight: 600, fontSize: 16 }}>U</span>
              </button>

              {/* Bullet list (Screenshot 2 & 3) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  handleTextFormat('insertUnorderedList');
                }}
                title="Bullet list"
              >
                <List size={18} />
              </button>

              {/* Numbered list (Screenshot 3) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  handleTextFormat('insertOrderedList');
                }}
                title="Numbered list"
              >
                <ListOrdered size={18} />
              </button>

              {/* Indent (=>) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  handleTextFormat('indent');
                }}
                title="Indent"
              >
                <Indent size={18} />
              </button>

              {/* Outdent (<=) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  handleTextFormat('outdent');
                }}
                title="Outdent"
              >
                <Outdent size={18} />
              </button>

              {/* Align (≡) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  const isCenter = document.queryCommandState('justifyCenter');
                  handleTextFormat(isCenter ? 'justifyLeft' : 'justifyCenter');
                }}
                title="Align text"
              >
                <AlignCenter size={18} />
              </button>

              {/* Code block (</>) */}
              <button
                className="mobile-format-btn"
                onTouchStart={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  handleTextFormat('code');
                }}
                title="Inline code"
              >
                <Code size={18} />
              </button>
            </div>

            {/* Right: Done button (Screenshot 2 & 3) */}
            <button
              className="mobile-format-done-btn"
              onTouchStart={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                (document.activeElement as HTMLElement)?.blur();
                onDoneEditing?.();
              }}
              title="Done editing"
            >
              Done
            </button>
          </div>
        ) : hasSelection ? (
          /* ===================================================================
              SCREEN 4: SELECTION ACTION BAR (WHEN CARD IS SELECTED)
              =================================================================== */
          <div className="mobile-bar-selection-layout">
            <div className="mobile-selection-actions-left">
              {/* Place on board button if element is currently in Unsorted */}
              {selectedElement?.style?.is_unsorted && (
                <button
                  className="mobile-action-btn"
                  onClick={() => {
                    onMoveElementToCanvas?.(selectedElement);
                    onDeselect();
                  }}
                  title="Place on board"
                >
                  <div className="mobile-action-icon-box">
                    <FolderPlus size={19} />
                  </div>
                  <span>Place</span>
                </button>
              )}

              {/* TABLE CELL ACTIONS (When specific cell(s) in a table are selected) */}
              {isCellSelected ? (
                <>
                  {/* Text Style (Color & Highlight) */}
                  <button
                    className={`mobile-action-btn ${activeCellMenu === 'textStyle' ? 'active' : ''}`}
                    onClick={() => setActiveCellMenu(activeCellMenu === 'textStyle' ? null : 'textStyle')}
                    title="Text style"
                  >
                    <div className="mobile-action-icon-box">
                      <Type size={19} />
                    </div>
                    <span>Text style</span>
                  </button>

                  {/* Cell Type (Auto, Number, %, Text, Date, Checkbox) */}
                  <button
                    className={`mobile-action-btn ${activeCellMenu === 'cellType' ? 'active' : ''}`}
                    onClick={() => setActiveCellMenu(activeCellMenu === 'cellType' ? null : 'cellType')}
                    title="Cell type"
                  >
                    <div className="mobile-action-icon-box">
                      <span style={{ fontWeight: 800, fontSize: '15px' }}>
                        {primaryCellType === 'currency' ? '$' : primaryCellType === 'percentage' ? '%' : primaryCellType === 'number' ? '#' : primaryCellType === 'checkbox' ? '☑' : 'A'}
                      </span>
                    </div>
                    <span>Type</span>
                  </button>

                  {/* Cell Tint / Color */}
                  <button
                    className={`mobile-action-btn ${activeCellMenu === 'color' ? 'active' : ''}`}
                    onClick={() => setActiveCellMenu(activeCellMenu === 'color' ? null : 'color')}
                    title="Cell tint"
                  >
                    <div
                      className="mobile-action-icon-box color-indicator"
                      style={{
                        backgroundColor: primaryCellStyle.cellColor || '#2a2a2d',
                        borderColor: primaryCellStyle.cellColor ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.08)'
                      }}
                    />
                    <span>Tint</span>
                  </button>

                  {/* Alignment */}
                  <button
                    className={`mobile-action-btn ${activeCellMenu === 'alignment' ? 'active' : ''}`}
                    onClick={() => setActiveCellMenu(activeCellMenu === 'alignment' ? null : 'alignment')}
                    title="Cell alignment"
                  >
                    <div className="mobile-action-icon-box">
                      {primaryCellStyle.alignX === 'center' ? <AlignCenter size={19} /> : primaryCellStyle.alignX === 'right' ? <AlignRight size={19} /> : <AlignLeft size={19} />}
                    </div>
                    <span>Align</span>
                  </button>

                  {/* Add Column */}
                  <button
                    className="mobile-action-btn"
                    onClick={() => handleAddTableColumn()}
                    title="Add column to right of cell"
                  >
                    <div className="mobile-action-icon-box">
                      <Columns size={19} />
                    </div>
                    <span>+ Col</span>
                  </button>

                  {/* Add Row */}
                  <button
                    className="mobile-action-btn"
                    onClick={() => handleAddTableRow()}
                    title="Add row below cell"
                  >
                    <div className="mobile-action-icon-box">
                      <Rows size={19} />
                    </div>
                    <span>+ Row</span>
                  </button>

                  {/* Clear Cell Content */}
                  <button
                    className="mobile-action-btn"
                    onClick={clearSelectedCells}
                    title="Clear cell contents"
                  >
                    <div className="mobile-action-icon-box">
                      <Trash2 size={19} />
                    </div>
                    <span>Clear</span>
                  </button>
                </>
              ) : (
                /* ELEMENT-LEVEL ACTIONS */
                <>
                  {/* Color Action Button */}
                  <button
                    className={`mobile-action-btn ${showColorPalette ? 'active' : ''}`}
                    onClick={() => {
                      setShowColorPalette(!showColorPalette);
                      setShowDateMenu(false);
                      setShowLineWeightMenu(false);
                    }}
                    title="Change color theme"
                  >
                    <div
                      className="mobile-action-icon-box color-indicator"
                      style={{
                        backgroundColor: selectedElement?.element_type === 'line'
                          ? (selectedElement.style?.line_color || '#a8b0c0')
                          : (currentBgColor || 'rgba(255, 255, 255, 0.1)'),
                        borderColor: 'rgba(255, 255, 255, 0.4)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      {currentTopStrip && selectedElement?.element_type !== 'line' && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', backgroundColor: currentTopStrip }} />
                      )}
                    </div>
                    <span>Color</span>
                  </button>

                  {/* NOTE ACTIONS */}
                  {selectedElement?.element_type === 'note' && (
                    <>
                      <button className="mobile-action-btn" onClick={() => {}} title="Labels">
                        <div className="mobile-action-icon-box"><Tag size={19} /></div>
                        <span>Labels</span>
                      </button>
                      <button className="mobile-action-btn" onClick={() => {}} title="Reactions">
                        <div className="mobile-action-icon-box"><Smile size={19} /></div>
                        <span>Reactions</span>
                      </button>
                    </>
                  )}

                  {/* TO-DO LIST ACTIONS (FULL DESKTOP PARITY) */}
                  {selectedElement?.element_type === 'task_list' && (
                    <>
                      <button
                        className={`mobile-action-btn ${Boolean(selectedElement.content?.show_title) ? 'active' : ''}`}
                        onClick={() => onToggleTaskTitle?.(selectedElement.id)}
                        title="Toggle title"
                      >
                        <div className="mobile-action-icon-box"><Type size={19} /></div>
                        <span>Title</span>
                      </button>
                      <button
                        className={`mobile-action-btn ${Boolean(selectedElement.content?.due_date) ? 'active' : ''} ${showDateMenu ? 'active' : ''}`}
                        onClick={() => {
                          setShowDateMenu(!showDateMenu);
                          setShowColorPalette(false);
                        }}
                        title={selectedElement.content?.due_date ? `Due ${selectedElement.content.due_date}` : "Due date"}
                      >
                        <div className="mobile-action-icon-box"><Calendar size={19} /></div>
                        <span>Due date</span>
                      </button>
                      <button className="mobile-action-btn" onClick={() => {}} title="Labels">
                        <div className="mobile-action-icon-box"><Tag size={19} /></div>
                        <span>Labels</span>
                      </button>
                      <button className="mobile-action-btn" onClick={() => {}} title="Reactions">
                        <div className="mobile-action-icon-box"><Smile size={19} /></div>
                        <span>Reactions</span>
                      </button>
                    </>
                  )}

                  {/* TABLE ACTIONS (FULL DESKTOP PARITY) */}
                  {selectedElement?.element_type === 'table' && (
                    <>
                      {/* Title Toggle */}
                      <button
                        className={`mobile-action-btn ${selectedElement.content?.show_title ? 'active' : ''}`}
                        onClick={() => {
                          onContentChange?.(selectedElement.id, {
                            ...selectedElement.content,
                            show_title: !selectedElement.content?.show_title,
                          });
                        }}
                        title="Toggle title"
                      >
                        <div className="mobile-action-icon-box">
                          <Type size={19} />
                        </div>
                        <span>Title</span>
                      </button>

                      {/* Caption Toggle */}
                      <button
                        className={`mobile-action-btn ${selectedElement.content?.show_caption ? 'active' : ''}`}
                        onClick={() => {
                          onContentChange?.(selectedElement.id, {
                            ...selectedElement.content,
                            show_caption: !selectedElement.content?.show_caption,
                          });
                        }}
                        title="Toggle caption"
                      >
                        <div className="mobile-action-icon-box">
                          <AlignLeft size={19} />
                        </div>
                        <span>Caption</span>
                      </button>

                      {/* Add Row Button */}
                      <button
                        className="mobile-action-btn"
                        onClick={() => handleAddTableRow()}
                        title="Add row"
                      >
                        <div className="mobile-action-icon-box">
                          <Rows size={19} />
                        </div>
                        <span>+ Row</span>
                      </button>

                      {/* Add Column Button */}
                      <button
                        className="mobile-action-btn"
                        onClick={() => handleAddTableColumn()}
                        title="Add column"
                      >
                        <div className="mobile-action-icon-box">
                          <Columns size={19} />
                        </div>
                        <span>+ Col</span>
                      </button>

                      {/* Labels Button */}
                      <button className="mobile-action-btn" onClick={() => {}} title="Labels">
                        <div className="mobile-action-icon-box"><Tag size={19} /></div>
                        <span>Labels</span>
                      </button>

                      {/* Reactions Button */}
                      <button className="mobile-action-btn" onClick={() => {}} title="Reactions">
                        <div className="mobile-action-icon-box"><Smile size={19} /></div>
                        <span>Reactions</span>
                      </button>
                    </>
                  )}

                  {/* LINE ACTIONS (FULL DESKTOP PARITY) */}
                  {selectedElement?.element_type === 'line' && (
                    <>
                      {/* Start Arrow */}
                      <button
                        className={`mobile-action-btn ${(selectedElement.style?.start_arrow || 'none') === 'arrow' ? 'active' : ''}`}
                        onClick={() => {
                          const cur = selectedElement.style?.start_arrow || 'none';
                          onStyleChange?.(selectedElement.id, {
                            ...(selectedElement.style || {}),
                            start_arrow: cur === 'arrow' ? 'none' : 'arrow'
                          });
                        }}
                        title="Toggle Start Arrow"
                      >
                        <div className="mobile-action-icon-box">
                          <ArrowLeft size={19} />
                        </div>
                        <span>Start</span>
                      </button>

                      {/* End Arrow */}
                      <button
                        className={`mobile-action-btn ${(selectedElement.style?.end_arrow === undefined || selectedElement.style?.end_arrow === 'arrow') ? 'active' : ''}`}
                        onClick={() => {
                          const cur = selectedElement.style?.end_arrow === undefined ? 'arrow' : selectedElement.style?.end_arrow;
                          onStyleChange?.(selectedElement.id, {
                            ...(selectedElement.style || {}),
                            end_arrow: cur === 'arrow' ? 'none' : 'arrow'
                          });
                        }}
                        title="Toggle End Arrow"
                      >
                        <div className="mobile-action-icon-box">
                          <ArrowRight size={19} />
                        </div>
                        <span>End</span>
                      </button>

                      {/* Label Toggle */}
                      <button
                        className={`mobile-action-btn ${Boolean(selectedElement.content?.show_label || (selectedElement.content?.label && selectedElement.content?.label.trim().length > 0)) ? 'active' : ''}`}
                        onClick={() => {
                          const showLabel = Boolean(selectedElement.content?.show_label || (selectedElement.content?.label && selectedElement.content?.label.trim().length > 0));
                          const nextShow = !showLabel;
                          onContentChange?.(selectedElement.id, {
                            ...(selectedElement.content || {}),
                            show_label: nextShow,
                            label: nextShow ? (selectedElement.content?.label || 'Label') : ''
                          });
                        }}
                        title="Toggle Label"
                      >
                        <div className="mobile-action-icon-box">
                          <Tag size={19} />
                        </div>
                        <span>Label</span>
                      </button>

                      {/* Dashed Toggle */}
                      <button
                        className={`mobile-action-btn ${Boolean(selectedElement.style?.is_dashed) ? 'active' : ''}`}
                        onClick={() => {
                          onStyleChange?.(selectedElement.id, {
                            ...(selectedElement.style || {}),
                            is_dashed: !Boolean(selectedElement.style?.is_dashed)
                          });
                        }}
                        title="Toggle Dashed Line"
                      >
                        <div className="mobile-action-icon-box">
                          <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="4 3" strokeLinecap="round">
                            <line x1="3" y1="15" x2="15" y2="3" />
                          </svg>
                        </div>
                        <span>Dashed</span>
                      </button>

                      {/* Weight Selector */}
                      <button
                        className={`mobile-action-btn ${showLineWeightMenu ? 'active' : ''}`}
                        onClick={() => {
                          setShowLineWeightMenu(!showLineWeightMenu);
                          setShowColorPalette(false);
                        }}
                        title="Line weight"
                      >
                        <div className="mobile-action-icon-box">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                            <div style={{ width: '18px', height: `${selectedElement.style?.line_weight || 2}px`, backgroundColor: 'currentColor', borderRadius: '1px' }} />
                          </div>
                        </div>
                        <span>Weight</span>
                      </button>
                    </>
                  )}

                  {/* NESTED BOARD ACTIONS */}
                  {selectedElement?.element_type === 'nested_board' && (
                    <>
                      <button className="mobile-action-btn" onClick={() => onSetIcon?.(selectedElement.id, 'FolderPlus')} title="Board icon">
                        <div className="mobile-action-icon-box"><Folder size={19} /></div>
                        <span>Icon</span>
                      </button>
                      <button className="mobile-action-btn" onClick={() => onRename?.(selectedElement.id)} title="Rename board">
                        <div className="mobile-action-icon-box"><Type size={19} /></div>
                        <span>Rename</span>
                      </button>
                    </>
                  )}

                  {/* IMAGE ACTIONS */}
                  {selectedElement?.element_type === 'image' && (
                    <>
                      <button
                        className="mobile-action-btn"
                        onClick={() => imageFileInputRef.current?.click()}
                        title="Upload or replace image"
                      >
                        <div className="mobile-action-icon-box"><Upload size={19} /></div>
                        <span>Upload</span>
                      </button>
                      <button className="mobile-action-btn" onClick={() => onToggleCaption?.(selectedElement.id)} title="Toggle caption">
                        <div className="mobile-action-icon-box"><Type size={19} /></div>
                        <span>Caption</span>
                      </button>
                    </>
                  )}

                  {/* LINK ACTIONS */}
                  {selectedElement?.element_type === 'link' && (
                    <button className="mobile-action-btn" onClick={() => onToggleCaption?.(selectedElement.id)} title="Toggle caption">
                      <div className="mobile-action-icon-box"><Type size={19} /></div>
                      <span>Caption</span>
                    </button>
                  )}

                  {/* COLUMN ACTIONS */}
                  {selectedElement?.element_type === 'column' && (
                    <button className="mobile-action-btn" onClick={() => onRename?.(selectedElement.id)} title="Rename column">
                      <div className="mobile-action-icon-box"><Type size={19} /></div>
                      <span>Title</span>
                    </button>
                  )}

                  {/* Comment Action Button */}
                  {selectedElement && selectedElement.element_type !== 'comment' && (
                    <button
                      className="mobile-action-btn"
                      onClick={() => selectedElement && onAddCommentPin?.(selectedElement.id)}
                      title="Add comment"
                    >
                      <div className="mobile-action-icon-box"><MessageSquarePlus size={19} /></div>
                      <span>Comment</span>
                    </button>
                  )}

                  {/* More ('...') Button -> Opens Context Menu */}
                  <button
                    className="mobile-action-btn"
                    onClick={() => setShowMoreContextMenu(true)}
                    title="More actions"
                  >
                    <div className="mobile-action-icon-box">
                      <MoreHorizontal size={19} />
                    </div>
                    <span>More</span>
                  </button>
                </>
              )}
            </div>

            {/* Right: Done Text Button (Deselects item or cell selection) */}
            <button
              className="mobile-done-btn"
              onClick={() => {
                if (isCellSelected) {
                  onDeselectTableCells?.();
                } else {
                  onDeselect();
                }
              }}
              title="Done"
            >
              Done
            </button>
          </div>
        ) : activeMenu === 'system' ? (
          /* ===================================================================
              SCREEN 2: SYSTEM / UTILITIES BAR (CLICKING '...' IN SCREEN 1)
              =================================================================== */
          <div className="mobile-bar-system-layout">
            <div className="mobile-system-group left">
              <button
                className={`mobile-system-btn ${!canUndo ? 'disabled' : ''}`}
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo"
              >
                <Undo2 size={21} />
                <span>Undo</span>
              </button>
              <button
                className={`mobile-system-btn ${!canRedo ? 'disabled' : ''}`}
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo"
              >
                <Redo2 size={21} />
                <span>Redo</span>
              </button>
            </div>

            <div className="mobile-system-divider" />

            <div className="mobile-system-group right">
              <button
                className="mobile-system-btn"
                onClick={() => {}}
                title="Help"
              >
                <HelpCircle size={21} />
                <span>Help</span>
              </button>

              <button
                className="mobile-system-btn"
                onClick={() => {
                  onOpenSearch();
                  setActiveMenu('default');
                }}
                title="Search workspace"
              >
                <Search size={21} />
                <span>Search</span>
              </button>

              <button
                className="mobile-system-btn"
                onClick={() => {
                  onOpenSyncSettings?.();
                  setActiveMenu('default');
                }}
                title="Sync & Pairing"
              >
                <RefreshCw size={21} />
                <span>Sync</span>
              </button>

              <button
                className="mobile-system-btn"
                onClick={() => {}}
                title="Activity"
              >
                <Bell size={21} />
                <span>Activity</span>
              </button>

              <button
                className="mobile-system-btn"
                onClick={() => {
                  onOpenSyncSettings?.();
                  setActiveMenu('default');
                }}
                title="Settings & Workspace"
              >
                <Settings size={21} />
                <span>Settings</span>
              </button>
            </div>
          </div>
        ) : activeMenu === 'tools' ? (
          /* ===================================================================
              SCREEN 3: HORIZONTAL TOOL CREATION SHELF (CLICKING '+' IN SCREEN 1)
              =================================================================== */
          <div className="mobile-bar-tools-layout">
            <div className="mobile-tools-scroll-row">
              {TOOL_SHELF_ITEMS.map((item) => (
                <button
                  key={item.tool}
                  className={`mobile-tool-dock-item ${activeTool === item.tool ? 'active' : ''}`}
                  onPointerDown={(e) => handleToolPointerDown(item, e)}
                  onClick={() => {
                    if (!isDraggingToolRef.current) {
                      handleToolClick(item.tool);
                    }
                  }}
                  title={item.label}
                >
                  <div className={`mobile-tool-dock-icon ${item.isBlue ? 'board-blue' : ''}`}>
                    {item.icon}
                  </div>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ===================================================================
              SCREEN 1: DEFAULT BOARD BOTTOM BAR (IMAGE 1)
              =================================================================== */
          <div className="mobile-bar-default-layout">
            {/* Left: '...' Button */}
            <button
              className="mobile-bar-icon-trigger"
              onClick={handleToggleSystemMenu}
              title="Open utilities menu"
              aria-label="Open utilities menu"
            >
              <MoreHorizontal size={22} />
            </button>

            {/* Center: Segmented Tab Switcher [ Your boards | Quick notes ] */}
            <div className="mobile-segmented-tabs">
              <button
                className={`mobile-tab-btn ${!isUnsortedOpen ? 'active' : ''}`}
                onClick={onOpenBoardsMenu}
                title="Your boards"
              >
                Your boards
              </button>
              <button
                className={`mobile-tab-btn ${isUnsortedOpen ? 'active' : ''}`}
                onClick={onOpenUnsorted}
                title="Quick notes"
              >
                Quick notes
              </button>
            </div>

            {/* Right: '+' Button */}
            <button
              className="mobile-bar-icon-trigger"
              onClick={handleToggleToolsMenu}
              title="Add element to board"
              aria-label="Add element to board"
            >
              <Plus size={22} />
            </button>
          </div>
        )}
      </nav>
    </>
  );
};
