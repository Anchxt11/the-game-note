import React, { useState, useEffect } from 'react';
import { Search, X, Folder, FileText, ArrowUpRight } from 'lucide-react';
import { SearchResult } from '../types';
import { ipcService } from '../services/ipc';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (boardId: string, elementId: string | null) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectResult,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      return;
    }
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

          {!loading && results.map((item, idx) => (
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
        </div>
      </div>
    </div>
  );
};
