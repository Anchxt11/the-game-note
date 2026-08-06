export interface Board {
  id: string;
  parent_board_id: string | null;
  title: string;
  color_theme: string | null;
  created_at: string;
  updated_at: string;
}

export type ElementType = 
  | 'note' 
  | 'image' 
  | 'link' 
  | 'file' 
  | 'task_list' 
  | 'column' 
  | 'connector' 
  | 'nested_board'
  | 'comment'
  | 'table'
  | 'line';

export type CardColorTint =
  | 'charcoal'
  | 'gold'
  | 'crimson'
  | 'forest'
  | 'ocean'
  | 'violet';

export const CARD_COLORS: Record<CardColorTint, { bg: string; border: string; headerBg: string; name: string }> = {
  charcoal: { bg: 'rgb(51, 51, 51)', border: '#404040', headerBg: 'rgb(45, 45, 45)', name: 'Default Gray' },
  gold: { bg: '#3d321d', border: '#5c4927', headerBg: '#312715', name: 'Warm Gold' },
  crimson: { bg: '#422123', border: '#633134', headerBg: '#33191b', name: 'Muted Crimson' },
  forest: { bg: '#1f3627', border: '#2f523c', headerBg: '#18281d', name: 'Forest Green' },
  ocean: { bg: '#1c3140', border: '#2a485e', headerBg: '#162530', name: 'Deep Sky Blue' },
  violet: { bg: '#362347', border: '#53356b', headerBg: '#281a33', name: 'Royal Violet' },
};

export interface Element {
  id: string;
  board_id: string;
  element_type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  content: Record<string, any>;
  style: {
    color_tint?: CardColorTint;
    background_color?: string;
    text_color?: string;
    is_unsorted?: boolean;
    is_locked?: boolean;
    parent_column_id?: string | null;
    [key: string]: any;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface TaskListItem {
  id: string;
  element_id: string;
  text: string;
  is_checked: boolean;
  order_index: number;
}

export interface Connector {
  id: string;
  board_id: string;
  from_element_id: string;
  to_element_id: string;
  style: Record<string, any> | null;
}

export interface BoardTreeNode {
  board: Board;
  children: BoardTreeNode[];
}

export interface ElementPositionUpdate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
}

export interface SearchResult {
  entity_type: string;
  board_id: string;
  element_id: string | null;
  title_or_text: string;
  snippet: string;
}

// Expanded tool options supporting the official Photo 2 "More Tools" popup menu & lower palette!
export type ToolType = 
  | 'select' 
  | ElementType 
  | 'line'
  | 'draw' 
  | 'upload'
  | 'sketch'
  | 'color'
  | 'document'
  | 'audio'
  | 'map'
  | 'video'
  | 'heading';

export interface HistoryAction {
  type: 'move' | 'create' | 'delete' | 'recolor' | 'content_change';
  timestamp: number;
  previous_elements: Element[];
  next_elements: Element[];
}

export interface TableSubTarget {
  tableId: string;
  type: 'cell' | 'row' | 'column';
  cellIndices?: number[];
  rowIndex?: number;
  colIndex?: number;
}
