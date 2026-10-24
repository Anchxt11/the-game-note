import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Element, ElementPositionUpdate, ToolType, CardColorTint, TableSubTarget } from './types';
import { Toolbar } from './components/Toolbar';
import { TextEditSubSidebar } from './components/TextEditSubSidebar';
import { NoteActionSidebar } from './components/NoteActionSidebar';
import { LinkActionSidebar } from './components/LinkActionSidebar';
import { TaskActionSidebar } from './components/TaskActionSidebar';
import { BoardActionSidebar } from './components/BoardActionSidebar';
import { CommentActionSidebar } from './components/CommentActionSidebar';
import { ColumnActionSidebar } from './components/ColumnActionSidebar';
import { ImageActionSidebar } from './components/ImageActionSidebar';
import { LineActionSidebar } from './components/LineActionSidebar';
import { TableActionSidebar } from './components/TableActionSidebar';
import { CellActionSidebar } from './components/CellActionSidebar';
import { Canvas } from './components/Canvas';
import { ContextMenu } from './components/ContextMenu';
import { SearchModal } from './components/SearchModal';
import { MobileBottomBar } from './components/MobileBottomBar';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import { SyncSettingsModal } from './components/SyncSettingsModal';
import { isPhoneScreen, isTouchPrimary, isTablet, isAndroidTablet, getDeviceCategory } from './utils/platform';
import { ipcService, syncService, resolveBoardId, CANONICAL_ROOT_BOARD_ID } from './services/ipc';
import { imageCache } from './services/imageCache';
import { getConnectedLinesToDelete, pruneOrphanedLines } from './utils/lineUtils';
import { listen } from '@tauri-apps/api/event';
import { 
  Search as SearchIcon, 
  Undo2, 
  Redo2, 
  Smartphone, 
  HelpCircle, 
  Bell, 
  Settings,
  Folder,
  Users,
  ChevronDown,
  ChevronLeft,
  UserPlus,
  Minimize2,
  ArrowLeft
} from 'lucide-react';
import './index.css';

