import { Element, ElementPositionUpdate, Board, BoardTreeNode, SearchResult } from '../types';
import { invoke } from '@tauri-apps/api/core';

export const CANONICAL_ROOT_BOARD_ID = '37da11b3-458d-489d-904d-d5f83b0d1380';

let rootBoardIdCache: string | null = null;

export const resetRootBoardIdCache = () => {
  rootBoardIdCache = null;
};

const getRootBoardId = async (): Promise<string> => {
  if (rootBoardIdCache) return rootBoardIdCache;
  try {
    const boards = await invoke<Board[]>('list_boards', { parentId: null });
    if (boards.length > 0) {
      const canonical = boards.find((b) => b.id.toLowerCase() === CANONICAL_ROOT_BOARD_ID.toLowerCase());
      rootBoardIdCache = canonical ? canonical.id : boards[0].id;
      return rootBoardIdCache;
    }
  } catch (e) {
    console.error('Error fetching root boards:', e);
  }
  rootBoardIdCache = CANONICAL_ROOT_BOARD_ID;
  return rootBoardIdCache;
};

export const resolveBoardId = async (boardId?: string | null): Promise<string> => {
  if (!boardId || boardId === 'root-board' || boardId === '00000000-0000-0000-0000-000000000001') {
    return await getRootBoardId();
  }
  return boardId;
};

export const searchBoards = async (query: string): Promise<SearchResult[]> => {
  return await invoke<SearchResult[]>('search_boards', { query });
};

