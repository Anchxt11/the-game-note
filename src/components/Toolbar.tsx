import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ToolType } from '../types';
import {
  StickyNote,
  Link as LinkIcon,
  CheckSquare,
  Minus,
  FolderPlus,
  Columns,
  MessageSquare,
  Table,
  Image as ImageIcon,
  Upload,
  PenTool,
  MoreHorizontal,
  Trash2,
  Edit3,
  Palette,
  FileText,
  Volume2,
  MapPin,
  Video,
  Type,
  Search,
  Plus,
  X
} from 'lucide-react';

interface ToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  isDraggingElement?: boolean;
  isHoveringTrash?: boolean;
  onTrashDrop?: () => void;
  onAddImageFromDrawer?: (url: string, caption?: string) => void;
}

const curatedPhotos: Record<string, Array<{ url: string; caption: string }>> = {
  recommended: [
    { url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80', caption: 'Oil Painting' },
    { url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80', caption: 'Abstract Wave' },
    { url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80', caption: 'Mountain Peak' },
    { url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80', caption: 'Aurora Night' },
  ],
  core: [
    { url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80', caption: 'Cyberpunk Grid' },
    { url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80', caption: 'Game Controller' },
    { url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80', caption: 'Esports Arena' },
    { url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80', caption: 'Neon Alley' },
  ],
  mechanics: [
    { url: 'https://images.unsplash.com/photo-1580234810507-6b47c9451963?auto=format&fit=crop&w=600&q=80', caption: 'Blueprint Gear' },
    { url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80', caption: 'Digital Matrix' },
    { url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80', caption: 'Cyber Security' },
    { url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=600&q=80', caption: 'Server Nodes' },
  ],
};

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onSelectTool,
  isDraggingElement = false,
  isHoveringTrash = false,
  onTrashDrop = () => { },
  onAddImageFromDrawer,
}) => {
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [showImageDrawer, setShowImageDrawer] = useState(false);
  const [activeImageTab, setActiveImageTab] = useState<'recommended' | 'core' | 'mechanics' | 'upload'>('upload');
  const [pexelsQuery, setPexelsQuery] = useState('');
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close floating more tools menu if clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowMoreTools(false);
        setShowImageDrawer(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleToolDragStart = (e: React.DragEvent, tool: ToolType) => {
    e.dataTransfer.setData('application/milanote-tool', tool);
    e.dataTransfer.effectAllowed = 'copy';
    (window as any).__MILANOTE_DRAGGED_TOOL__ = tool;
    (window as any).__MILANOTE_DRAGGED_IMAGE_URL__ = undefined;
    (window as any).__MILANOTE_DRAGGED_IMAGE_CAPTION__ = undefined;

    // Custom Drag Preview Shelf
    const shelf = document.getElementById('drag-preview-shelf');
    const tempEl = document.createElement('div');
    tempEl.className = 'custom-drag-preview';

    if (tool === 'note') {
      tempEl.className += ' drag-preview-note';
      tempEl.innerHTML = `
        <div style="background: #2a2b30; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; padding: 14px; width: 240px; height: 60px; color: #ffffff; font-family: Inter, sans-serif; font-size: 14px; font-weight: 500; box-shadow: 0 16px 36px rgba(0,0,0,0.85);">
          Start typing...
        </div>
      `;
    } else if (tool === 'column') {
      tempEl.className += ' drag-preview-column';
      tempEl.innerHTML = `
        <div style="background: #232428; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; width: 300px; height: 130px; display: flex; flex-direction: column; box-shadow: 0 16px 36px rgba(0,0,0,0.85);">
          <div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); font-weight: 700; font-family: Outfit, sans-serif; color: #ffffff;">New Column</div>
          <div style="padding: 16px; color: #cbd5e1; font-size: 13px;">0 cards</div>
        </div>
      `;
    } else if (tool === 'nested_board') {
      tempEl.className += ' drag-preview-board';
      tempEl.innerHTML = `
        <div style="background: #232428; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; width: 110px; height: 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 16px 36px rgba(0,0,0,0.85);">
          <div style="width: 48px; height: 48px; border-radius: 8px; background: linear-gradient(135deg, #df9a65 0%, #b57338 100%); margin-bottom: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 20px;">B</div>
          <div style="color: #ffffff; font-size: 13px; font-weight: 600; font-family: Outfit, sans-serif;">New Board</div>
        </div>
      `;
    } else if (tool === 'task_list') {
      tempEl.className += ' drag-preview-checklist';
      tempEl.innerHTML = `
        <div style="background: #232428; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; padding: 12px; width: 280px; box-shadow: 0 16px 36px rgba(0,0,0,0.85); color: #ffffff; font-size: 14px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;"><div style="width: 16px; height: 16px; border-radius: 4px; border: 2px solid rgba(255,255,255,0.6);"></div> New checklist item...</div>
        </div>
      `;
    } else {
      tempEl.innerHTML = `
        <div style="background: #232428; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; padding: 12px 20px; color: #e1e1e6; font-weight: 600; font-size: 13px; box-shadow: 0 16px 36px rgba(0,0,0,0.85);">
          Add ${tool.toUpperCase()}
        </div>
      `;
    }

    if (shelf) {
      shelf.innerHTML = '';
      shelf.appendChild(tempEl);
      e.dataTransfer.setDragImage(tempEl, 20, 20);
      setTimeout(() => { if (shelf) shelf.innerHTML = ''; }, 100);
    }
  };

  const primaryTools: Array<{ id: ToolType; icon: any; label: string }> = [
    { id: 'note', icon: StickyNote, label: 'Note' },
    { id: 'link', icon: LinkIcon, label: 'Link' },
    { id: 'task_list', icon: CheckSquare, label: 'To-do' },
    { id: 'line', icon: Minus, label: 'Line' },
    { id: 'nested_board', icon: FolderPlus, label: 'Board' },
    { id: 'column', icon: Columns, label: 'Column' },
    { id: 'comment', icon: MessageSquare, label: 'Comment' },
    { id: 'table', icon: Table, label: 'Table' },
  ];

  const secondaryTools: Array<{ id: ToolType; icon: any; label: string }> = [
    { id: 'image', icon: ImageIcon, label: 'Add Image' },
    { id: 'upload', icon: Upload, label: 'Upload' },
    { id: 'draw', icon: PenTool, label: 'Draw' },
  ];

  const moreToolsGrid: Array<{ id: ToolType; icon: any; label: string; badgeColor: string }> = [
    { id: 'sketch', icon: Edit3, label: 'Sketch', badgeColor: '#52525a' },
    { id: 'color', icon: Palette, label: 'Color', badgeColor: '#e65360' },
    { id: 'document', icon: FileText, label: 'Document', badgeColor: '#3ca17e' },
    { id: 'audio', icon: Volume2, label: 'Audio', badgeColor: '#df9a65' },
    { id: 'map', icon: MapPin, label: 'Map', badgeColor: '#4c9aff' },
    { id: 'video', icon: Video, label: 'Video', badgeColor: '#9c54e5' },
    { id: 'heading', icon: Type, label: 'Heading', badgeColor: '#a5a5ad' },
  ];

  const displayedPhotos = useMemo(() => {
    if (pexelsQuery.trim()) {
      // Filter or mix curated photos matching query
      return [...curatedPhotos.recommended, ...curatedPhotos.core, ...curatedPhotos.mechanics].filter(p => 
        p.caption.toLowerCase().includes(pexelsQuery.toLowerCase())
      );
    }
    if (activeImageTab !== 'upload' && curatedPhotos[activeImageTab]) {
      return curatedPhotos[activeImageTab];
    }
    return [];
  }, [activeImageTab, pexelsQuery]);

  return (
    <>
      <aside className="milanote-toolbar" ref={toolbarRef} onClick={(e) => e.stopPropagation()}>
      {/* Primary Tool Stack */}
      <div className="toolbar-section">
        {primaryTools.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`toolbar-tool-btn ${activeTool === id ? 'active' : ''}`}
            onClick={() => {
              onSelectTool(activeTool === id ? 'select' : id);
              setShowMoreTools(false);
              setShowImageDrawer(false);
            }}
            draggable
            onDragStart={(e) => handleToolDragStart(e, id)}
            title={`Add ${label} (Tap to place, or drag to canvas)`}
          >
            <Icon size={20} />
            <span className="tool-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-separator" />

      {/* More Tools Button (•••) */}
      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <button
          className={`toolbar-tool-btn ${showMoreTools ? 'active' : ''}`}
          style={{ width: '100%' }}
          onClick={() => {
            setShowMoreTools(!showMoreTools);
            setShowImageDrawer(false);
          }}
          title="More Tools"
        >
          <MoreHorizontal size={20} />
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Secondary Bottom Tool Stack */}
      <div className="toolbar-section">
        {secondaryTools.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`toolbar-tool-btn ${activeTool === id || (id === 'image' && showImageDrawer) ? 'active' : ''}`}
            onClick={() => {
              if (id === 'image' || id === 'upload') {
                setShowImageDrawer(!showImageDrawer);
                setShowMoreTools(false);
              } else {
                onSelectTool(activeTool === id ? 'select' : id);
                setShowMoreTools(false);
                setShowImageDrawer(false);
              }
            }}
            draggable
            onDragStart={(e) => handleToolDragStart(e, id)}
            title={label}
          >
            <Icon size={20} />
            <span className="tool-label">{label}</span>
          </button>
        ))}
      </div>

      {/* Bottom Trash Bin */}
      <div className="toolbar-footer">
        <button
          className={`toolbar-tool-btn trash-bin-btn ${isDraggingElement ? 'drop-active' : ''} ${isHoveringTrash ? 'trash-hover' : ''}`}
          onClick={onTrashDrop}
          title="Trash (Drag element here to delete)"
        >
          <Trash2 size={20} />
          {isHoveringTrash && <span className="tool-label" style={{ color: '#ff4c4c' }}>Delete!</span>}
        </button>
      </div>

      {/* FLOATING MORE TOOLS MODAL POPUP */}
      {showMoreTools && (
        <div className="more-tools-fixed-popup">
          <div className="more-tools-header">More tools</div>
          <div className="more-tools-grid">
            {moreToolsGrid.map(({ id, icon: Icon, label, badgeColor }) => (
              <div
                key={id}
                className="more-tools-item"
                draggable
                onDragStart={(e) => {
                  setShowMoreTools(false);
                  handleToolDragStart(e, id);
                }}
                onClick={() => {
                  onSelectTool(activeTool === id ? 'select' : id);
                  setShowMoreTools(false);
                }}
              >
                <div className="more-tool-icon-box" style={{ background: badgeColor }}>
                  <Icon size={18} color="#ffffff" />
                </div>
                <span className="more-tool-label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FLOATING IMAGE DRAWER (IMAGE 3 PARITY) */}
      {showImageDrawer && (
        <div className="image-drawer-popup" onClick={(e) => e.stopPropagation()}>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') {
                    onAddImageFromDrawer?.(reader.result, '');
                    setShowImageDrawer(false);
                  }
                };
                reader.readAsDataURL(file);
              }
            }}
          />

          <div className="image-drawer-body-row">
            <div className="image-drawer-tabs">
              <button
                className={`image-drawer-tab-btn ${activeImageTab === 'recommended' ? 'active' : ''}`}
                onClick={() => { setActiveImageTab('recommended'); setPexelsQuery(''); }}
              >
                Recommended
              </button>
              <button
                className={`image-drawer-tab-btn ${activeImageTab === 'core' ? 'active' : ''}`}
                onClick={() => { setActiveImageTab('core'); setPexelsQuery(''); }}
              >
                Core
              </button>
              <button
                className={`image-drawer-tab-btn ${activeImageTab === 'mechanics' ? 'active' : ''}`}
                onClick={() => { setActiveImageTab('mechanics'); setPexelsQuery(''); }}
              >
                Mechanics
              </button>
              <button
                className={`image-drawer-tab-btn ${activeImageTab === 'upload' ? 'active' : ''}`}
                onClick={() => { setActiveImageTab('upload'); setPexelsQuery(''); }}
              >
                Upload your own
              </button>
            </div>

            <div className="image-drawer-content-pane">
              {activeImageTab === 'upload' && !pexelsQuery.trim() ? (
                <>
                  <div className="polaroid-stack-illustration">
                    <div style={{ position: 'absolute', transform: 'rotate(-12deg) translateX(-15px)', width: 68, height: 80, background: '#e1e1e6', borderRadius: 4, padding: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.45)' }}>
                      <div style={{ width: '100%', height: 54, background: '#444', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: '100%', height: '100%', background: 'radial-gradient(circle at 70% 30%, #fff, #999 60%)', opacity: 0.3 }} />
                      </div>
                    </div>
                    <div style={{ position: 'absolute', transform: 'rotate(10deg) translateX(18px)', width: 68, height: 80, background: '#cdd1de', borderRadius: 4, padding: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.45)' }}>
                      <div style={{ width: '100%', height: 54, background: '#333', borderRadius: 2 }} />
                    </div>
                    <div style={{ position: 'absolute', zIndex: 5, width: 74, height: 86, background: '#ffffff', borderRadius: 4, padding: 5, boxShadow: '0 6px 16px rgba(0,0,0,0.6)' }}>
                      <div style={{ width: '100%', height: 58, background: 'linear-gradient(135deg, #ff5722 0%, #d84315 100%)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 8, left: 10, width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
                        <div style={{ position: 'absolute', bottom: 0, left: -5, width: 50, height: 35, background: '#bf360c', transform: 'rotate(35deg)' }} />
                        <div style={{ position: 'absolute', bottom: 0, right: -10, width: 60, height: 40, background: '#3e2723', transform: 'rotate(-25deg)' }} />
                      </div>
                    </div>
                  </div>
                  <button className="orange-upload-btn" onClick={() => fileInputRef.current?.click()}>
                    Upload an image
                  </button>
                  <div className="upload-tip-text">
                    Tip: the easiest way to upload an image is to drag it straight into a board.
                  </div>
                </>
              ) : (
                <div className="pexels-grid-container">
                  {displayedPhotos.map((photo: { url: string; caption: string }, i: number) => (
                    <div
                      key={i}
                      className="pexels-grid-item"
                      onClick={() => {
                        onAddImageFromDrawer?.(photo.url, photo.caption);
                        setShowImageDrawer(false);
                      }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/milanote-tool', 'image');
                        (window as any).__MILANOTE_DRAGGED_TOOL__ = 'image';
                        (window as any).__MILANOTE_DRAGGED_IMAGE_URL__ = photo.url;
                        (window as any).__MILANOTE_DRAGGED_IMAGE_CAPTION__ = photo.caption;
                        setShowImageDrawer(false);
                      }}
                      title={`Click or drag "${photo.caption}" to board`}
                    >
                      <img src={photo.url} alt={photo.caption} />
                    </div>
                  ))}
                  {displayedPhotos.length === 0 && (
                    <div style={{ gridColumn: 'span 2', padding: 24, color: '#a5a5ad', fontSize: 13 }}>
                      No stock images found for "{pexelsQuery}".
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="image-drawer-footer">
            <div className="pexels-credit-text">
              Over 3 million free images provided by <span>Pexels</span>
            </div>
            <div className="pexels-search-input-wrap">
              <input
                type="text"
                className="pexels-search-input"
                placeholder="Search images..."
                value={pexelsQuery}
                onChange={(e) => {
                  setPexelsQuery(e.target.value);
                  if (activeImageTab === 'upload' && e.target.value.trim()) {
                    setActiveImageTab('recommended');
                  }
                }}
              />
              <Search size={16} className="pexels-search-icon" />
            </div>
          </div>
        </div>
      )}
    </aside>

    {/* MOBILE PHONE TOOL FAB & BOTTOM SHEET (TASK 3.2) */}
    <div className="mobile-tool-fab-container" onClick={(e) => e.stopPropagation()}>
      <button
        className={`mobile-tool-fab ${isMobileSheetOpen || (activeTool && activeTool !== 'select') ? 'active' : ''}`}
        onClick={() => setIsMobileSheetOpen(!isMobileSheetOpen)}
        title="Add element to board"
        aria-label="Add element to board"
      >
        {isMobileSheetOpen ? <X size={24} /> : <Plus size={24} />}
      </button>

      {isMobileSheetOpen && (
        <div className="mobile-tool-sheet-overlay" onClick={() => setIsMobileSheetOpen(false)}>
          <div className="mobile-tool-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-drag-handle" />
            <div className="mobile-tool-sheet-header">
              <h3>Add to board</h3>
              <button 
                className="mobile-sheet-close-btn" 
                onClick={() => setIsMobileSheetOpen(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mobile-tool-sheet-grid">
              {primaryTools.map(({ id, icon: Icon, label }) => (
                <button
                  key={`mobile-${id}`}
                  className={`mobile-tool-tile ${activeTool === id ? 'active' : ''}`}
                  onClick={() => {
                    onSelectTool(id);
                    setIsMobileSheetOpen(false);
                  }}
                >
                  <div className="mobile-tool-tile-icon">
                    <Icon size={22} />
                  </div>
                  <span>{label}</span>
                </button>
              ))}

              {secondaryTools.map(({ id, icon: Icon, label }) => (
                <button
                  key={`mobile-${id}`}
                  className={`mobile-tool-tile ${activeTool === id ? 'active' : ''}`}
                  onClick={() => {
                    if (id === 'image' || id === 'upload') {
                      setShowImageDrawer(true);
                    } else {
                      onSelectTool(id);
                    }
                    setIsMobileSheetOpen(false);
                  }}
                >
                  <div className="mobile-tool-tile-icon">
                    <Icon size={22} />
                  </div>
                  <span>{label}</span>
                </button>
              ))}

              {moreToolsGrid.map(({ id, icon: Icon, label, badgeColor }) => (
                <button
                  key={`mobile-${id}`}
                  className={`mobile-tool-tile ${activeTool === id ? 'active' : ''}`}
                  onClick={() => {
                    onSelectTool(id);
                    setIsMobileSheetOpen(false);
                  }}
                >
                  <div className="mobile-tool-tile-icon" style={{ background: badgeColor, color: '#ffffff' }}>
                    <Icon size={20} />
                  </div>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  </>
  );
};
