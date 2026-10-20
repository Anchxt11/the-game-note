import React, { useState, useEffect } from 'react';
import { Search, X, Folder, FileText, ArrowUpRight } from 'lucide-react';
import { SearchResult, BoardTreeNode } from '../types';
import { ipcService } from '../services/ipc';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (boardId: string, elementId: string | null) => void;
}

interface FlatBoard {
  id: string;
  title: string;
  depth: number;
  isRoot: boolean;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectResult,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [boards, setBoards] = useState<FlatBoard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      return;
    }

    const loadWorkspaceBoards = async () => {
      try {
        const tree = await ipcService.getBoardTree();
        const flat: FlatBoard[] = [];
        const traverse = (nodes: BoardTreeNode[], depth: number) => {
          for (const node of nodes) {
            flat.push({
              id: node.board.id,
              title: node.board.title || 'Untitled Board',
              depth,
              isRoot: node.board.parent_board_id === null,
            });
            if (node.children) {
              traverse(node.children, depth + 1);
            }
          }
        };
        traverse(tree, 0);
        setBoards(flat);
      } catch (err) {
        console.error('Failed to load workspace boards for search modal:', err);
      }
    };

    loadWorkspaceBoards();
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await ipcService.search(query.trim());
        setResults(res);
      } catch (err) {
        console.error('Search query failed:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-box">
          <Search size={20} color="var(--milanote-text-muted)" />
          <input
            type="text"
            autoFocus
            placeholder="Search notes, task lists, links, or boards across workspace..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
          {query && (
            <button className="header-btn icon-only" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="search-results-list">
          {loading && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--milanote-text-muted)', fontSize: '13px' }}>
              Searching workspace indexes...
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--milanote-text-muted)', fontSize: '13px' }}>
              No items matching "{query}" found in your boards.
            </div>
          )}

          {!loading && query && results.map((item, idx) => (
            <div
              key={`${item.board_id}-${item.element_id || idx}`}
              className="search-item"
              onClick={() => {
                onSelectResult(item.board_id, item.element_id);
                onClose();
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', fontSize: '13px', color: 'var(--milanote-text-primary)' }}>
                  {item.entity_type === 'board' ? <Folder size={15} color="var(--milanote-accent)" /> : <FileText size={15} color="#8fa0ff" />}
                  {item.title_or_text || 'Untitled Element'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--milanote-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Jump <ArrowUpRight size={13} />
                </span>
              </div>
              {item.snippet && (
                <div className="search-item-snippet">
                  {item.snippet}
                </div>
              )}
            </div>
          ))}

          {!loading && !query && (
            <div>
              <div style={{ padding: '8px 16px 4px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--milanote-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Workspace Boards ({boards.length})
              </div>
              {boards.map((b) => (
                <div
                  key={b.id}
                  className="search-item"
                  style={{ paddingLeft: `${16 + b.depth * 16}px` }}
                  onClick={() => {
                    onSelectResult(b.id, null);
                    onClose();
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px', color: 'var(--milanote-text-primary)' }}>
                      <Folder size={15} color="var(--milanote-accent)" />
                      {b.title}
                      {b.isRoot && (
                        <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', color: 'var(--milanote-text-muted)' }}>
                          Root
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--milanote-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Open <ArrowUpRight size={13} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
