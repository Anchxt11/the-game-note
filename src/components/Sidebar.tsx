import React, { useState } from 'react';
import { BoardTreeNode, SearchResult } from '../types';
import { searchBoards } from '../services/ipc';
import { Folder, ChevronRight, ChevronDown, Search, Plus, X, Layers, Sparkles } from 'lucide-react';

interface SidebarProps {
  tree: BoardTreeNode[];
  activeBoardId: string | null;
  onSelectBoard: (id: string) => void;
  onCreateRootBoard: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  tree,
  activeBoardId,
  onSelectBoard,
  onCreateRootBoard,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.trim().length >= 2) {
      setIsSearching(true);
      try {
        const res = await searchBoards(query);
        setSearchResults(res);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults([]);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
  };

  return (
    <aside className={`fixed left-0 top-14 bottom-0 z-20 transition-all duration-300 flex flex-col ${
      isOpen ? 'w-64' : 'w-0 overflow-hidden'
    } glass-panel border-r border-white/10 shadow-2xl`}>
      {/* Header & Create Button */}
      <div className="p-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-[var(--accent-cosmic)]" />
          <span className="font-bold text-sm text-slate-100 tracking-wide">MY BOARDS</span>
        </div>
        <button
          onClick={onCreateRootBoard}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-[var(--accent-cosmic)] hover:text-white transition text-slate-300"
          title="Create New Board"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* FTS5 Search Box */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search notes, tasks, boards..."
            className="w-full bg-slate-900/90 text-slate-200 pl-9 pr-7 py-1.5 rounded-xl text-xs border border-white/10 outline-none focus:border-[var(--accent-cosmic)] transition placeholder:text-slate-500"
          />
          {searchQuery && (
            <button onClick={clearSearch} className="absolute right-2 text-slate-500 hover:text-white">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Content Area (Search Results or Tree View) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {searchQuery.trim().length >= 2 ? (
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2">
              {isSearching ? "Searching..." : `Found ${searchResults.length} Matches`}
            </span>
            {searchResults.map((r, i) => (
              <div
                key={`${r.board_id}-${r.element_id}-${i}`}
                onClick={() => { onSelectBoard(r.board_id); clearSearch(); }}
                className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 cursor-pointer border border-white/5 hover:border-[var(--accent-cosmic)]/40 transition group"
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-200 mb-1">
                  <span className="capitalize text-[var(--accent-cosmic-hover)] font-semibold">{r.entity_type}</span>
                  <span className="text-slate-500 text-[10px]">Board Jump →</span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2 font-normal leading-relaxed">
                  {r.snippet || r.title_or_text}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {tree.map((node) => (
              <TreeNodeItem
                key={node.board.id}
                node={node}
                activeId={activeBoardId}
                onSelect={onSelectBoard}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Info / COSMIC Badge */}
      <div className="p-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Layers size={14} className="text-purple-400" />
          <span>Infinite Canvas</span>
        </span>
        <span className="bg-purple-900/40 text-purple-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-purple-500/30">
          No Limits
        </span>
      </div>
    </aside>
  );
};

const TreeNodeItem: React.FC<{
  node: BoardTreeNode;
  activeId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}> = ({ node, activeId, onSelect, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isActive = activeId === node.board.id;

  return (
    <div>
      <div
        onClick={() => onSelect(node.board.id)}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        className={`flex items-center gap-2 py-2 pr-3 rounded-xl text-xs font-medium cursor-pointer transition ${
          isActive
            ? 'bg-[var(--accent-cosmic)] text-white shadow-lg shadow-[var(--accent-cosmic)]/30 font-semibold'
            : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="p-0.5 rounded hover:bg-white/10"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        ) : (
          <span className="w-4" />
        )}
        <Folder size={15} className={isActive ? 'text-white' : 'text-purple-400'} />
        <span className="truncate flex-1">{node.board.title}</span>
      </div>

      {hasChildren && expanded && (
        <div className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.board.id}
              node={child}
              activeId={activeId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};