export const App: React.FC = () => {
  const [elements, setElements] = useState<Element[]>([]);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [renamingLinkId, setRenamingLinkId] = useState<string | null>(null);
  const [canvasScale, setCanvasScale] = useState<number>(1.0);
  const [minCanvasScale, setMinCanvasScale] = useState<number>(0.40);
  const [isUnsortedDrawerOpen, setIsUnsortedDrawerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSyncSettingsOpen, setIsSyncSettingsOpen] = useState(false);
  const [selectedTableCells, setSelectedTableCells] = useState<{ tableId: string; cellIndices: number[] } | null>(null);
  const pendingUnsortedBoardsRef = useRef<Set<string>>(new Set());
  
  // Undo & Redo Stacks
  const [undoStack, setUndoStack] = useState<Element[][]>([]);
  const [redoStack, setRedoStack] = useState<Element[][]>([]);

  // Trash Bin detection state
  const [isHoveringTrash, setIsHoveringTrash] = useState<boolean>(false);

  // Context Menu and Clipboard state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canvasX?: number; canvasY?: number; element: Element | null; tableSubTarget?: TableSubTarget } | null>(null);
  const [, setWindowResizeTrigger] = useState(0);
  useEffect(() => {
    const handleResize = () => setWindowResizeTrigger((v) => v + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [clipboardElements, setClipboardElements] = useState<Element[]>(() => {
    try {
      const stored = localStorage.getItem('milanote_clipboard');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Active Board Navigation
  const [currentBoardId, setCurrentBoardId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('milanote_current_board');
      if (stored && stored !== 'root-board' && stored !== '00000000-0000-0000-0000-000000000001') {
        return stored;
      }
      return CANONICAL_ROOT_BOARD_ID;
    } catch { return CANONICAL_ROOT_BOARD_ID; }
  });
  const [boardHistory, setBoardHistory] = useState<Array<{ id: string; title: string }>>(() => {
    try {
      const stored = localStorage.getItem('milanote_board_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any, idx: number) => {
            let id = item.id;
            if (id === 'root-board' || id === '00000000-0000-0000-0000-000000000001') {
              id = CANONICAL_ROOT_BOARD_ID;
            }
            if (idx === 0 && (item.title === 'Welcome to Antigravity Board' || !item.title)) {
              return { ...item, id, title: 'Home' };
            }
            return { ...item, id };
          });
        }
      }
      return [{ id: CANONICAL_ROOT_BOARD_ID, title: 'Home' }];
    } catch { return [{ id: CANONICAL_ROOT_BOARD_ID, title: 'Home' }]; }
  });
  
  useEffect(() => {
    localStorage.setItem('milanote_current_board', currentBoardId);
  }, [currentBoardId]);

  useEffect(() => {
    localStorage.setItem('milanote_board_history', JSON.stringify(boardHistory));
  }, [boardHistory]);

  useEffect(() => {
    const updateDeviceClasses = () => {
      const cat = getDeviceCategory();
      if (cat === 'tablet') {
        document.body.classList.add('device-tablet');
        document.body.classList.remove('device-phone');
      } else if (cat === 'phone') {
        document.body.classList.add('device-phone');
        document.body.classList.remove('device-tablet');
      } else {
        document.body.classList.remove('device-phone');
        document.body.classList.remove('device-tablet');
      }
    };
    updateDeviceClasses();
    window.addEventListener('resize', updateDeviceClasses);
    return () => window.removeEventListener('resize', updateDeviceClasses);
  }, []);

  const [showViewMenu, setShowViewMenu] = useState<boolean>(false);
  const [isPresentationMode, setIsPresentationMode] = useState<boolean>(false);
  const [dragHoverBoardId, setDragHoverBoardId] = useState<string | null>(null);
  const [twoFingerMenu, setTwoFingerMenu] = useState<{ canvasX: number; canvasY: number } | null>(null);
  const [resetMobileBarTrigger, setResetMobileBarTrigger] = useState<number>(0);

  const handleCanvasClick = useCallback(() => {
    setResetMobileBarTrigger((prev) => prev + 1);
    setTwoFingerMenu(null);
    setIsUnsortedDrawerOpen(false);
    setEditingElementId(null);
  }, []);

  const recordHistory = useCallback((currentState: Element[]) => {
    setUndoStack((prev) => [...prev.slice(-30), currentState]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const previousState = undoStack[undoStack.length - 1];
    const nextUndo = undoStack.slice(0, -1);

    setUndoStack(nextUndo);
    setRedoStack((prev) => [elements, ...prev]);
    setElements(previousState);
    setSelectedElementId(null);
    setSelectedIds([]);
    setEditingElementId(null);
    setContextMenu(null);

    try {
      await ipcService.syncBoardState(currentBoardId, previousState);
    } catch (e) {
      console.error('Failed to sync undo state:', e);
    }
  }, [undoStack, elements, currentBoardId]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[0];
    const nextRedo = redoStack.slice(1);

    setRedoStack(nextRedo);
    setUndoStack((prev) => [...prev, elements]);
    setElements(nextState);
    setSelectedElementId(null);
    setSelectedIds([]);
    setEditingElementId(null);
    setContextMenu(null);

    try {
      await ipcService.syncBoardState(currentBoardId, nextState);
    } catch (e) {
      console.error('Failed to sync redo state:', e);
    }
  }, [redoStack, elements, currentBoardId]);

  const loadElements = useCallback(async (boardId: string) => {
    try {
      const data = await ipcService.getElementsForBoard(boardId);
      const { validElements, orphanedLineIds } = pruneOrphanedLines(data);
      if (orphanedLineIds.length > 0) {
        orphanedLineIds.forEach((id) => ipcService.deleteElement(id).catch(console.error));
      }
      setElements(validElements);
      setUndoStack([]);
      setRedoStack([]);
    } catch (e) {
      console.error('Failed to load elements:', e);
    }
  }, []);

  // Canvas Element Loader & Non-blocking Background Sync
  useEffect(() => {
    loadElements(currentBoardId);
    syncService.triggerSync().catch((e) => console.warn('Background sync note:', e));
    try {
      let savedBg = localStorage.getItem(`milanote_bg_${currentBoardId}`) || 'rgb(35, 35, 35)';
      if (savedBg === '#1f2125') savedBg = 'rgb(35, 35, 35)';
      document.documentElement.style.setProperty('--milanote-canvas-bg', savedBg);
    } catch {}
  }, [currentBoardId, loadElements]);

  const currentBoardIdRef = useRef(currentBoardId);
  currentBoardIdRef.current = currentBoardId;

  const editingElementIdRef = useRef(editingElementId);
  editingElementIdRef.current = editingElementId;

  // Phase 5: Reactive UI refresh when background sync merges changes (Task 5.9)
  const refreshCurrentBoardElements = useCallback(async () => {
    try {
      const activeBoardId = currentBoardIdRef.current;
      const data = await ipcService.getElementsForBoard(activeBoardId);
      const { validElements, orphanedLineIds } = pruneOrphanedLines(data);
      if (orphanedLineIds.length > 0) {
        orphanedLineIds.forEach((id) => ipcService.deleteElement(id).catch(console.error));
      }
      setElements((prev) => {
        const editingId = editingElementIdRef.current;
        if (editingId) {
          const currentlyEditing = prev.find((e) => e.id === editingId);
          if (currentlyEditing) {
            return validElements.map((d) => (d.id === editingId ? currentlyEditing : d));
          }
        }
        return validElements;
      });
      // Also update board title if it was modified remotely
      try {
        const allBoards = await ipcService.listBoards(null);
        const resolvedCurrentId = await resolveBoardId(activeBoardId);
        const current = allBoards.find((b) => b.id === resolvedCurrentId);
        if (current) {
          const displayTitle = (current.title === 'Welcome to Antigravity Board' || !current.title) ? 'Home' : current.title;
          setBoardHistory((prev) => {
            if (prev.length === 1 && prev[0].title !== displayTitle) {
              return [{ id: prev[0].id, title: displayTitle }];
            }
            return prev;
          });
        }
      } catch (_) {}
    } catch (e) {
      console.error('Failed to refresh elements after sync:', e);
    }
  }, []);

  // Initial check to normalize root board title to 'Home' across all platforms
  useEffect(() => {
    (async () => {
      try {
        const allBoards = await ipcService.listBoards(null);
        if (allBoards.length > 0) {
          const rootBoard = allBoards[0];
          if (rootBoard.title === 'Welcome to Antigravity Board' || !rootBoard.title) {
            await ipcService.updateBoard(rootBoard.id, 'Home');
            setBoardHistory((prev) => prev.map((item, i) => i === 0 ? { ...item, title: 'Home' } : item));
          } else {
            setBoardHistory((prev) => prev.map((item, i) => i === 0 ? { ...item, title: rootBoard.title || 'Home' } : item));
          }
        }
      } catch (err) {
        console.error('Failed to normalize root board title:', err);
      }
    })();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let coalesceTimer: any = null;

    listen('sync-applied', () => {
      if (coalesceTimer) clearTimeout(coalesceTimer);
      coalesceTimer = setTimeout(() => {
        refreshCurrentBoardElements();
      }, 30);
    }).then((unsub) => {
      unlisten = unsub;
    });

    return () => {
      if (unlisten) unlisten();
      if (coalesceTimer) clearTimeout(coalesceTimer);
    };
  }, [refreshCurrentBoardElements]);

  // Phase 5: Continuous background auto-sync (every 2s) + reload on app open/focus/resume
  useEffect(() => {
    const triggerSyncCycle = async () => {
      try {
        const results = await syncService.triggerSync();
        let changesCount = 0;
        if (Array.isArray(results)) {
          for (const item of results) {
            const stats = Array.isArray(item) ? item[1] : item;
            if (stats && typeof stats === 'object') {
              changesCount += (stats.rows_pulled || 0) + (stats.rows_pushed || 0);
            }
          }
        } else if (results && typeof results === 'object') {
          for (const res of Object.values(results) as any[]) {
            const stats = Array.isArray(res) ? res[1] : res;
            if (stats && typeof stats === 'object') {
              changesCount += (stats.rows_pulled || 0) + (stats.rows_pushed || 0);
            }
          }
        }
        if (changesCount > 0) {
          await refreshCurrentBoardElements();
        }
      } catch (_) {}
    };

    // 1. Immediate sync on app launch / reload
    triggerSyncCycle();

    // 2. On window focus or app visibility change (e.g. Android app resumed from background)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        triggerSyncCycle();
        refreshCurrentBoardElements();
      }
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    // 3. Periodic continuous sync timer: syncs every 2 seconds
    const intervalTimer = setInterval(triggerSyncCycle, 2000);

    return () => {
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(intervalTimer);
    };
  }, [refreshCurrentBoardElements]);

  // Phase 5: Debounced sync on local write (sub-second sync)
  const syncDebounceRef = useRef<any>(null);
  const queueDebouncedSync = useCallback((immediate = false) => {
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    const doSync = async () => {
      try {
        const results = await syncService.triggerSync();
        let pulled = 0;
        if (Array.isArray(results)) {
          for (const item of results) {
            const stats = Array.isArray(item) ? item[1] : item;
            if (stats && typeof stats === 'object') {
              pulled += stats.rows_pulled || 0;
            }
          }
        }
        if (pulled > 0) {
          await refreshCurrentBoardElements();
        }
      } catch (_) {}
    };
    if (immediate) {
      doSync();
    } else {
      syncDebounceRef.current = setTimeout(doSync, 150);
    }
  }, [refreshCurrentBoardElements]);

  const handleDelete = useCallback(async (idToDelete?: string | string[]) => {
    let idsToDelete: string[] = [];
    if (Array.isArray(idToDelete)) {
      idsToDelete = Array.from(new Set(idToDelete));
    } else {
      const targetId = idToDelete || contextMenu?.element?.id || selectedElementId;
      if (targetId && selectedIds.includes(targetId)) {
        idsToDelete = Array.from(new Set([...selectedIds, targetId]));
      } else if (targetId) {
        idsToDelete = [targetId];
      } else if (selectedIds.length > 0 || selectedElementId) {
        idsToDelete = Array.from(new Set([...selectedIds, selectedElementId || ''].filter(Boolean)));
      }
    }
    if (idsToDelete.length === 0) return;

    // Find any connected arrows according to the rules:
    // 1) The arrow has 2 elements and one of them is deleted -> delete the arrow
    // 2) The arrow has only 1 element and that element has been deleted -> delete the arrow
    // Standalone arrows (not connected to 2 elements or 1 element) are preserved!
    const connectedLineIds = getConnectedLinesToDelete(idsToDelete, elements);
    const finalIdsToDelete = Array.from(new Set([...idsToDelete, ...connectedLineIds]));

    recordHistory(elements);
    setElements((prev) => prev.filter((el) => !finalIdsToDelete.includes(el.id)));
    setSelectedElementId(null);
    setSelectedIds([]);
    setEditingElementId(null);
    setContextMenu(null);
    for (const delId of finalIdsToDelete) {
      try {
        await ipcService.deleteElement(delId);
      } catch (e) {
        console.error('Failed to delete element:', e);
      }
    }
    queueDebouncedSync(true);
  }, [contextMenu, selectedElementId, selectedIds, elements, recordHistory, queueDebouncedSync]);

  const handleCopy = useCallback((targetId?: string) => {
    const idsToCopy = selectedIds.length > 0 
      ? selectedIds 
      : targetId 
        ? [targetId] 
        : selectedElementId 
          ? [selectedElementId] 
          : (contextMenu?.element ? [contextMenu.element.id] : []);
    if (idsToCopy.length === 0) return;
    const copies = elements.filter((el) => idsToCopy.includes(el.id)).map((el) => JSON.parse(JSON.stringify(el)));
    setClipboardElements(copies);
    try { localStorage.setItem('milanote_clipboard', JSON.stringify(copies)); } catch {}
  }, [selectedIds, selectedElementId, elements, contextMenu]);

  const handleCut = useCallback((targetId?: string) => {
    const idsToCopy = selectedIds.length > 0 
      ? selectedIds 
      : targetId 
        ? [targetId] 
        : selectedElementId 
          ? [selectedElementId] 
          : (contextMenu?.element ? [contextMenu.element.id] : []);
    if (idsToCopy.length === 0) return;
    const copies = elements.filter((el) => idsToCopy.includes(el.id)).map((el) => JSON.parse(JSON.stringify(el)));
    setClipboardElements(copies);
    try { localStorage.setItem('milanote_clipboard', JSON.stringify(copies)); } catch {}

    handleDelete(idsToCopy);
  }, [selectedIds, selectedElementId, elements, contextMenu, handleDelete]);

  const handlePaste = useCallback((targetX?: number, targetY?: number) => {
    if (!clipboardElements || clipboardElements.length === 0) return;
    recordHistory(elements);
    
    let offsetX = 30;
    let offsetY = 30;
    if (targetX !== undefined && targetY !== undefined && clipboardElements.length > 0) {
      const minX = Math.min(...clipboardElements.map((el) => el.x));
      const minY = Math.min(...clipboardElements.map((el) => el.y));
      offsetX = targetX - minX;
      offsetY = targetY - minY;
    }

    const newElements: Element[] = clipboardElements.map((item, idx) => {
      const newId = crypto.randomUUID();
      const newEl: Element = {
        ...JSON.parse(JSON.stringify(item)),
        id: newId,
        board_id: currentBoardId || item.board_id,
        x: targetX !== undefined && targetY !== undefined ? item.x + offsetX : item.x + 30 * (idx + 1),
        y: targetX !== undefined && targetY !== undefined ? item.y + offsetY : item.y + 30 * (idx + 1),
      };
      ipcService.createElement(newEl).catch(console.error);
      return newEl;
    });

    setElements((prev) => [...prev, ...newElements]);
    setSelectedIds(newElements.map((el) => el.id));
    setSelectedElementId(newElements.length === 1 ? newElements[0].id : null);
    setContextMenu(null);
    queueDebouncedSync(true);
  }, [clipboardElements, elements, recordHistory, currentBoardId, queueDebouncedSync]);

  const handleSelectAll = useCallback(() => {
    const allIds = elements.map((el) => el.id);
    setSelectedIds(allIds);
    setSelectedElementId(null);
    setEditingElementId(null);
    setContextMenu(null);
  }, [elements]);

  const handleChangeBoardBackground = useCallback((color: string) => {
    document.documentElement.style.setProperty('--milanote-canvas-bg', color);
    try { localStorage.setItem(`milanote_bg_${currentBoardId}`, color); } catch {}
  }, [currentBoardId]);

  // GUARANTEED BACKSPACE & DELETE KEY DELETION + UNDO/REDO KEYBOARD SHORTCUTS
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || activeEl?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
          return;
        } else if (!isTyping) {
          e.preventDefault();
          handleUndo();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        if (!isTyping) {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        if (!isTyping && !editingElementId) {
          e.preventDefault();
          handleSelectAll();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (!isTyping && !editingElementId) {
          e.preventDefault();
          handleCopy();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) {
        if (!isTyping && !editingElementId) {
          e.preventDefault();
          handleCut();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        if (!isTyping && !editingElementId) {
          e.preventDefault();
          handlePaste();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
        return;
      }

      if (isTyping || editingElementId) return;

      if (e.key === 'Delete' || e.key === 'Del' || e.key === 'Backspace') {
        const toDelete = Array.from(new Set([...selectedIds, selectedElementId || ''].filter(Boolean)));
        if (toDelete.length > 0) {
          e.preventDefault();
          handleDelete(toDelete);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, selectedElementId, editingElementId, elements, handleUndo, handleRedo, recordHistory, handleCopy, handleCut, handlePaste, handleSelectAll, handleDelete]);

  const [isElementBeingDragged, setIsElementBeingDragged] = useState(false);

  const handleSwitchBoard = useCallback((boardId: string, title?: string, isRoot: boolean = false) => {
    setCurrentBoardId(boardId);
    setSelectedElementId(null);
    setSelectedIds([]);
    setEditingElementId(null);
    setIsUnsortedDrawerOpen(false);
    if (isRoot) {
      setBoardHistory([{ id: boardId, title: title || 'Home' }]);
    } else {
      setBoardHistory((prev) => {
        if (prev.some(p => p.id === boardId)) {
          return prev.slice(0, prev.findIndex(p => p.id === boardId) + 1);
        }
        return [...prev, { id: boardId, title: title || 'Board' }];
      });
    }
  }, []);

  const handleOpenBoard = useCallback((targetBoardId: string, keepSelection: boolean = false) => {
    const el = elements.find((x) => x.id === targetBoardId || x.content?.target_board_id === targetBoardId);
    const realBoardId = el?.content?.target_board_id || targetBoardId;
    const title = el?.content?.title || el?.content?.preview_title || 'Board';
    handleSwitchBoard(realBoardId, title, false);
    if (!keepSelection) {
      setSelectedElementId(null);
      setSelectedIds([]);
      setEditingElementId(null);
    }
    if (pendingUnsortedBoardsRef.current.has(realBoardId)) {
      setIsUnsortedDrawerOpen(true);
      pendingUnsortedBoardsRef.current.delete(realBoardId);
    } else if (!keepSelection) {
      setIsUnsortedDrawerOpen(false);
    }
  }, [elements, handleSwitchBoard]);

  const handleMoveElementToBoard = useCallback(async (elementId: string, targetBoardId: string, x?: number, y?: number, isFromBreadcrumb?: boolean, isEnterHover?: boolean) => {
    recordHistory(elements);
    const elToMove = elements.find((el) => el.id === elementId);
    if (!elToMove) return;

    let resolvedTargetId = targetBoardId;
    const boardElement = elements.find((el) => (el.id === targetBoardId || el.content?.target_board_id === targetBoardId) && el.element_type === 'nested_board');
    if (boardElement) {
      if (boardElement.content?.target_board_id) {
        resolvedTargetId = boardElement.content.target_board_id;
      } else {
        try {
          const newBoard = await ipcService.createBoard(boardElement.content?.title || 'New Board', currentBoardId);
          resolvedTargetId = newBoard.id;
          boardElement.content = { ...boardElement.content, target_board_id: newBoard.id };
          await ipcService.updateElementContent(boardElement.id, boardElement.content);
        } catch (err) {
          console.error('Failed to create board for nested element:', err);
        }
      }
    }

    const connectedLineIds = getConnectedLinesToDelete([elementId], elements);
    const idsToRemove = [elementId, ...connectedLineIds];
    setElements((prev) => prev.filter((el) => !idsToRemove.includes(el.id)));
    for (const lineId of connectedLineIds) {
      ipcService.deleteElement(lineId).catch(console.error);
    }
    try {
      await ipcService.updateElementBoardId(elementId, resolvedTargetId);
      if (isEnterHover && x !== undefined && y !== undefined && elToMove) {
        await ipcService.updateElementStyle(elementId, { ...(elToMove.style || {}), is_unsorted: false });
        await ipcService.batchUpdateElementPositions([{ id: elementId, x, y, width: elToMove.width, height: elToMove.height, z_index: elToMove.z_index }]);
      } else if (isFromBreadcrumb && elToMove) {
        pendingUnsortedBoardsRef.current.add(resolvedTargetId);
        await ipcService.updateElementStyle(elementId, { ...(elToMove.style || {}), is_unsorted: true });
      } else if (elToMove) {
        const targetElements = await ipcService.getElementsForBoard(resolvedTargetId);
        const hasConflict = targetElements.some((e: any) => !e.style?.is_unsorted && e.id !== elementId && Math.abs((e.x || 0) - 100) < 150 && Math.abs((e.y || 0) - 100) < 150);
        if (hasConflict) {
          pendingUnsortedBoardsRef.current.add(resolvedTargetId);
          await ipcService.updateElementStyle(elementId, { ...(elToMove.style || {}), is_unsorted: true });
        } else {
          await ipcService.updateElementStyle(elementId, { ...(elToMove.style || {}), is_unsorted: false });
          await ipcService.batchUpdateElementPositions([{ id: elementId, x: 100, y: 100, width: elToMove.width, height: elToMove.height, z_index: elToMove.z_index }]);
        }
      }
    } catch (e) {
      console.error('Failed to move element to board:', e);
      setElements((prev) => [...prev, elToMove]);
    }
  }, [elements, recordHistory, currentBoardId]);

  const handleMoveToUnsorted = useCallback(async (id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el || el.element_type === 'line') return;
    recordHistory(elements);
    const updatedStyle = { ...(el.style || {}), is_unsorted: true };
    const updatedContent = el.element_type === 'comment' && el.content?.is_pinned 
      ? { ...el.content, is_pinned: false, pin_target_id: null, rel_x: 0, rel_y: 0 }
      : el.content;
    setElements((prev) => prev.map((item) => item.id === id ? { ...item, style: updatedStyle, content: updatedContent } : item));
    try {
      await ipcService.updateElementStyle(id, updatedStyle);
      if (el.element_type === 'comment' && el.content?.is_pinned) {
        await ipcService.updateElementContent(id, updatedContent);
      }
    } catch(e) {
      console.error(e);
    }
  }, [elements, recordHistory]);

  const handleUnsortedReorder = useCallback((sourceId: string, targetId: string) => {
    setElements((prev) => {
      const sourceIdx = prev.findIndex(e => e.id === sourceId);
      const targetIdx = prev.findIndex(e => e.id === targetId);
      if (sourceIdx === -1 || targetIdx === -1) return prev;
      const next = [...prev];
      const [removed] = next.splice(sourceIdx, 1);
      const newTargetIdx = next.findIndex(e => e.id === targetId);
      next.splice(sourceIdx < targetIdx ? newTargetIdx + 1 : newTargetIdx, 0, removed);
      return next;
    });
  }, []);

  const handleMoveFromUnsortedToCanvas = useCallback(async (element: Element, clientX: number, clientY: number) => {
    const viewportDiv = document.querySelector('.canvas-viewport') as HTMLElement;
    let x = 100;
    let y = 100;
    if (viewportDiv) {
      const rect = viewportDiv.getBoundingClientRect();
      const panX = parseFloat(viewportDiv.getAttribute('data-pan-x') || '0');
      const panY = parseFloat(viewportDiv.getAttribute('data-pan-y') || '0');
      x = Math.round((clientX - rect.left - panX) / canvasScale - (element.width || 200) / 2);
      y = Math.round((clientY - rect.top - panY) / canvasScale - (element.height || 60) / 2);
    }
    recordHistory(elements);
    const updatedStyle = { ...(element.style || {}), is_unsorted: false };
    setElements(prev => prev.map(el => el.id === element.id ? { ...el, x, y, style: updatedStyle } : el));
    try {
      await ipcService.updateElementStyle(element.id, updatedStyle);
      await ipcService.batchUpdateElementPositions([{ id: element.id, x, y, width: element.width, height: element.height, z_index: element.z_index }]);
    } catch (e) {
      console.error('Failed to move out of unsorted:', e);
    }
  }, [elements, recordHistory, canvasScale]);

  const handleMoveUnsortedElementToCanvasCenter = useCallback((element: Element) => {
    const vp = document.querySelector('.canvas-viewport') as HTMLElement | null;
    let clientX = window.innerWidth / 2;
    let clientY = window.innerHeight / 2;
    if (vp) {
      const rect = vp.getBoundingClientRect();
      clientX = rect.left + rect.width / 2;
      clientY = rect.top + rect.height / 2;
    }
    handleMoveFromUnsortedToCanvas(element, clientX, clientY);
  }, [handleMoveFromUnsortedToCanvas]);

  const handleBreadcrumbClick = (index: number) => {
    const nextHistory = boardHistory.slice(0, index + 1);
    const target = nextHistory[nextHistory.length - 1];
    setBoardHistory(nextHistory);
    setCurrentBoardId(target.id);
    setSelectedElementId(null);
    setSelectedIds([]);
    setEditingElementId(null);
    if (pendingUnsortedBoardsRef.current.has(target.id)) {
      setIsUnsortedDrawerOpen(true);
      pendingUnsortedBoardsRef.current.delete(target.id);
    } else {
      setIsUnsortedDrawerOpen(false);
    }
  };

  const handleUpdateElementPositions = async (updates: ElementPositionUpdate[]) => {
    recordHistory(elements);
    setElements((prev) =>
      prev.map((el) => {
        const update = updates.find((u) => u.id === el.id);
        return update ? { ...el, ...update } : el;
      })
    );

    try {
      await ipcService.batchUpdateElementPositions(updates);
      queueDebouncedSync(true);
    } catch (e) {
      console.error('Failed to batch update positions:', e);
    }
  };

  const handleContentChange = async (id: string, newContent: Record<string, any>) => {
    recordHistory(elements);
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, content: newContent } : el)));
    try {
      await ipcService.updateElementContent(id, newContent);
      queueDebouncedSync(false);
    } catch (e) {
      console.error('Failed to update content:', e);
    }
  };

  const handleStyleChange = async (id: string, newStyle: Record<string, any>) => {
    recordHistory(elements);
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, style: newStyle } : el)));
    try {
      await ipcService.updateElementStyle(id, newStyle);
      queueDebouncedSync(true);
    } catch (e) {
      console.error('Failed to update style:', e);
    }
  };

  const handleScaleToFit = useCallback(() => {
    const activeEls = elements.filter(
      (el) => !el.style?.is_unsorted && !el.style?.parent_column_id && el.element_type !== 'line'
    );
    if (activeEls.length === 0) {
      setCanvasScale(1.0);
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    activeEls.forEach((el) => {
      const w = el.width || (el.element_type === 'nested_board' ? 80 : 340);
      const h = el.height || (el.element_type === 'nested_board' ? 100 : 60);
      if (el.x < minX) minX = el.x;
      if (el.x + w > maxX) maxX = el.x + w;
      if (el.y < minY) minY = el.y;
      if (el.y + h > maxY) maxY = el.y + h;
    });

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const vp = document.querySelector('.canvas-viewport') as HTMLElement | null;
    const vpW = vp ? vp.clientWidth : window.innerWidth;
    const vpH = vp ? vp.clientHeight : window.innerHeight;

    const availW = Math.max(100, vpW - 140);
    const availH = Math.max(100, vpH - 140);

    const fitScaleX = availW / Math.max(contentW, 100);
    const fitScaleY = availH / Math.max(contentH, 100);
    const calculatedFit = Math.min(fitScaleX, fitScaleY);
    const targetScale = calculatedFit < 0.40
      ? Math.max(0.05, Number(calculatedFit.toFixed(2)))
      : Math.min(1.0, Math.max(minCanvasScale, Number(calculatedFit.toFixed(2))));

    setCanvasScale(targetScale);
  }, [elements, minCanvasScale]);

  const handleRecolor = async (tintOrColor: CardColorTint | string, targetId?: string) => {
    const el = contextMenu?.element || elements.find(item => item.id === (targetId || selectedElementId)) || null;
    if (!el) return;
    if (el.element_type === 'line') {
      handleStyleChange(el.id, { ...(el.style || {}), line_color: tintOrColor });
      return;
    }
    const isHexOrColor = tintOrColor.startsWith('#') || tintOrColor === 'transparent' || tintOrColor.startsWith('rgb');
    const newStyle = isHexOrColor
      ? { ...(el.style || {}), background_color: tintOrColor === 'transparent' ? undefined : tintOrColor }
      : { ...(el.style || {}), color_tint: tintOrColor as CardColorTint };
    handleStyleChange(el.id, newStyle);
  };

  const handleDuplicate = async (targetId?: string) => {
    const el = contextMenu?.element || elements.find(item => item.id === (targetId || selectedElementId)) || null;
    if (!el) return;
    recordHistory(elements);
    const newEl = await ipcService.createElement({
      board_id: el.board_id,
      element_type: el.element_type,
      x: el.x + 36,
      y: el.y + 36,
      width: el.width,
      height: el.height,
      z_index: (el.z_index || 10) + 1,
      content: { ...el.content, title: el.content.title ? `${el.content.title} (Copy)` : undefined },
      style: { ...el.style },
    });
    setElements((prev) => [...prev, newEl]);
    setSelectedElementId(newEl.id);
    setSelectedIds([newEl.id]);
    queueDebouncedSync(true);
  };

  const handleToggleLock = async (targetId?: string) => {
    const el = contextMenu?.element || elements.find(item => item.id === (targetId || selectedElementId)) || null;
    if (!el) return;
    const nextLocked = !Boolean(el.style?.is_locked);
    handleStyleChange(el.id, { ...(el.style || {}), is_locked: nextLocked });
  };

  const handleBringToFront = async (targetId?: string) => {
    const el = contextMenu?.element || elements.find(item => item.id === (targetId || selectedElementId)) || null;
    if (!el) return;
    const maxZ = Math.max(...elements.map((item) => item.z_index || 10), 10);
    const newZ = maxZ + 1;
    handleUpdateElementPositions([
      { id: el.id, x: el.x, y: el.y, width: el.width, height: el.height, z_index: newZ },
    ]);
  };

  const handleSendToBack = async (targetId?: string) => {
    const el = contextMenu?.element || elements.find(item => item.id === (targetId || selectedElementId)) || null;
    if (!el) return;
    const minZ = Math.min(...elements.map((item) => item.z_index || 10), 10);
    if (minZ > 1) {
      const newZ = minZ - 1;
      handleUpdateElementPositions([
        { id: el.id, x: el.x, y: el.y, width: el.width, height: el.height, z_index: newZ },
      ]);
    } else {
      const updates = elements.map((item) => {
        if (item.id === el.id) {
          return { id: item.id, x: item.x, y: item.y, width: item.width, height: item.height, z_index: 1 };
        } else {
          return { id: item.id, x: item.x, y: item.y, width: item.width, height: item.height, z_index: (item.z_index || 10) + 2 };
        }
      });
      handleUpdateElementPositions(updates);
    }
  };

  const handleConvertToBoard = async () => {
    if (!contextMenu || !contextMenu.element) return;
    recordHistory(elements);
    const el = contextMenu.element;
    let subBoardId: string | undefined = undefined;
    try {
      const createdBoard = await ipcService.createBoard(el.content?.title || el.content?.text || 'New Board', currentBoardId);
      subBoardId = createdBoard.id;
    } catch (err) {
      console.error('Failed to create board in db:', err);
    }
    const updatedContent = {
      ...(el.content || {}),
      title: el.content?.title || el.content?.text || 'New Board',
      preview_title: el.content?.title || el.content?.text || 'New Board',
      target_board_id: subBoardId,
    };
    setElements((prev) => prev.map((x) => x.id === el.id ? { ...x, element_type: 'nested_board', width: 80, height: 100, content: updatedContent } : x));
    await ipcService.updateElementContent(el.id, updatedContent);
  };

  const handleCreateBoardShortcut = async (boardId: string) => {
    const targetBoard = elements.find((x) => x.id === boardId);
    if (!targetBoard) return;
    recordHistory(elements);

    try {
      const newEl = await ipcService.createElement({
        board_id: targetBoard.board_id,
        element_type: 'nested_board',
        x: targetBoard.x + 96,
        y: targetBoard.y,
        width: targetBoard.width,
        height: targetBoard.height,
        z_index: (targetBoard.z_index || 10) + 1,
        content: {
          ...targetBoard.content,
          is_shortcut: true,
          shortcut_target_id: targetBoard.content.shortcut_target_id || targetBoard.id,
        },
        style: { ...targetBoard.style },
      });
      setElements((prev) => [...prev, newEl]);
    } catch (err) {
      console.error('Failed to spawn board shortcut:', err);
    }
  };

  const handleDropTool = async (tool: ToolType, x: number, y: number, targetColumnId?: string, isUnsorted: boolean = false, targetBoardId?: string) => {
    if (tool === 'line' && isUnsorted) return;
    recordHistory(elements);
    let elementType: any = tool;
    let initialContent: Record<string, any> = {};
    let defaultWidth = 340;
    let defaultHeight = 60;

    let destBoardId = currentBoardId;
    if (targetBoardId) {
      const bEl = elements.find(e => (e.id === targetBoardId || e.content?.target_board_id === targetBoardId) && e.element_type === 'nested_board');
      destBoardId = bEl?.content?.target_board_id || targetBoardId;
    }

    if (tool === 'note' || tool === 'heading') {
      elementType = 'note';
      initialContent = { text: tool === 'heading' ? 'NEW HEADING' : '' };
      defaultWidth = 340;
      defaultHeight = 60;
    } else if (tool === 'task_list') {
      elementType = 'task_list';
      initialContent = {
        title: 'New checklist',
        items: [
          { id: Date.now().toString(), text: '', is_checked: false }
        ]
      };
      defaultWidth = 340;
      defaultHeight = 60;
    } else if (tool === 'column') {
      elementType = 'column';
      initialContent = { title: 'New Column' };
      defaultWidth = 340;
      defaultHeight = 130;
    } else if (tool === 'nested_board') {
      elementType = 'nested_board';
      let subBoardId: string | undefined = undefined;
      try {
        const createdBoard = await ipcService.createBoard('New Board', destBoardId);
        subBoardId = createdBoard.id;
      } catch (err) {
        console.error('Failed to create board in db:', err);
      }
      initialContent = {
        title: 'New Board',
        preview_title: 'New Board',
        target_board_id: subBoardId
      };
      defaultWidth = 80;
      defaultHeight = 100;
    } else if (tool === 'link') {
      elementType = 'link';
      initialContent = { url: '' };
      defaultWidth = 340;
      defaultHeight = 60;
    } else if (tool === 'image') {
      elementType = 'image';
      const draggedUrl = (window as any).__MILANOTE_DRAGGED_IMAGE_URL__;
      const draggedCaption = (window as any).__MILANOTE_DRAGGED_IMAGE_CAPTION__;
      initialContent = { 
        url: draggedUrl || '', 
        caption: draggedCaption || '' 
      };
      (window as any).__MILANOTE_DRAGGED_IMAGE_URL__ = undefined;
      (window as any).__MILANOTE_DRAGGED_IMAGE_CAPTION__ = undefined;
      defaultWidth = 340;
      defaultHeight = 220;
    } else if (tool === 'table') {
      elementType = 'table';
      initialContent = { cells: { 1: 'Concept', 2: 'Status', 3: 'Owner', 4: 'Combat', 5: 'Done', 6: 'Alex' } };
      defaultWidth = 340;
      defaultHeight = 130;
    } else if (tool === 'comment') {
      elementType = 'comment';
      initialContent = { messages: [], is_pinned: false, pin_target_id: null, rel_x: 0, rel_y: 0 };
      defaultWidth = 330;
      defaultHeight = 64;
    } else if (tool === 'line') {
      elementType = 'line';
      initialContent = {
        start_x: 0,
        start_y: 200,
        end_x: 200,
        end_y: 0,
        control_offset_x: 0,
        control_offset_y: 0,
        start_target_id: null,
        end_target_id: null,
        show_label: false,
        label: ''
      };
      defaultWidth = 200;
      defaultHeight = 200;
    }

    let initialStyle: Record<string, any> = {
      color_tint: 'charcoal',
      parent_column_id: targetColumnId || null,
      ...(isUnsorted ? { is_unsorted: true } : {}),
    };
    if (tool === 'line') {
      initialStyle = {
        ...initialStyle,
        line_color: '#a8b0c0',
        start_arrow: 'none',
        end_arrow: 'arrow',
        is_dashed: false,
        line_weight: 2
      };
    }

    const newEl = await ipcService.createElement({
      board_id: destBoardId,
      element_type: elementType,
      x,
      y,
      width: defaultWidth,
      height: defaultHeight,
      z_index: elements.length + 10,
      content: initialContent,
      style: initialStyle,
    });

    if (destBoardId === currentBoardId) {
      setElements((prev) => [...prev, newEl]);
      setSelectedElementId(newEl.id);
      setSelectedIds([newEl.id]);

      if (tool === 'note' || tool === 'heading' || tool === 'link' || tool === 'task_list') {
        setEditingElementId(newEl.id);
      }
    }
    queueDebouncedSync(true);
  };

  const handleCreateTaskListFromItem = async (x: number, y: number, item: any, targetColumnId?: string) => {
    recordHistory(elements);
    const newEl = await ipcService.createElement({
      board_id: currentBoardId,
      element_type: 'task_list',
      x,
      y,
      width: 340,
      height: 60,
      z_index: elements.length + 10,
      content: {
        title: 'New checklist',
        items: [item],
      },
      style: {
        color_tint: 'charcoal',
        parent_column_id: targetColumnId || null,
      },
    });

    setElements((prev) => [...prev, newEl]);
    setSelectedElementId(newEl.id);
    setSelectedIds([newEl.id]);
    queueDebouncedSync(true);
  };

  const handleDropToolAtScreen = (tool: ToolType, clientX: number, clientY: number) => {
    // Check if dropped onto Unsorted Drawer or floating pill
    const unsortedDrawerEl = document.querySelector('.unsorted-drawer');
    const unsortedPillEl = document.querySelector('.mobile-unsorted-floating-pill');
    let isOverUnsorted = false;
    if (unsortedDrawerEl) {
      const uRect = unsortedDrawerEl.getBoundingClientRect();
      if (clientX >= uRect.left && clientX <= uRect.right && clientY >= uRect.top && clientY <= uRect.bottom) {
        isOverUnsorted = true;
      }
    }
    if (unsortedPillEl) {
      const pRect = unsortedPillEl.getBoundingClientRect();
      if (clientX >= pRect.left && clientX <= pRect.right && clientY >= pRect.top && clientY <= pRect.bottom) {
        isOverUnsorted = true;
      }
    }

    if (isOverUnsorted) {
      handleDropTool(tool, 100, 100, undefined, true);
      return;
    }

    const vp = document.querySelector('.canvas-viewport') as HTMLElement | null;
    let targetX = 100;
    let targetY = 100;
    if (vp) {
      const rect = vp.getBoundingClientRect();
      const panX = parseFloat(vp.getAttribute('data-pan-x') || '0');
      const panY = parseFloat(vp.getAttribute('data-pan-y') || '0');
      targetX = (clientX - rect.left - panX) / canvasScale;
      targetY = (clientY - rect.top - panY) / canvasScale;
    }

    let targetColumnId: string | undefined = undefined;
    let targetBoardId: string | undefined = undefined;

    // Check if dropped onto a column
    const colEls = elements.filter(el => el.element_type === 'column' && !el.style?.is_unsorted);
    for (const col of colEls) {
      const cDiv = document.getElementById(`milanote-el-${col.id}`);
      if (cDiv) {
        const r = cDiv.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          targetColumnId = col.id;
          break;
        }
      }
    }

    // Check if dropped onto a nested board
    if (!targetColumnId) {
      const bEls = elements.filter(el => el.element_type === 'nested_board' && !el.style?.is_unsorted);
      for (const b of bEls) {
        const bDiv = document.getElementById(`milanote-el-${b.id}`);
        if (bDiv) {
          const r = bDiv.getBoundingClientRect();
          if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
            targetBoardId = b.content?.target_board_id || b.id;
            break;
          }
        }
      }
    }

    let offsetX = 100;
    let offsetY = 30;
    if (tool === 'nested_board') {
      offsetX = 50;
      offsetY = 50;
    } else if (tool === 'column') {
      offsetX = 120;
      offsetY = 40;
    }

    handleDropTool(tool, Math.round(targetX - offsetX), Math.round(targetY - offsetY), targetColumnId, false, targetBoardId);
  };

  const handleCreateQuickLine = async (sourceElId: string): Promise<string> => {
    recordHistory(elements);
    const sourceEl = elements.find(el => el.id === sourceElId);
    const startX = sourceEl ? sourceEl.x + (sourceEl.width || 340) / 2 : 0;
    const startY = sourceEl ? sourceEl.y + (sourceEl.height || 60) / 2 : 0;
    const newId = crypto.randomUUID();

    const newEl: Element = {
      id: newId,
      board_id: currentBoardId,
      element_type: 'line',
      x: startX,
      y: startY,
      width: 200,
      height: 200,
      z_index: elements.length + 10,
      content: {
        start_x: 0,
        start_y: 0,
        end_x: 60,
        end_y: 60,
        control_offset_x: 0,
        control_offset_y: 0,
        start_target_id: sourceElId,
        start_anchor: 'center',
        end_target_id: null,
        end_anchor: 'center',
        show_label: false,
        label: ''
      },
      style: {
        color_tint: 'charcoal',
        parent_column_id: null,
        line_color: '#a8b0c0',
        start_arrow: 'none',
        end_arrow: 'arrow',
        is_dashed: false,
        line_weight: 2
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setElements((prev) => [...prev, newEl]);
    setSelectedElementId(newId);
    setSelectedIds([newId]);
    ipcService.createElement(newEl).catch(console.error);
    return newId;
  };

  const handleUploadImageForElement = useCallback(async (elementId: string, dataUrl: string) => {
    recordHistory(elements);
    const img = new Image();
    img.onload = async () => {
      const aspect = (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : (340 / 220);
      const currentEl = elements.find(x => x.id === elementId);
      const cardW = currentEl?.width || 340;
      const cardH = Math.max(80, Math.round(cardW / aspect));

      try {
        const stored = await ipcService.storeImageFile(dataUrl);
        imageCache.set(stored.file_id, dataUrl);
        handleContentChange(elementId, {
          ...(currentEl?.content || {}),
          file_id: stored.file_id,
          mime_type: stored.mime_type,
          url: '',
        });
      } catch (err) {
        console.error('Failed to store content-addressed image:', err);
        handleContentChange(elementId, { ...(currentEl?.content || {}), url: dataUrl });
      }

      handleUpdateElementPositions([{ id: elementId, x: currentEl?.x || 100, y: currentEl?.y || 100, width: cardW, height: cardH, z_index: currentEl?.z_index || 10 }]);
    };
    img.src = dataUrl;
  }, [elements, handleContentChange, handleUpdateElementPositions, recordHistory]);

  const handleAddImageFromDrawer = async (url: string, caption: string = '') => {
    recordHistory(elements);
    let fileId: string | undefined = undefined;
    let mimeType: string | undefined = undefined;
    let cleanUrl = url;

    if (url.startsWith('data:image/')) {
      try {
        const stored = await ipcService.storeImageFile(url);
        fileId = stored.file_id;
        mimeType = stored.mime_type;
        cleanUrl = '';
        imageCache.set(stored.file_id, url);
      } catch (e) {
        console.error('Failed to store drawer image attachment:', e);
      }
    }

    const newEl = await ipcService.createElement({
      board_id: currentBoardId,
      element_type: 'image',
      x: 220,
      y: 160,
      width: 340,
      height: 220,
      z_index: elements.length + 10,
      content: { url: cleanUrl, file_id: fileId, mime_type: mimeType, caption },
      style: { color_tint: 'charcoal', parent_column_id: null },
    });
    setElements((prev) => [...prev, newEl]);
    setSelectedElementId(newEl.id);
    setSelectedIds([newEl.id]);
  };

  const handleAddCommentPinToElement = async (targetId: string) => {
    const targetEl = elements.find((x) => x.id === targetId);
    if (!targetEl) return;
    const existingPin = elements.find((x) => x.element_type === 'comment' && Boolean(x.content?.is_pinned) && x.content?.pin_target_id === targetId);
    if (existingPin) {
      setSelectedElementId(existingPin.id);
      setSelectedIds([existingPin.id]);
      return;
    }
    recordHistory(elements);
    const pinX = targetEl.x + (targetEl.width || 340) - 30;
    const pinY = targetEl.y - 10;

    const newEl = await ipcService.createElement({
      board_id: currentBoardId,
      element_type: 'comment',
      x: pinX,
      y: pinY,
      width: 330,
      height: 64,
      z_index: elements.length + 15,
      content: { 
        messages: [], 
        is_pinned: true, 
        pin_target_id: targetId, 
        rel_x: (targetEl.width || 340) - 30, 
        rel_y: -10 
      },
      style: { color_tint: 'charcoal', parent_column_id: null },
    });

    setElements((prev) => [...prev, newEl]);
    setSelectedElementId(newEl.id);
    setSelectedIds([newEl.id]);
  };

  const handleToggleLinkCaption = (linkId: string) => {
    const linkEl = elements.find((x) => x.id === linkId);
    if (!linkEl) return;
    const nextShow = !linkEl.content?.show_caption;
    handleContentChange(linkId, { ...linkEl.content, show_caption: nextShow });
  };

  const handleToggleImageCaption = (imageId: string) => {
    const imgEl = elements.find((x) => x.id === imageId);
    if (!imgEl) return;
    const nextShow = !imgEl.content?.show_caption;
    handleContentChange(imageId, { ...imgEl.content, show_caption: nextShow });
  };

  const handleToggleTaskTitle = (taskId: string) => {
    const taskEl = elements.find((x) => x.id === taskId);
    if (!taskEl) return;
    const nextShow = !taskEl.content?.show_title;
    const currentTitle = taskEl.content?.title !== undefined ? taskEl.content.title : 'New To-do List';
    handleContentChange(taskId, { ...taskEl.content, show_title: nextShow, title: currentTitle });
  };

  const handleSetTaskDueDate = (taskId: string, dateStr: string | null) => {
    const taskEl = elements.find((x) => x.id === taskId);
    if (!taskEl) return;
    if (dateStr === null) {
      const { due_date, ...rest } = taskEl.content || {};
      handleContentChange(taskId, rest);
    } else {
      handleContentChange(taskId, { ...taskEl.content, due_date: dateStr });
    }
  };

  const handleSetBoardIcon = (boardId: string, iconName: string) => {
    const boardEl = elements.find((x) => x.id === boardId);
    if (!boardEl) return;
    handleContentChange(boardId, { ...boardEl.content, custom_icon: iconName });
  };

  const handleToggleCommentPin = (commentId: string, pinState: boolean) => {
    const commentEl = elements.find((x) => x.id === commentId);
    if (!commentEl) return;
    handleContentChange(commentId, { ...commentEl.content, is_pinned: pinState });
  };

  const activeEditingElement = elements.find((x) => x.id === editingElementId) || null;
  const isEditingMode = Boolean(editingElementId && activeEditingElement && activeEditingElement.element_type !== 'table');
  const activeSelectedNote = elements.find((x) => x.id === selectedElementId && x.element_type === 'note') || null;
  const activeSelectedLink = elements.find((x) => x.id === selectedElementId && x.element_type === 'link') || null;
  const activeSelectedTask = elements.find((x) => x.id === selectedElementId && x.element_type === 'task_list') || null;
  const activeSelectedBoard = elements.find((x) => x.id === selectedElementId && x.element_type === 'nested_board') || null;
  const activeSelectedComment = elements.find((x) => x.id === selectedElementId && x.element_type === 'comment') || null;
  const activeSelectedColumn = elements.find((x) => x.id === selectedElementId && x.element_type === 'column') || null;
  const activeSelectedImage = elements.find((x) => x.id === selectedElementId && x.element_type === 'image') || null;
  const activeSelectedLine = elements.find((x) => x.id === selectedElementId && x.element_type === 'line') || null;
  const activeSelectedTable = elements.find((x) => x.id === selectedElementId && x.element_type === 'table') || elements.find((x) => x.id === editingElementId && x.element_type === 'table') || null;

  return (
    <div className={`milanote-app-container ${isPresentationMode ? 'presentation-mode' : ''}`} onClick={() => setShowViewMenu(false)}>
      {/* Top Status Bar Padding Band for Mobile on Root Board (Image 1) */}
      {currentBoardId === 'root-board' && getDeviceCategory() === 'phone' && <div className="mobile-status-bar-filler" />}
      {/* Top Status Bar Padding Band for Tablet under Android Status Bar */}
      {getDeviceCategory() === 'tablet' && <div className="tablet-status-bar-filler" />}
      {isPresentationMode ? (
        <button className="exit-presentation-btn" onClick={() => setIsPresentationMode(false)} title="Exit Presentation Mode (Press Esc)">
          <Minimize2 size={16} /> Exit Presentation
        </button>
      ) : (
        <>
          {/* FULL-WIDTH TOP HEADER BAR (PRIMARY) */}
          <header className={`milanote-topbar ${boardHistory.length > 1 ? 'no-border' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="topbar-left">
              <div className={`home-circle-logo ${dragHoverBoardId === 'root-board' ? 'drag-hover-highlight' : ''}`} title="Home" data-board-id="root-board" onClick={() => handleBreadcrumbClick(0)}>
                <span>M</span>
              </div>

              {/* Mobile back navigation button */}
              {boardHistory.length > 1 && (
                <button
                  className="mobile-topbar-back-btn"
                  onClick={() => handleBreadcrumbClick(Math.max(0, boardHistory.length - 2))}
                  title="Back to parent board"
                >
                  <ArrowLeft size={18} />
                </button>
              )}

              {/* Mobile compact title (strictly rendered only on phone screens) */}
              {isPhoneScreen() && (
                boardHistory.length > 1 ? (
                  <input
                    key={`mobile-title-${currentBoardId}`}
                    type="text"
                    className="mobile-board-title"
                    value={boardHistory[boardHistory.length - 1]?.title || 'Board'}
                    onChange={(e) => {
                      const nextTitle = e.target.value;
                      setBoardHistory((prev) => prev.map((node, i) => i === prev.length - 1 ? { ...node, title: nextTitle } : node));
                    }}
                    onBlur={async (e) => {
                      const nextTitle = e.target.value || 'Untitled Board';
                      setBoardHistory((prev) => prev.map((node, i) => i === prev.length - 1 ? { ...node, title: nextTitle } : node));
                      try {
                        await ipcService.updateBoard(currentBoardId, nextTitle);
                        syncService.triggerSync().catch(() => {});
                      } catch (err) {
                        console.error('Failed to update board title in IPC:', err);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        e.currentTarget.blur();
                      }
                    }}
                    title="Click to edit board title"
                  />
                ) : (
                  <span
                    className="mobile-board-title"
                    style={{ display: 'inline-flex', alignItems: 'center' }}
                  >
                    {boardHistory[0]?.title || 'Home'}
                  </span>
                )
              )}

              <div className="board-switcher-container">
                <nav className="breadcrumb-path">
                  {boardHistory.map((node, i) => (
                    <React.Fragment key={node.id}>
                      {i > 0 && <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4px' }}>/</span>}
                      <button
                        data-board-id={node.id}
                        className={`breadcrumb-item ${i === boardHistory.length - 1 ? 'active' : ''} ${dragHoverBoardId === node.id ? 'drag-hover-highlight' : ''}`}
                        onClick={() => handleBreadcrumbClick(i)}
                      >
                        {node.title}
                      </button>
                    </React.Fragment>
                  ))}
                </nav>
              </div>
            </div>

            <div className="topbar-right">
              <span className="promo-referral-text">Refer a friend, get more space &gt;</span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button 
                  className="topbar-icon-btn" 
                  title="Undo (Ctrl+Z)" 
                  disabled={undoStack.length === 0}
                  style={{ opacity: undoStack.length === 0 ? 0.35 : 1, cursor: undoStack.length === 0 ? 'default' : 'pointer' }}
                  onClick={() => handleUndo()}
                >
                  <Undo2 size={17} />
                </button>
                <button 
                  className="topbar-icon-btn" 
                  title="Redo (Ctrl+Y / Ctrl+Shift+Z)" 
                  disabled={redoStack.length === 0}
                  style={{ opacity: redoStack.length === 0 ? 0.35 : 1, cursor: redoStack.length === 0 ? 'default' : 'pointer' }}
                  onClick={() => handleRedo()}
                >
                  <Redo2 size={17} />
                </button>
              </div>

              <button className="topbar-icon-btn" title="Mobile & Apps"><Smartphone size={17} /></button>
              <button className="topbar-icon-btn" title="Help & Guides"><HelpCircle size={17} /></button>
              <button className="topbar-icon-btn" title="Notifications"><Bell size={17} /></button>
              <button className="topbar-icon-btn" title="Search (Ctrl+K)" onClick={() => setIsSearchOpen(true)}><SearchIcon size={17} /></button>
              <button className="topbar-icon-btn mobile-unsorted-toggle-btn" title="Unsorted items" onClick={() => setIsUnsortedDrawerOpen((prev) => !prev)}><Folder size={17} /></button>
              <SyncStatusIndicator onOpenSettings={() => setIsSyncSettingsOpen(true)} />
              <button className="topbar-icon-btn" title="Settings & Profile" onClick={() => setIsSyncSettingsOpen(true)}><Settings size={17} /></button>
            </div>
          </header>

          {/* SECONDARY BOARD TOPBAR (APPEARS ONLY WHEN WE ENTER A SUB-BOARD) */}
          {boardHistory.length > 1 && (
            <header className="milanote-secondary-topbar" onClick={(e) => e.stopPropagation()}>
              <div className="secondary-topbar-left">
                <span className="topbar-saved-status">Saved</span>
              </div>

              <div className="secondary-topbar-center">
                <input
                  key={currentBoardId}
                  type="text"
                  className="secondary-board-title-input"
                  value={boardHistory[boardHistory.length - 1]?.title || 'New Board'}
                  onChange={(e) => {
                    const nextTitle = e.target.value;
                    setBoardHistory((prev) => prev.map((node, i) => i === prev.length - 1 ? { ...node, title: nextTitle } : node));
                  }}
                  onBlur={async (e) => {
                    const nextTitle = e.target.value || 'Untitled Board';
                    setBoardHistory((prev) => prev.map((node, i) => i === prev.length - 1 ? { ...node, title: nextTitle } : node));
                    try {
                      await ipcService.updateBoard(currentBoardId, nextTitle);
                      syncService.triggerSync().catch(() => {});
                    } catch (err) {
                      console.error('Failed to update board title in IPC:', err);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      e.currentTarget.blur();
                    }
                  }}
                  title="Click to edit board title"
                />
              </div>

              <div className="secondary-topbar-right">
                <button className="secondary-topbar-btn share-btn">
                  <span className="share-icon-circle"><Users size={12} /></span>
                  Share
                </button>
                <button className="secondary-topbar-btn dropdown-btn">
                  Export <ChevronDown size={14} />
                </button>
                <div style={{ position: 'relative' }}>
                  <button 
                    className="secondary-topbar-btn dropdown-btn" 
                    onClick={(e) => { e.stopPropagation(); setShowViewMenu(!showViewMenu); }}
                  >
                    {Math.round(canvasScale * 100)}% <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            </header>
          )}
        </>
      )}

      {/* MAIN BODY AREA UNDER HEADER */}
      <div className="milanote-body-row">
        {isEditingMode && !isPresentationMode ? (
          <TextEditSubSidebar
            isOpen={true}
            onClose={() => setEditingElementId(null)}
            onDelete={() => handleDelete(editingElementId || undefined)}
            element={activeEditingElement}
            onApplyFormat={(format, param) => {
              if (format === 'bold') {
                document.execCommand('bold', false, undefined);
              } else if (format === 'italic') {
                document.execCommand('italic', false, undefined);
              } else if (format === 'strikethrough') {
                document.execCommand('strikethrough', false, undefined);
              } else if (format === 'underline') {
                document.execCommand('underline', false, undefined);
              } else if (format === 'bullet-list') {
                document.execCommand('insertUnorderedList', false, undefined);
              } else if (format === 'number-list') {
                document.execCommand('insertOrderedList', false, undefined);
              } else if (format === 'align-left') {
                document.execCommand('justifyLeft', false, undefined);
              } else if (format === 'align-center' || format === 'align') {
                document.execCommand('justifyCenter', false, undefined);
              } else if (format === 'align-right') {
                document.execCommand('justifyRight', false, undefined);
              } else if (format === 'heading' || format === 'small' || format === 'callout' || format === 'code-block' || format === 'quote') {
                const editor = document.querySelector(`#milanote-el-${activeEditingElement?.id} .note-rich-editor`) as HTMLElement | null;
                if (editor) {
                  let blockTag = 'P';
                  if (format === 'heading') blockTag = param || 'P';
                  if (format === 'small') blockTag = 'H6';
                  if (format === 'callout') blockTag = 'H5';
                  if (format === 'code-block') blockTag = 'PRE';
                  if (format === 'quote') blockTag = 'BLOCKQUOTE';

                  const isEmpty = !editor.textContent?.trim() && !editor.querySelector('img');

                  if (isEmpty) {
                    editor.innerHTML = `<${blockTag.toLowerCase()}><br></${blockTag.toLowerCase()}>`;
                    const newSel = window.getSelection();
                    if (newSel && editor.firstElementChild) {
                      const newRange = document.createRange();
                      newRange.selectNodeContents(editor.firstElementChild);
                      newRange.collapse(true);
                      newSel.removeAllRanges();
                      newSel.addRange(newRange);
                    }
                  } else {
                    if (document.activeElement !== editor && !editor.contains(document.activeElement)) {
                      editor.focus();
                    }
                    document.execCommand('formatBlock', false, `<${blockTag.toLowerCase()}>`);
                  }
                }
              } else if (format === 'color' && param) {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                    const range = sel.getRangeAt(0);
                    const container = range.commonAncestorContainer;
                    const parent = container.nodeType === 3 ? container.parentNode : container;
                    if (parent) {
                        const elem = parent as HTMLElement;
                        if (elem.style && elem.style.backgroundColor) {
                            elem.style.backgroundColor = '';
                        }
                        const spans = elem.querySelectorAll('span, font');
                        spans.forEach(span => {
                            if (sel.containsNode(span, true)) {
                                (span as HTMLElement).style.backgroundColor = '';
                            }
                        });
                    }
                }
                document.execCommand('backColor', false, 'rgba(0,0,0,0)');
                document.execCommand('hiliteColor', false, 'transparent');
                document.execCommand('foreColor', false, param);
              } else if (format === 'code') {
                const selection = window.getSelection();
                if (selection && selection.toString().trim() !== '') {
                  const selectedText = selection.toString();
                  document.execCommand('insertHTML', false, `<code class="milanote-inline-code">${selectedText}</code>&nbsp;`);
                }
              } else if (format === 'link' && param) {
                const selection = window.getSelection();
                const selectedText = selection ? selection.toString() : '';
                const displayLabel = selectedText && selectedText.trim() !== '' ? selectedText : param;
                if (selection && selection.rangeCount > 0 && selectedText.trim() !== '') {
                  document.execCommand('insertHTML', false, `<a href="${param}" class="milanote-text-link" target="_blank" rel="noopener noreferrer" style="color: #eb5e34; text-decoration: underline; cursor: pointer;">${displayLabel}</a>&nbsp;`);
                } else {
                  document.execCommand('createLink', false, param);
                }
                const editor = document.querySelector(`#milanote-el-${activeEditingElement?.id} .note-rich-editor`) as HTMLElement | null;
                if (editor) {
                  const links = editor.querySelectorAll('a');
                  links.forEach((a) => {
                    a.classList.add('milanote-text-link');
                    a.setAttribute('target', '_blank');
                    a.setAttribute('rel', 'noopener noreferrer');
                    a.style.color = '#eb5e34';
                    a.style.textDecoration = 'underline';
                  });
                }
              } else if (format === 'comment' && param) {
                const selection = window.getSelection();
                if (selection && selection.toString().trim() !== '') {
                  const selectedText = selection.toString();
                  document.execCommand('insertHTML', false, `<span class="milanote-inline-comment" data-comment-id="${param}" style="background-color: rgba(90, 130, 185, 0.35); border-bottom: 2px dashed rgba(255, 255, 255, 0.75); cursor: pointer; padding: 1px 2px; border-radius: 2px;">${selectedText}</span>`);
                }
              }

              if (activeEditingElement && activeEditingElement.id) {
                setTimeout(() => {
                  const editor = document.querySelector(`#milanote-el-${activeEditingElement.id} .note-rich-editor`) as HTMLElement | null;
                  if (editor) {
                    const elId = activeEditingElement.id;
                    const el = elements.find((x) => x.id === elId) || activeEditingElement;
                    const curContent = el.content || {};
                    const newComments = format === 'comment' && param ? { ...(curContent.inline_comments || {}), [param]: [] } : curContent.inline_comments;
                    handleContentChange(elId, { ...curContent, text: editor.innerHTML, inline_comments: newComments });
                  }
                }, 15);
              }
            }}
          />
        ) : activeSelectedNote ? (
          <NoteActionSidebar
            element={activeSelectedNote}
            onClose={() => setSelectedElementId(null)}
            onDelete={() => handleDelete(selectedElementId || undefined)}
            onStyleChange={handleStyleChange}
            onAddCommentPin={handleAddCommentPinToElement}
          />
        ) : activeSelectedLink ? (
          <LinkActionSidebar
            element={activeSelectedLink}
            onClose={() => { setSelectedElementId(null); setRenamingLinkId(null); }}
            onDelete={() => handleDelete(selectedElementId || undefined)}
            onStyleChange={handleStyleChange}
            onAddCommentPin={handleAddCommentPinToElement}
            onRename={(id) => setRenamingLinkId(id)}
            onToggleCaption={handleToggleLinkCaption}
          />
        ) : activeSelectedTask ? (
          <TaskActionSidebar
            element={activeSelectedTask}
            onClose={() => setSelectedElementId(null)}
            onDelete={() => handleDelete(selectedElementId || undefined)}
            onStyleChange={handleStyleChange}
            onAddCommentPin={handleAddCommentPinToElement}
            onToggleTitle={handleToggleTaskTitle}
            onSetDueDate={handleSetTaskDueDate}
          />
        ) : activeSelectedBoard ? (
          <BoardActionSidebar
            element={activeSelectedBoard}
            onClose={() => setSelectedElementId(null)}
            onDelete={() => handleDelete(selectedElementId || undefined)}
            onStyleChange={handleStyleChange}
            onSetIcon={handleSetBoardIcon}
            onRename={(id) => setEditingElementId(id)}
          />
        ) : activeSelectedComment ? (
          <CommentActionSidebar
            element={activeSelectedComment}
            onClose={() => setSelectedElementId(null)}
            onDelete={() => handleDelete(selectedElementId || undefined)}
            onStyleChange={handleStyleChange}
            onTogglePin={handleToggleCommentPin}
          />
        ) : activeSelectedColumn ? (
          <ColumnActionSidebar
            element={activeSelectedColumn}
            onClose={() => setSelectedElementId(null)}
            onDelete={() => handleDelete(selectedElementId || undefined)}
            onStyleChange={handleStyleChange}
            onRename={(id) => setEditingElementId(id)}
          />
        ) : activeSelectedImage ? (
          <ImageActionSidebar
            element={activeSelectedImage}
            onClose={() => setSelectedElementId(null)}
            onDelete={() => handleDelete(selectedElementId || undefined)}
            onStyleChange={handleStyleChange}
            onAddCommentPin={handleAddCommentPinToElement}
            onToggleCaption={handleToggleImageCaption}
            onUploadImage={(file) => {
              if (activeSelectedImage) {
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') {
                    handleUploadImageForElement(activeSelectedImage.id, reader.result);
                  }
                };
                reader.readAsDataURL(file);
              }
            }}
          />
        ) : activeSelectedLine ? (
          <LineActionSidebar
            element={activeSelectedLine}
            onClose={() => setSelectedElementId(null)}
            onDelete={() => handleDelete(selectedElementId || undefined)}
            onStyleChange={handleStyleChange}
            onContentChange={handleContentChange}
          />
        ) : activeSelectedTable ? (
          (selectedTableCells && selectedTableCells.tableId === activeSelectedTable.id && selectedTableCells.cellIndices.length > 0) ? (
            <CellActionSidebar
              element={activeSelectedTable}
              selectedCells={selectedTableCells.cellIndices}
              onClose={() => setSelectedTableCells(null)}
              onContentChange={handleContentChange}
            />
          ) : (
            <TableActionSidebar
              element={activeSelectedTable}
              onClose={() => { setSelectedElementId(null); setEditingElementId(null); setSelectedTableCells(null); }}
              onDelete={() => handleDelete(activeSelectedTable.id)}
              onContentChange={handleContentChange}
              onAddCommentPin={handleAddCommentPinToElement}
            />
          )
        ) : !isPresentationMode ? (
          <Toolbar
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            isDraggingElement={isElementBeingDragged}
            isHoveringTrash={isHoveringTrash}
            onTrashDrop={() => handleDelete()}
            onAddImageFromDrawer={handleAddImageFromDrawer}
          />
        ) : null}

        {/* Infinite Canvas Viewport */}
        {(() => {
          const canvasElements = elements.filter(el => !el.style?.is_unsorted);
          const unsortedElements = elements.filter(el => Boolean(el.style?.is_unsorted) && el.element_type !== 'line');
          return (
            <>
              <Canvas
                elements={canvasElements}
                onMoveToUnsorted={handleMoveToUnsorted}
                onOpenUnsortedDrawer={() => setIsUnsortedDrawerOpen(true)}
                isUnsortedDrawerOpen={isUnsortedDrawerOpen}
                unsortedElements={unsortedElements}
                onCloseUnsortedDrawer={() => setIsUnsortedDrawerOpen(false)}
                onMoveFromUnsortedToCanvas={handleMoveFromUnsortedToCanvas}
                onUnsortedReorder={handleUnsortedReorder}
                selectedElementId={selectedElementId}
          selectedIds={selectedIds}
          editingElementId={editingElementId}
          renamingLinkId={renamingLinkId}
          onSetRenamingLink={setRenamingLinkId}
          selectedTableCells={selectedTableCells}
          onSelectTableCells={setSelectedTableCells}
          onSelectElement={(id) => {
            setSelectedElementId(id);
            setSelectedIds(id ? [id] : []);
            if (id !== renamingLinkId) setRenamingLinkId(null);
            if (id && editingElementId !== id) {
              setEditingElementId(null);
            }
            if (id && id !== selectedTableCells?.tableId) {
              setSelectedTableCells(null);
            } else if (!id) {
              setSelectedTableCells(null);
            }
          }}
          onMultiSelect={(ids) => {
            setSelectedIds(ids);
            setSelectedElementId(ids.length > 0 ? ids[ids.length - 1] : null);
            if (ids.length > 0 && editingElementId) {
              setEditingElementId(null);
            }
            setSelectedTableCells(null);
          }}
          onSetEditingElement={setEditingElementId}
          onUpdateElementPositions={handleUpdateElementPositions}
          onContentChange={handleContentChange}
          onStyleChange={handleStyleChange}
          onContextMenu={(e, element, canvasPos, tableSubTarget) => {
            if (getDeviceCategory() === 'phone') return;
            setContextMenu({ x: e.clientX, y: e.clientY, canvasX: canvasPos?.x, canvasY: canvasPos?.y, element, tableSubTarget });
          }}
          onOpenBoard={handleOpenBoard}
          onMoveElementToBoard={handleMoveElementToBoard}
          onHoverBoard={setDragHoverBoardId}
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          onDropTool={handleDropTool}
          onCreateTaskListFromItem={handleCreateTaskListFromItem}
          onCreateQuickLine={handleCreateQuickLine}
          onDeleteElement={handleDelete}
          onDuplicateElement={handleDuplicate}
          onCopyElement={handleCopy}
          onToggleLockElement={handleToggleLock}
          onRecolorElement={handleRecolor}
          onSetHoveringTrash={setIsHoveringTrash}
          isHoveringTrash={isHoveringTrash}
          onDragChange={setIsElementBeingDragged}
          scale={canvasScale}
          onSetScale={setCanvasScale}
          onMinScaleChange={setMinCanvasScale}
          onCanvasClick={handleCanvasClick}
          onTwoFingerTap={(cx, cy, clientX, clientY, targetEl) => {
            if (getDeviceCategory() === 'phone') {
              setTwoFingerMenu({ canvasX: cx, canvasY: cy });
            } else {
              const activeEl = targetEl || (selectedElementId ? elements.find(x => x.id === selectedElementId) : null) || null;
              if (activeEl) {
                setSelectedElementId(activeEl.id);
                if (!selectedIds.includes(activeEl.id)) {
                  setSelectedIds([activeEl.id]);
                }
              }
              const menuX = clientX !== undefined ? Math.min(clientX, window.innerWidth - 260) : Math.round(window.innerWidth / 2 - 130);
              const menuY = clientY !== undefined ? Math.min(clientY, window.innerHeight - 380) : Math.round(window.innerHeight / 2 - 200);
              setContextMenu({
                x: Math.max(10, menuX),
                y: Math.max(10, menuY),
                canvasX: cx,
                canvasY: cy,
                element: activeEl,
                tableSubTarget: undefined,
              });
            }
          }}
          onUploadImageForElement={handleUploadImageForElement}
        />

              {/* FLOATING TOP-RIGHT UNSORTED PILL BUTTON */}
              {!isPresentationMode && !isUnsortedDrawerOpen && (
                <button className="unsorted-pill-btn" onClick={(e) => { e.stopPropagation(); setIsUnsortedDrawerOpen(true); }}>
                  <Folder size={16} />
                  <span>{unsortedElements.length} Unsorted</span>
                </button>
              )}
            </>
          );
        })()}
      </div>

      {/* Root-Level View Popover */}
      {showViewMenu && (
        <div 
          className="view-zoom-popover" 
          style={{ position: 'fixed', top: '90px', right: '20px', zIndex: 999999 }} 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="view-popover-section">
            <h3 className="view-popover-title">Zoom</h3>
            <p className="view-popover-sub">Tip: hold ctrl and use mouse wheel to zoom</p>
            
            <div className="zoom-slider-row">
              <button className="zoom-popover-icon-btn" onClick={() => setCanvasScale(s => Math.max(minCanvasScale, Number((s - 0.15).toFixed(2))))} title="Zoom Out">–</button>
              <div className="zoom-slider-track">
                <div className="zoom-slider-fill" style={{ width: `${Math.min(100, Math.max(0, ((canvasScale - minCanvasScale) / (3.0 - minCanvasScale)) * 100))}%` }} />
              </div>
              <span className="zoom-percentage-badge" onClick={() => setCanvasScale(1.0)} title="Click to reset to 100%">{Math.round(canvasScale * 100)}%</span>
              <button className="zoom-popover-icon-btn" onClick={() => setCanvasScale(s => Math.min(3.0, Number((s + 0.15).toFixed(2))))} title="Zoom In">+</button>
            </div>

            <button className="zoom-scale-to-fit-btn" onClick={handleScaleToFit}>
              Scale to fit
            </button>
          </div>

          <div className="view-popover-divider" />

          <div className="view-popover-section">
            <h3 className="view-popover-title">Presentation mode</h3>
            <p className="view-popover-sub">Go full-screen &amp; hide toolbar, dot grid etc.</p>
            <button className="present-action-btn" onClick={() => { setIsPresentationMode(true); setShowViewMenu(false); }}>
              Present
            </button>
          </div>
        </div>
      )}

      {/* High-Fidelity Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canvasX={contextMenu.canvasX}
          canvasY={contextMenu.canvasY}
          element={contextMenu.element}
          onClose={() => setContextMenu(null)}
          onRecolor={handleRecolor}
          onDuplicate={handleDuplicate}
          onBringToFront={handleBringToFront}
          onSendToBack={handleSendToBack}
          onMoveToUnsorted={() => contextMenu.element && handleMoveToUnsorted(contextMenu.element.id)}
          onDelete={() => contextMenu.element && handleDelete(contextMenu.element.id)}
          onToggleLock={handleToggleLock}
          onConvertToBoard={handleConvertToBoard}
          onCut={handleCut}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          onSpawnTool={(tool, x, y) => handleDropTool(tool, x, y)}
          onChangeBackground={handleChangeBoardBackground}
          canPaste={clipboardElements.length > 0}
          tableSubTarget={contextMenu.tableSubTarget}
          onContentChange={handleContentChange}
          onCreateBoardShortcut={handleCreateBoardShortcut}
        />
      )}

      {/* Global Search Modal (Task 3.7) */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={(boardId, elementId) => {
          handleSwitchBoard(boardId, undefined, false);
          if (elementId) {
            setTimeout(() => {
              setSelectedElementId(elementId);
              setSelectedIds([elementId]);
            }, 80);
          }
        }}
      />

      {/* NATIVE MILANOTE MOBILE BOARD TOP BAR (IMAGE 2) */}
      {boardHistory.length > 1 && (
        <header className="mobile-board-topbar" onClick={(e) => e.stopPropagation()}>
          <button
            className="mobile-board-back-icon-btn"
            onClick={() => handleBreadcrumbClick(Math.max(0, boardHistory.length - 2))}
            title="Back to previous board"
          >
            <ChevronLeft size={26} strokeWidth={2.2} />
          </button>

          <div className="mobile-board-title-container">
            <input
              type="text"
              className="mobile-board-header-title"
              value={boardHistory[boardHistory.length - 1]?.title || 'New Board'}
              onChange={(e) => {
                const nextTitle = e.target.value;
                setBoardHistory((prev) => prev.map((node, i) => i === prev.length - 1 ? { ...node, title: nextTitle } : node));
              }}
              onBlur={async (e) => {
                const nextTitle = e.target.value || 'Untitled Board';
                setBoardHistory((prev) => prev.map((node, i) => i === prev.length - 1 ? { ...node, title: nextTitle } : node));
                try {
                  await ipcService.updateBoard(currentBoardId, nextTitle);
                  syncService.triggerSync().catch(() => {});
                } catch (err) {
                  console.error('Failed to update board title in IPC:', err);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.currentTarget.blur();
                }
              }}
              title="Click to edit board title"
            />
          </div>

          <SyncStatusIndicator dropdownAlign="right" onOpenSettings={() => setIsSyncSettingsOpen(true)} />
          <button
            className="mobile-board-share-btn"
            title="Share board"
            onClick={() => {
              if (typeof navigator !== 'undefined' && 'share' in navigator) {
                try {
                  navigator.share({
                    title: boardHistory[boardHistory.length - 1]?.title || 'Board',
                    url: window.location.href,
                  }).catch(() => {});
                } catch (_) {}
              }
            }}
          >
            <UserPlus size={18} strokeWidth={2} />
          </button>
        </header>
      )}

      {/* Native Milanote Mobile Bottom Bar (Screens 1, 2, 3, 4, 5) */}
      <MobileBottomBar
        currentBoardId={currentBoardId}
        isRootBoard={boardHistory.length === 1}
        boardTitle={boardHistory[boardHistory.length - 1]?.title || 'Board'}
        unsortedCount={elements.filter(el => Boolean(el.style?.is_unsorted) && el.element_type !== 'line').length}
        onOpenUnsorted={() => setIsUnsortedDrawerOpen(prev => !prev)}
        onOpenBoardsMenu={() => {
          setIsUnsortedDrawerOpen(false);
        }}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenSearch={() => setIsSearchOpen(true)}
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onDropToolAtScreen={handleDropToolAtScreen}
        isUnsortedOpen={isUnsortedDrawerOpen}
        onMoveElementToCanvas={handleMoveUnsortedElementToCanvasCenter}
        onMoveElementToUnsorted={handleMoveToUnsorted}
        selectedElement={elements.find(x => x.id === selectedElementId) || null}
        selectedIds={selectedIds}
        onDeselect={() => {
          setSelectedElementId(null);
          setSelectedIds([]);
          setEditingElementId(null);
          setSelectedTableCells(null);
        }}
        onRecolor={handleRecolor}
        onCut={handleCut}
        onCopy={handleCopy}
        onDuplicate={handleDuplicate}
        onDelete={() => handleDelete()}
        onToggleLock={handleToggleLock}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onAddCommentPin={handleAddCommentPinToElement}
        onToggleTaskTitle={handleToggleTaskTitle}
        onSetTaskDueDate={handleSetTaskDueDate}
        onToggleCaption={(id) => {
          const el = elements.find(x => x.id === id);
          if (el?.element_type === 'image') handleToggleImageCaption(id);
          else handleToggleLinkCaption(id);
        }}
        onRename={(id) => {
          const el = elements.find(x => x.id === id);
          if (el?.element_type === 'link') setRenamingLinkId(id);
          else setEditingElementId(id);
        }}
        onSetIcon={handleSetBoardIcon}
        resetTrigger={resetMobileBarTrigger}
        editingElement={activeEditingElement}
        onDoneEditing={() => setEditingElementId(null)}
        onStyleChange={handleStyleChange}
        onContentChange={handleContentChange}
        selectedTableCells={selectedTableCells}
        onDeselectTableCells={() => setSelectedTableCells(null)}
        onUploadImageForElement={handleUploadImageForElement}
        onOpenSyncSettings={() => setIsSyncSettingsOpen(true)}
      />

      {/* Two-Finger Tap Context Menu Sheet (Phone only) */}
      {twoFingerMenu && getDeviceCategory() === 'phone' && (
        <div
          className="mobile-context-sheet-backdrop"
          onClick={() => setTwoFingerMenu(null)}
        >
          <div
            className="mobile-two-finger-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={`mobile-context-sheet-item ${undoStack.length === 0 ? 'disabled' : ''}`}
              onClick={() => {
                handleUndo();
                setTwoFingerMenu(null);
              }}
            >
              <span>Undo</span>
            </button>
            <button
              className={`mobile-context-sheet-item ${clipboardElements.length === 0 ? 'disabled' : ''}`}
              onClick={() => {
                handlePaste(twoFingerMenu.canvasX, twoFingerMenu.canvasY);
                setTwoFingerMenu(null);
              }}
            >
              <span>Paste</span>
            </button>
            <button
              className="mobile-context-sheet-item"
              onClick={() => {
                handleSelectAll();
                setTwoFingerMenu(null);
              }}
            >
              <span>Select All</span>
            </button>
          </div>
        </div>
      )}

      {/* Sync Settings & Pairing Modal (Phase 5) */}
      <SyncSettingsModal
        isOpen={isSyncSettingsOpen}
        onClose={() => setIsSyncSettingsOpen(false)}
        onSyncApplied={refreshCurrentBoardElements}
      />
    </div>
  );
};

export default App;
