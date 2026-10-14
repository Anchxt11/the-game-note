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
  List,
  ListOrdered,
  Indent,
  Outdent,
  AlignCenter,
  Code
} from 'lucide-react';

interface MobileBottomBarProps {
  currentBoardId: string;
  boardTitle: string;
  unsortedCount: number;
  onOpenUnsorted: () => void;
  onOpenBoardsMenu?: () => void;
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
  onSetTaskDueDate?: (id: string, date: string) => void;
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
}) => {
  // Navigation mode: 'default' | 'system' | 'tools'
  const [activeMenu, setActiveMenu] = useState<'default' | 'system' | 'tools'>('default');
  const [showMoreContextMenu, setShowMoreContextMenu] = useState(false);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [colorMode, setColorMode] = useState<'background' | 'top_strip'>('background');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Touch drag-and-drop state for tool shelf
  const [draggedTool, setDraggedTool] = useState<{
    tool: ToolType;
    label: string;
    icon: React.ReactNode;
    isBlue?: boolean;
    x: number;
    y: number;
  } | null>(null);
  const toolPointerStartRef = useRef<{
    x: number;
    y: number;
    tool: ToolType;
    label: string;
    icon: React.ReactNode;
    isBlue?: boolean;
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
    }
  }, [resetTrigger]);

  // If selection changes, reset submenus
  useEffect(() => {
    if (!hasSelection) {
      setShowMoreContextMenu(false);
      setShowColorPalette(false);
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
        !target.closest('.mobile-context-sheet') &&
        !target.closest('.mobile-two-finger-sheet')
      ) {
        if (activeMenu !== 'default' || showColorPalette || showMoreContextMenu) {
          setActiveMenu('default');
          setShowColorPalette(false);
          setShowMoreContextMenu(false);
        }
      }
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => window.removeEventListener('pointerdown', handleWindowPointerDown);
  }, [activeMenu, showColorPalette, showMoreContextMenu]);

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
    e: React.PointerEvent
  ) => {
    toolPointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tool: item.tool,
      label: item.label,
      icon: item.icon,
      isBlue: item.isBlue,
    };
    isDraggingToolRef.current = false;

    const handlePointerMove = (evt: PointerEvent) => {
      if (!toolPointerStartRef.current) return;
      const dy = evt.clientY - toolPointerStartRef.current.y;
      const dist = Math.hypot(evt.clientX - toolPointerStartRef.current.x, dy);

      if (!isDraggingToolRef.current && (dist > 14 || dy < -8)) {
        isDraggingToolRef.current = true;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate(25); } catch (_) {}
        }
      }

      if (isDraggingToolRef.current) {
        setDraggedTool({
          tool: toolPointerStartRef.current.tool,
          label: toolPointerStartRef.current.label,
          icon: toolPointerStartRef.current.icon,
          isBlue: toolPointerStartRef.current.isBlue,
          x: evt.clientX,
          y: evt.clientY,
        });
      }
    };

    const handlePointerUp = (evt: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (isDraggingToolRef.current && toolPointerStartRef.current) {
        const bottomBarEl = document.querySelector('.mobile-main-bottom-bar');
        const bottomBarTop = bottomBarEl ? bottomBarEl.getBoundingClientRect().top : (window.innerHeight - 70);

        if (evt.clientY < bottomBarTop) {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate(30); } catch (_) {}
          }
          onDropToolAtScreen?.(toolPointerStartRef.current.tool, evt.clientX, evt.clientY);
          setActiveMenu('default');
        }
        setDraggedTool(null);
      }

      toolPointerStartRef.current = null;
      isDraggingToolRef.current = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
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

  const handleTextFormat = (cmd: string, val: string = '') => {
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
        const editor = document.querySelector(`#milanote-el-${editingElement.id} .note-rich-editor`) as HTMLElement | null;
        if (editor) {
          onContentChange?.(editingElement.id, { ...editingElement.content, text: editor.innerHTML });
        }
      }, 10);
    }
  };

  return (
    <>
      {/* TOP-RIGHT FLOATING UNSORTED PILL (IMAGES 1, 2, 3, 4, 5) */}
      {!isTyping && (
        <button
          className="mobile-unsorted-floating-pill"
          onClick={onOpenUnsorted}
          title="Open Unsorted drawer"
        >
          <span>{unsortedCount} Unsorted</span>
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
      {showColorPalette && hasSelection && (
        <div
          className="mobile-color-drawer"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mode Switcher Tabs for elements supporting Top Strip */}
          {selectedElement?.element_type !== 'nested_board' && selectedElement?.element_type !== 'line' && (
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
            {colorMode === 'top_strip' && (
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
              const isSelected = colorMode === 'background'
                ? (currentBgColor === col || (!currentBgColor && isTransparent))
                : (currentTopStrip === col);

              return (
                <button
                  key={idx}
                  className={`mobile-color-swatch-box ${isTransparent ? 'color-swatch-transparent-grid' : ''} ${isSelected ? 'selected' : ''}`}
                  style={colorMode === 'background' ? { backgroundColor: isTransparent ? undefined : col } : { backgroundColor: '#353c48' }}
                  onClick={() => handleColorSelect(col)}
                  title={col}
                >
                  {colorMode === 'top_strip' && !isTransparent && (
                    <div className="color-swatch-top-strip-preview" style={{ backgroundColor: col }} />
                  )}
                  {isSelected && <Check size={14} color="#ffffff" />}
                </button>
              );
            })}
          </div>

          {/* Grid 2: Lettered Presets (In Background Mode) */}
          {colorMode === 'background' && (
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
              const isSelected = colorMode === 'background' ? (currentBgColor === col) : (currentTopStrip === col);
              return (
                <button
                  key={idx}
                  className={`mobile-color-swatch-box ${isSelected ? 'selected' : ''}`}
                  style={colorMode === 'background' ? { backgroundColor: col } : { backgroundColor: '#353c48' }}
                  onClick={() => handleColorSelect(col)}
                  title={col}
                >
                  {colorMode === 'top_strip' && (
                    <div className="color-swatch-top-strip-preview" style={{ backgroundColor: col }} />
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
              {/* Color Action Button */}
              <button
                className={`mobile-action-btn ${showColorPalette ? 'active' : ''}`}
                onClick={() => setShowColorPalette(!showColorPalette)}
                title="Change color theme"
              >
                <div
                  className="mobile-action-icon-box color-indicator"
                  style={{
                    backgroundColor: currentBgColor || 'rgba(255, 255, 255, 0.1)',
                    borderColor: 'rgba(255, 255, 255, 0.4)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {currentTopStrip && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', backgroundColor: currentTopStrip }} />
                  )}
                </div>
                <span>Color</span>
              </button>

              {/* Type-Specific Action Buttons */}
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

              {selectedElement?.element_type === 'task_list' && (
                <>
                  <button className="mobile-action-btn" onClick={() => onToggleTaskTitle?.(selectedElement.id)} title="Toggle title">
                    <div className="mobile-action-icon-box"><Type size={19} /></div>
                    <span>Title</span>
                  </button>
                  <button className="mobile-action-btn" onClick={() => onSetTaskDueDate?.(selectedElement.id, new Date().toISOString().split('T')[0])} title="Due date">
                    <div className="mobile-action-icon-box"><Calendar size={19} /></div>
                    <span>Due date</span>
                  </button>
                </>
              )}

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

              {(selectedElement?.element_type === 'image' || selectedElement?.element_type === 'link') && (
                <button className="mobile-action-btn" onClick={() => onToggleCaption?.(selectedElement.id)} title="Toggle caption">
                  <div className="mobile-action-icon-box"><Type size={19} /></div>
                  <span>Caption</span>
                </button>
              )}

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

              {/* More ('...') Button -> Opens Screen 5 Context Menu */}
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
            </div>

            {/* Right: Done Text Button (Deselects item) */}
            <button
              className="mobile-done-btn"
              onClick={onDeselect}
              title="Done editing card"
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
                onClick={() => {}}
                title="Activity"
              >
                <Bell size={21} />
                <span>Activity</span>
              </button>

              <button
                className="mobile-system-btn"
                onClick={() => {}}
                title="Settings"
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