export const ipcService = {
  listBoards: async (parentId?: string | null): Promise<Board[]> => {
    return await invoke<Board[]>('list_boards', { parentId: parentId || null });
  },

  getBoardTree: async (): Promise<BoardTreeNode[]> => {
    return await invoke<BoardTreeNode[]>('get_board_tree');
  },

  getElementsForBoard: async (boardId: string): Promise<Element[]> => {
    const resolvedId = await resolveBoardId(boardId);
    return await invoke<Element[]>('get_board_elements', { boardId: resolvedId });
  },

  syncBoardState: async (boardId: string, elements: Element[]): Promise<void> => {
    const resolvedId = await resolveBoardId(boardId);
    await invoke('sync_board_state', { boardId: resolvedId, elements });
  },

  // Creates a new element. If elementData already has an id (e.g. paste), it is preserved.
  createElement: async (elementData: Partial<Element> & Omit<Element, 'id' | 'created_at' | 'updated_at'>): Promise<Element> => {
    const now = new Date().toISOString();
    const newElement: Element = {
      ...elementData,
      id: (elementData as any).id || crypto.randomUUID(),
      created_at: (elementData as any).created_at || now,
      updated_at: now,
    } as Element;
    newElement.board_id = await resolveBoardId(newElement.board_id);
    await invoke('create_element', { element: newElement });
    return newElement;
  },

  batchUpdateElementPositions: async (updates: ElementPositionUpdate[]): Promise<void> => {
    if (updates.length === 0) return;
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

  createBoard: async (title: string, parentId?: string | null, colorTheme?: string | null): Promise<Board> => {
    const resolvedParentId = parentId ? await resolveBoardId(parentId) : null;
    return await invoke<Board>('create_board', {
      title,
      parentId: resolvedParentId,
      colorTheme: colorTheme || null,
    });
  },

  updateBoard: async (boardId: string, title?: string, colorTheme?: string): Promise<Board> => {
    const resolvedId = await resolveBoardId(boardId);
    return await invoke<Board>('update_board', { id: resolvedId, title, colorTheme });
  },

  deleteBoard: async (id: string): Promise<void> => {
    const resolvedId = await resolveBoardId(id);
    await invoke('delete_board', { id: resolvedId });
  },

  searchElements: async (_query: string) => {
    return Promise.resolve([]);
  },

  search: async (query: string) => {
    return await searchBoards(query);
  },

  storeImageFile: async (base64Data: string): Promise<StoredImageInfo> => {
    return await invoke<StoredImageInfo>('store_image_file', { base64Data });
  },

  getImageFile: async (fileId: string): Promise<string> => {
    return await invoke<string>('get_image_file', { fileId });
  },

  createBackup: async (label?: string): Promise<BackupInfo> => {
    return await invoke<BackupInfo>('create_backup', { label: label || null });
  },

  listBackups: async (): Promise<BackupInfo[]> => {
    return await invoke<BackupInfo[]>('list_backups');
  },

  restoreBackup: async (filename: string): Promise<string> => {
    return await invoke<string>('restore_backup', { filename });
  },

  exportBackup: async (targetPath: string): Promise<void> => {
    await invoke('export_backup', { targetPath });
  },
};

export interface StoredImageInfo {
  file_id: string;
  mime_type: string;
  size_bytes: number;
}

export interface BackupInfo {
  filename: string;
  path: string;
  created_at: number;
  size_bytes: number;
  label: string;
}

export interface EndpointConfig {
  kind: 'lan' | 'mailbox' | 'local';
  url: string;
}

export interface PeerConfig {
  site_id: string;
  name: string;
  endpoints: EndpointConfig[];
}

export interface ServerSettings {
  enabled: boolean;
  port: number;
}

export interface MailboxSettings {
  enabled: boolean;
  url: string;
  push_scope: string;
}

export interface LimitSettings {
  max_file_mib: number;
  page_rows: number;
}

export interface SyncConfig {
  device_name: string;
  role: string;
  server: ServerSettings;
  peers: PeerConfig[];
  mailbox: MailboxSettings;
  limits: LimitSettings;
}

export interface PeerSyncStatus {
  peer_id: string;
  name: string;
  last_synced_at: number | null;
  last_error: string | null;
  active_transport: 'lan' | 'mailbox' | 'local' | null;
  consecutive_failures: number;
  pull_cursor: number;
  push_cursor: number;
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'paused' | 'error';
  active_transport: 'lan' | 'mailbox' | 'local' | null;
  last_synced_at: number | null;
  pending_local_changes: number;
  last_error: string | null;
  peers: PeerSyncStatus[];
}

export interface StartPairingResponse {
  pairing_code: string;
  qr_svg: string;
  recovery_code: string;
  hub_hints: string[];
}

export interface PeerHealth {
  status: string;
  site_id: string;
  device_name?: string;
  protocol_version: number;
  schema_version: number;
  db_version: number;
}

export const syncService = {
  getConfig: async (): Promise<SyncConfig> => {
    return await invoke<SyncConfig>('get_sync_config');
  },
  saveConfig: async (config: SyncConfig): Promise<void> => {
    await invoke('save_sync_config', { config });
  },
  startPairing: async (): Promise<StartPairingResponse> => {
    return await invoke<StartPairingResponse>('start_pairing');
  },
  completePairing: async (code: string): Promise<SyncConfig> => {
    return await invoke<SyncConfig>('complete_pairing', { code });
  },
  listPeers: async (): Promise<PeerConfig[]> => {
    return await invoke<PeerConfig[]>('list_peers');
  },
  addPeer: async (peer: PeerConfig): Promise<SyncConfig> => {
    return await invoke<SyncConfig>('add_peer', { peer });
  },
  removePeer: async (siteId: string): Promise<SyncConfig> => {
    return await invoke<SyncConfig>('remove_peer', { siteId });
  },
  testPeer: async (url: string, kind: string): Promise<PeerHealth> => {
    return await invoke<PeerHealth>('test_peer', { url, kind });
  },
  testMailbox: async (url: string): Promise<{ status: string; latest_seq: number; devices_count: number }> => {
    return await invoke('test_mailbox', { url });
  },
  triggerSync: async (peerId?: string): Promise<any> => {
    return await invoke('trigger_sync', { peerId: peerId || null });
  },
  getStatus: async (): Promise<SyncStatus> => {
    return await invoke<SyncStatus>('get_sync_status');
  },
  exportLog: async (): Promise<string> => {
    return await invoke<string>('export_sync_log');
  },
  forgetPeer: async (peerId: string): Promise<void> => {
    await invoke('sync_forget_peer', { peerId });
  },
  clearInactivePeers: async (): Promise<void> => {
    await invoke('sync_clear_inactive_peers');
  },
};

