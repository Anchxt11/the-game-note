import { Element, ElementPositionUpdate, Board, SearchResult } from '../types';
import { invoke } from '@tauri-apps/api/core';

let rootBoardIdCache: string | null = null;

const getRootBoardId = async (): Promise<string> => {
  if (rootBoardIdCache) return rootBoardIdCache;
  const boards = await invoke<Board[]>('list_boards', { parentId: null });
  if (boards.length > 0) {
    rootBoardIdCache = boards[0].id;
    return rootBoardIdCache;
  }
  throw new Error("No root board found");
};

const resolveBoardId = async (boardId: string): Promise<string> => {
  if (boardId === 'root-board') return await getRootBoardId();
  return boardId;
};

export const searchBoards = async (query: string): Promise<SearchResult[]> => {
  return await invoke<SearchResult[]>('search_boards', { query });
};

export const ipcService = {
  getElementsForBoard: async (boardId: string): Promise<Element[]> => {
    const resolvedId = await resolveBoardId(boardId);
    return await invoke<Element[]>('get_board_elements', { boardId: resolvedId });
  },
  syncBoardState: async (boardId: string, elements: Element[]): Promise<void> => {
    const resolvedId = await resolveBoardId(boardId);
    await invoke('sync_board_state', { boardId: resolvedId, elements });
  },
  createElement: async (elementData: Omit<Element, 'id' | 'created_at' | 'updated_at'>): Promise<Element> => {
    const newElement: Element = {
      ...elementData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    newElement.board_id = await resolveBoardId(newElement.board_id);
    await invoke('create_element', { element: newElement });
    return newElement;
  },
  batchUpdateElementPositions: async (updates: ElementPositionUpdate[]): Promise<void> => {
    await invoke('update_element_positions', { updates });
  },
  updateElementContent: async (id: string, content: Record<string, any>): Promise<void> => {
    await invoke('update_element_content', { id, content });
  },
  updateElementStyle: async (id: string, style: Record<string, any>): Promise<void> => {
    await invoke('update_element_style', { id, style });
  },
  updateElementBoardId: async (id: string, board_id: string): Promise<void> => {
    const resolvedId = await resolveBoardId(board_id);
    await invoke('update_element_board_id', { id, boardId: resolvedId });
  },
  deleteElement: async (id: string): Promise<void> => {
    await invoke('delete_element', { id });
  },
  searchElements: async (_query: string) => {
    return Promise.resolve([]);
  },
  search: async (query: string) => {
    return await searchBoards(query);
  }
};

