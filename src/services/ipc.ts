import { Element, ElementPositionUpdate } from '../types';

// In-memory persistent database storage simulating SQLite IPC calls.
// Initialized 100% empty on boot per user instructions!
let inMemoryElements: Element[] = [];

const LOCAL_STORAGE_KEY = 'milanote_elements_db';

try {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (stored) {
    inMemoryElements = JSON.parse(stored);
  }
} catch (e) {
  console.error("Failed to load elements from localStorage", e);
}

const saveDb = () => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(inMemoryElements));
  } catch (e) {
    console.error("Failed to save elements to localStorage", e);
  }
};

export const searchBoards = async (_query: string) => {
  return Promise.resolve([]);
};

export const ipcService = {
  getElementsForBoard: async (boardId: string): Promise<Element[]> => {
    return Promise.resolve(inMemoryElements.filter((el) => el.board_id === boardId));
  },
  syncBoardState: async (boardId: string, elements: Element[]): Promise<void> => {
    inMemoryElements = [
      ...inMemoryElements.filter((el) => el.board_id !== boardId),
      ...elements
    ];
    saveDb();
    return Promise.resolve();
  },
  createElement: async (elementData: Omit<Element, 'id' | 'created_at' | 'updated_at'>): Promise<Element> => {
    const newElement: Element = {
      ...elementData,
      id: `el-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    inMemoryElements.push(newElement);
    saveDb();
    return Promise.resolve(newElement);
  },
  batchUpdateElementPositions: async (updates: ElementPositionUpdate[]): Promise<void> => {
    inMemoryElements = inMemoryElements.map((el) => {
      const update = updates.find((u) => u.id === el.id);
      return update ? { ...el, ...update } : el;
    });
    saveDb();
    return Promise.resolve();
  },
  updateElementContent: async (id: string, content: Record<string, any>): Promise<void> => {
    inMemoryElements = inMemoryElements.map((el) => (el.id === id ? { ...el, content } : el));
    saveDb();
    return Promise.resolve();
  },
  updateElementStyle: async (id: string, style: Record<string, any>): Promise<void> => {
    inMemoryElements = inMemoryElements.map((el) => (el.id === id ? { ...el, style } : el));
    saveDb();
    return Promise.resolve();
  },
  updateElementBoardId: async (id: string, board_id: string): Promise<void> => {
    inMemoryElements = inMemoryElements.map((el) => (el.id === id ? { ...el, board_id } : el));
    saveDb();
    return Promise.resolve();
  },
  deleteElement: async (id: string): Promise<void> => {
    inMemoryElements = inMemoryElements.filter((el) => el.id !== id);
    saveDb();
    return Promise.resolve();
  },
  searchElements: async (_query: string) => {
    return Promise.resolve([]);
  },
  search: async (_query: string) => {
    return Promise.resolve([]);
  }
};

