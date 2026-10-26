import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Search, UploadCloud, Trash2, Check } from 'lucide-react';
import { Element } from '../types';
import {
  BoardIconRenderer,
  getIconCategoriesForBoard,
  getIconsForCategory,
  searchBoardIcons
} from '../utils/boardIconUtils';

interface BoardIconPanelProps {
  element: Element;
  onSelectIcon: (iconName: string) => void;
  onUploadImage: (dataUrl: string) => void;
  onRemoveImage: () => void;
  onClose: () => void;
}

export const BoardIconPanel: React.FC<BoardIconPanelProps> = ({
  element,
  onSelectIcon,
  onUploadImage,
  onRemoveImage,
  onClose,
}) => {
  const boardTitle = element.content?.title || 'New Board';
  const currentIcon = element.content?.custom_icon || null;
  const currentImageUrl = element.content?.custom_image_url || null;

  const categories = useMemo(() => {
    return getIconCategoriesForBoard(boardTitle);
  }, [boardTitle]);

  const [activeCategory, setActiveCategory] = useState<string>(() => {
    const cats = getIconCategoriesForBoard(boardTitle);
    return cats[0] || 'Recommended';
  });

  // Keep active category in sync if board title changes
  useEffect(() => {
    if (activeCategory !== 'Upload an image' && !categories.includes(activeCategory)) {
      setActiveCategory(categories[0] || 'Recommended');
    }
  }, [categories, activeCategory]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Memoize icon list for active category or search query
  const activeIconList = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      return searchBoardIcons(searchQuery);
    }
    return getIconsForCategory(activeCategory, boardTitle);
  }, [activeCategory, searchQuery, boardTitle]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file);
    }
  };

  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      if (dataUrl) {
        onUploadImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="board-icon-popover-panel"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Left Category Column */}
      <div className="board-icon-nav-column">
        <div className="board-icon-categories-list">
          {categories.map((cat) => {
            const isActive = activeCategory === cat && !searchQuery.trim();
            return (
              <button
                key={cat}
                className={`board-icon-category-btn ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(cat);
                  setSearchQuery('');
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Search input at bottom of left column */}
        <div className="board-icon-search-wrap">
          <input
            type="text"
            className="board-icon-search-input"
            placeholder="Search icons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search size={14} className="board-icon-search-icon" />
        </div>
      </div>

      {/* Right Content Area: Icon Grid or Upload View */}
      <div className="board-icon-content-area">
        {activeCategory === 'Upload an image' && !searchQuery.trim() ? (
          <div className="board-icon-upload-view">
            {/* Existing custom image preview */}
            {currentImageUrl && (
              <div className="board-icon-current-image-preview">
                <div className="current-image-thumb">
                  <img src={currentImageUrl} alt="Current icon" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>Custom Image Icon</div>
                  <div style={{ fontSize: '11px', color: '#9fa3ac', marginTop: '2px' }}>Active as board icon</div>
                </div>
                <button
                  className="remove-custom-image-btn"
                  onClick={() => onRemoveImage()}
                  title="Remove image and revert to symbol icon"
                >
                  <Trash2 size={15} />
                  <span>Remove</span>
                </button>
              </div>
            )}

            {/* Dropzone */}
            <div
              className={`board-icon-dropzone ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={38} color="#9fa3ac" style={{ marginBottom: '10px' }} />
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f3f4f6' }}>
                {isDragOver ? 'Drop image here' : 'Upload an image as board icon'}
              </div>
              <div style={{ fontSize: '11.5px', color: '#8d929c', marginTop: '4px', textAlign: 'center' }}>
                Drag and drop here, or click to browse
              </div>
              <div style={{ fontSize: '10.5px', color: '#666a73', marginTop: '6px' }}>
                PNG, JPG, SVG, WebP up to 5MB
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>
          </div>
        ) : (
          <div className="board-icon-grid-scrollable">
            {searchQuery.trim() && (
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#8e939d', marginBottom: '12px', paddingLeft: '4px' }}>
                {activeIconList.length > 0 ? `Search results (${activeIconList.length})` : `No icons found for "${searchQuery}"`}
              </div>
            )}

            {activeIconList.length === 0 && searchQuery.trim() ? (
              <div className="board-icon-empty-search">
                <p>Try searching for keywords like "arrow", "star", "music", "game", "code", or "chat"</p>
              </div>
            ) : (
              <div className="board-icon-grid">
                {activeIconList.map((iconKey, idx) => {
                  const isSelected = !currentImageUrl && currentIcon === iconKey;
                  return (
                    <button
                      key={`${iconKey}-${idx}`}
                      className={`board-icon-grid-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => onSelectIcon(iconKey)}
                      title={iconKey.replace('boxed:', 'Boxed ').replace('char:', 'Character ')}
                    >
                      <BoardIconRenderer
                        iconName={iconKey}
                        size={24}
                        color={isSelected ? '#ffffff' : '#c8ccd6'}
                      />
                      {isSelected && (
                        <div className="board-icon-selected-badge">
                          <Check size={9} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
