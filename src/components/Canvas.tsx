import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { UnsortedDrawer } from './UnsortedDrawer';
import { invoke } from '@tauri-apps/api/core';
import { CommentCard } from './CommentCard';
import { TaskListCard } from './TaskListCard';
import { Element, ElementPositionUpdate, ToolType, TableSubTarget } from '../types';
import {
  FolderPlus,
  BookOpen,
  Brain,
  Palette,
  ChevronRight,
  Scale,
  History,
  Globe,
  HelpCircle,
  FileText,
  Share2,
  Layers,
  Film,
  Code,
  Volume2,
  Link as LinkIcon,
  Image as ImageIcon,
  User,
  CornerUpRight
} from 'lucide-react';

const isLightColor = (hex?: string): boolean => {
  if (!hex || hex === 'transparent' || !hex.startsWith('#')) return false;
  const c = hex.substring(1);
  const rgb = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma > 150;
};

const getRichLinkData = (url: string) => {
  const clean = url.trim();
  if (!clean) return null;

  // Check for YouTube video IDs
  const ytMatch = clean.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return {
      type: 'youtube',
      title: 'How the Nemesis System Creates Stories',
      domainUrl: `https://www.youtube.com/watch?v=${videoId}...`,
      imageUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      iconColor: '#ff0000',
      description: '',
    };
  }

  // Check for Steam App IDs or Store URLs
  const steamAppMatch = clean.match(/\/app\/(\d+)/i);
  if (steamAppMatch || clean.toLowerCase().includes('steampowered.com') || clean.toLowerCase().includes('brekekekex')) {
    const appId = steamAppMatch ? steamAppMatch[1] : '2358720';
    return {
      type: 'steam',
      title: 'BREKEKEKEX',
      domainUrl: clean.length > 32 ? clean.substring(0, 28) + '...' : clean,
      imageUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
      iconColor: '#1b2838',
      description: 'Hunt frogs, clash with cultists, and survive close-range arena combat in this short, skill-driven swamp adventure.',
    };
  }

  // General web article / link - Generate live real-time visual screen capture using thum.io!
  let hostname = 'https://www.web-link.org';
  let fullTargetUrl = clean;
  try {
    fullTargetUrl = clean.startsWith('http') ? clean : `https://${clean}`;
    const parsed = new URL(fullTargetUrl);
    hostname = parsed.hostname;
  } catch {
    hostname = clean;
    fullTargetUrl = `https://${clean}`;
  }

  return {
    type: 'web',
    title: hostname.replace(/^www\./, '').toUpperCase() + ' - Official Web Page',
    domainUrl: clean.length > 32 ? clean.substring(0, 28) + '...' : clean,
    imageUrl: `https://image.thum.io/get/width/800/crop/600/noanimate/${encodeURI(fullTargetUrl)}`,
    iconColor: '#4c9aff',
    description: `Access official resources, documentation, and live preview content directly from ${hostname}.`,
  };
};

const openExternalUrl = async (targetUrl: string) => {
  if (!targetUrl) return;
  const finalUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
  try {
    await invoke('open_external_url', { url: finalUrl });
  } catch (e) {
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  }
};

const RichLinkPreview: React.FC<{
  el: Element;
  onSetEditingElement?: (id: string | null) => void;
  onContentChange: (id: string, newContent: Record<string, any>) => void;
  isRenaming?: boolean;
  onFinishRenaming?: () => void;
}> = ({ el, onSetEditingElement, onContentChange, isRenaming = false, onFinishRenaming = () => {} }) => {
  const [imgError, setImgError] = useState(false);
  const url = el.content?.url || '';
  const fallbackData = useMemo(() => getRichLinkData(url), [url]);
  const previewData = el.content?.preview || fallbackData;
  const displayTitle = el.content?.custom_title || previewData?.title || 'Web Link';

  useEffect(() => {
    if (!url || el.content?.preview || fallbackData?.type === 'youtube') return;

    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(fullUrl)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.status === 'success' && data.data) {
          const resolved = {
            type: fallbackData?.type || 'web',
            title: data.data.title || fallbackData?.title || 'Official Web Page',
            domainUrl: fallbackData?.domainUrl || url,
            imageUrl: data.data.image?.url || data.data.logo?.url || fallbackData?.imageUrl,
            iconColor: fallbackData?.iconColor || '#4c9aff',
            description: data.data.description || fallbackData?.description || '',
          };
          onContentChange(el.id, { ...el.content, preview: resolved });
        }
      })
      .catch(() => {
        // Fallback heuristics retained on offline or network error
      });
  }, [url, el.id, el.content, fallbackData, onContentChange]);

  if (!previewData) return null;

  return (
    <div
      className="rich-link-card"
      onDoubleClick={(e) => {
        e.stopPropagation();
        onSetEditingElement?.(el.id);
      }}
      title="Double-click to edit link URL"
    >
      <div 
        className="rich-link-banner-wrap"
        style={{ cursor: 'pointer' }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          openExternalUrl(url);
        }}
        title={`Click to open ${url}`}
      >
        {!imgError && previewData.imageUrl ? (
          <img
            src={previewData.imageUrl}
            alt={previewData.title}
            onError={() => setImgError(true)}
          />
        ) : (
          <div style={{ width: '100%', height: '160px', background: 'linear-gradient(135deg, #2b2c30 0%, #1e1f22 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#73747d', fontSize: '13px' }}>
            <Globe size={32} opacity={0.4} />
          </div>
        )}
        {previewData.type === 'youtube' && (
          <div className="youtube-play-overlay">
            <div style={{ width: 0, height: 0, borderLeft: '14px solid #ffffff', borderTop: '8px solid transparent', borderBottom: '8px solid transparent', marginLeft: '3px' }} />
          </div>
        )}
      </div>
      <div className="rich-link-body">
        <div className="rich-link-domain-row">
          {previewData.type === 'youtube' ? (
            <div style={{ width: 16, height: 12, background: '#ff0000', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 800 }}>▶</div>
          ) : previewData.type === 'steam' ? (
            <div style={{ width: 16, height: 16, background: '#1b2838', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#66c0f4', fontSize: 11, fontWeight: 800 }}>🎮</div>
          ) : (
            <Globe size={14} color="#a5a5ad" />
          )}
          <span className="rich-link-domain-text">{previewData.domainUrl}</span>
        </div>
        {isRenaming ? (
          <div style={{ padding: '4px 0' }} onMouseDown={(e) => e.stopPropagation()}>
            <input
              type="text"
              className="link-rename-input"
              autoFocus
              value={el.content?.custom_title !== undefined ? el.content.custom_title : displayTitle}
              onChange={(e) => onContentChange(el.id, { ...el.content, custom_title: e.target.value })}
              onBlur={onFinishRenaming}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.currentTarget.blur();
                }
              }}
              placeholder="Enter link title..."
            />
          </div>
        ) : (
          <div 
            className="rich-link-title-orange"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openExternalUrl(url);
            }}
            title={`Click to open ${url}`}
          >
            {displayTitle}
          </div>
        )}
        {previewData.description && <div className="rich-link-snippet">{previewData.description}</div>}
      </div>
      {el.content?.show_caption && (
        <div className="link-caption-wrapper" onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            className="link-caption-input"
            value={el.content.caption || ''}
            onChange={(e) => onContentChange(el.id, { ...el.content, caption: e.target.value })}
            placeholder="Add a caption..."
          />
        </div>
      )}
    </div>
  );
};

const getColLetter = (index: number): string => {
  let label = '';
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode((i % 26) + 65) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
};

const getCellRange = (startIdx: number, endIdx: number, cols: number): number[] => {
  const startRow = Math.floor((startIdx - 1) / cols);
  const startCol = (startIdx - 1) % cols;
  const endRow = Math.floor((endIdx - 1) / cols);
  const endCol = (endIdx - 1) % cols;
  
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  
  const res: number[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      res.push(r * cols + c + 1);
    }
  }
  return res;
};

const evaluateFormula = (formula: string, cells: Record<number, any>, cols: number, rows: number): string => {
  if (!formula.startsWith('=')) return formula;
  const clean = formula.substring(1).trim().toUpperCase();
  if (!clean) return '=';

  const parseCellToken = (token: string): number[] => {
    const rangeMatch = token.trim().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (rangeMatch) {
      const colLetter1 = rangeMatch[1];
      const row1 = parseInt(rangeMatch[2], 10);
      const colLetter2 = rangeMatch[3];
      const row2 = parseInt(rangeMatch[4], 10);
      
      const letterToCol = (str: string) => str.split('').reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
      const c1 = letterToCol(colLetter1) - 1;
      const c2 = letterToCol(colLetter2) - 1;
      
      const minCol = Math.min(c1, c2);
      const maxCol = Math.max(c1, c2);
      const minRow = Math.min(row1, row2);
      const maxRow = Math.max(row1, row2);
      
      const vals: number[] = [];
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          if (r >= 1 && r <= rows && c >= 0 && c < cols) {
            const idx = (r - 1) * cols + c + 1;
            const v = parseFloat(cells[idx] || '');
            if (!isNaN(v)) vals.push(v);
          }
        }
      }
      return vals;
    }
    const singleMatch = token.trim().match(/^([A-Z]+)(\d+)$/);
    if (singleMatch) {
      const colLetter = singleMatch[1];
      const r = parseInt(singleMatch[2], 10);
      const c = colLetter.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      const idx = (r - 1) * cols + c + 1;
      const v = parseFloat(cells[idx] || '');
      return !isNaN(v) ? [v] : [];
    }
    const num = parseFloat(token);
    return !isNaN(num) ? [num] : [];
  };

  const getArgs = (inner: string): number[] => {
    const parts = inner.split(',');
    return parts.flatMap(parseCellToken);
  };

  try {
    if (clean.startsWith('SUM(') && clean.endsWith(')')) {
      const vals = getArgs(clean.slice(4, -1));
      return vals.reduce((a, b) => a + b, 0).toString();
    }
    if (clean.startsWith('AVERAGE(') && clean.endsWith(')')) {
      const vals = getArgs(clean.slice(8, -1));
      if (vals.length === 0) return '0';
      return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2).replace(/\.00$/, '');
    }
    if (clean.startsWith('MIN(') && clean.endsWith(')')) {
      const vals = getArgs(clean.slice(4, -1));
      return vals.length ? Math.min(...vals).toString() : '0';
    }
    if (clean.startsWith('MAX(') && clean.endsWith(')')) {
      const vals = getArgs(clean.slice(4, -1));
      return vals.length ? Math.max(...vals).toString() : '0';
    }
    if (clean.startsWith('COUNT(') && clean.endsWith(')')) {
      const vals = getArgs(clean.slice(6, -1));
      return vals.length.toString();
    }
  } catch (err) {
    return '#ERROR';
  }

  return formula;
};

export interface CanvasProps {
  elements: Element[];
  selectedElementId: string | null;
  selectedIds?: string[];
  selectedTableCells?: { tableId: string; cellIndices: number[] } | null;
  onSelectTableCells?: (val: { tableId: string; cellIndices: number[] } | null) => void;
  editingElementId?: string | null;
  renamingLinkId?: string | null;
  onSetRenamingLink?: (id: string | null) => void;
  onSelectElement: (id: string | null) => void;
  onMultiSelect?: (ids: string[]) => void;
  onSetEditingElement?: (id: string | null) => void;
  onUpdateElementPositions: (updates: ElementPositionUpdate[]) => void;
  onContentChange: (id: string, newContent: Record<string, any>) => void;
  onStyleChange?: (id: string, newStyle: Record<string, any>) => void;
  onContextMenu: (e: React.MouseEvent, element: Element | null, canvasPos?: { x: number; y: number }, tableSubTarget?: TableSubTarget) => void;
  onOpenBoard: (boardId: string, keepSelection?: boolean) => void;
  onMoveElementToBoard?: (elementId: string, targetBoardId: string, x?: number, y?: number, isFromBreadcrumb?: boolean, isEnterHover?: boolean) => void;
  onMoveToUnsorted?: (elementId: string) => void;
  onOpenUnsortedDrawer?: () => void;
  isUnsortedDrawerOpen?: boolean;
  unsortedElements?: Element[];
  onCloseUnsortedDrawer?: () => void;
  onMoveFromUnsortedToCanvas?: (el: Element, clientX: number, clientY: number) => void;
  onUnsortedReorder?: (sourceId: string, targetId: string) => void;
  onHoverBoard?: (boardId: string | null) => void;
  isPresentationMode?: boolean;
  onDropTool: (tool: ToolType, x: number, y: number, targetColumnId?: string, isUnsorted?: boolean, targetBoardId?: string) => void;
  onCreateTaskListFromItem?: (x: number, y: number, item: any, targetColumnId?: string) => void;
  onCreateQuickLine?: (sourceElementId: string) => Promise<string | undefined>;
  onDeleteElement?: (id: string) => void;
  onSetHoveringTrash?: (isHovering: boolean) => void;
  isHoveringTrash?: boolean;
  onDragChange?: (isDragging: boolean) => void;
  scale: number;
  onSetScale: (scale: number) => void;
  onViewportChange?: (viewport: { centerCanvasX: number; centerCanvasY: number }) => void;
}

const ICON_NAME_MAP: Record<string, any> = {
  FolderPlus, BookOpen, Brain, Palette, Globe, FileText, Share2, Layers, Film, Code, Volume2, Scale, History, HelpCircle, ImageIcon, User
};

function getBoardBadgeStyle(title: string = '', customIcon?: string) {
  const custom = customIcon && ICON_NAME_MAP[customIcon] ? ICON_NAME_MAP[customIcon] : null;
  const lower = title.toLowerCase();
  if (lower.includes('story')) return { Icon: custom || BookOpen, badgeBg: '#c27c3e', cards: '17 cards' };
  if (lower.includes('brain') || lower.includes('storm')) return { Icon: custom || Brain, badgeBg: '#4ca674', cards: '0 cards' };
  if (lower.includes('mood')) return { Icon: custom || Palette, badgeBg: '#52798e', cards: '0 cards' };
  if (lower.includes('core') || lower.includes('mech')) return { Icon: custom || ChevronRight, badgeBg: '#e65360', cards: '22 cards' };
  if (lower.includes('weapon') || lower.includes('arsenal')) return { Icon: custom || Scale, badgeBg: '#e85c88', cards: '1 card' };
  if (lower.includes('time') || lower.includes('travel') || lower.includes('history')) return { Icon: custom || History, badgeBg: '#df9a65', cards: '0 cards' };
  if (lower.includes('world') || lower.includes('globe') || lower.includes('map')) return { Icon: custom || Globe, badgeBg: '#5dcbb2', cards: '21 cards, 1 file' };
  if (lower.includes('concept') || lower.includes('level')) return { Icon: custom || HelpCircle, badgeBg: '#83d1c4', cards: '0 cards' };
  if (lower.includes('doc') || lower.includes('file') || lower.includes('document')) return { Icon: custom || FileText, badgeBg: '#6bc8b3', cards: '10 cards, 1 file' };
  if (lower.includes('relation') || lower.includes('share') || lower.includes('network')) return { Icon: custom || Share2, badgeBg: '#ff4c78', cards: '4 boards, 22 cards' };
  if (lower.includes('asset') || lower.includes('tech') || lower.includes('art')) return { Icon: custom || Layers, badgeBg: '#769fb6', cards: '0 cards' };
  if (lower.includes('anim') || lower.includes('vfx') || lower.includes('gif')) return { Icon: custom || Film, badgeBg: '#ffd185', cards: '0 cards' };
  if (lower.includes('cine') || lower.includes('script') || lower.includes('cutscene')) return { Icon: custom || Code, badgeBg: '#74bfc8', cards: '0 cards' };
  if (lower.includes('sound') || lower.includes('audio') || lower.includes('music')) return { Icon: custom || Volume2, badgeBg: '#f37272', cards: '0 cards' };
  
  return { Icon: custom || null, badgeBg: '#c5c8cf', cards: '0 cards' };
}

const InlineCommentBubble: React.FC<{
  targetEl: Element;
  activeInlineComment: { elementId: string; commentId: string; rect: { top: number; left: number } };
  onClose: () => void;
  onContentChange: (id: string, newContent: Record<string, any>) => void;
}> = ({ targetEl, activeInlineComment, onClose, onContentChange }) => {
  const [draft, setDraft] = useState('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const messages: Array<{ id: string; author: string; text: string; time?: string; edited?: boolean }> =
    (targetEl.content?.inline_comments && targetEl.content.inline_comments[activeInlineComment.commentId]) || [];

  const showInputBox = messages.length === 0 || isReplying;

  const handleSend = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!draft.trim()) return;
    const newMsg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      author: 'A',
      text: draft.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    const updatedComments = {
      ...(targetEl.content?.inline_comments || {}),
      [activeInlineComment.commentId]: [...messages, newMsg]
    };
    onContentChange(targetEl.id, { ...targetEl.content, inline_comments: updatedComments });
    setDraft('');
    setIsReplying(false);
  };

  const handleSaveEdit = (msgId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!editText.trim()) return;
    const nextMessages = messages.map((msg) =>
      msg.id === msgId ? { ...msg, text: editText.trim(), edited: true } : msg
    );
    const updatedComments = {
      ...(targetEl.content?.inline_comments || {}),
      [activeInlineComment.commentId]: nextMessages
    };
    onContentChange(targetEl.id, { ...targetEl.content, inline_comments: updatedComments });
    setEditingMsgId(null);
    setEditText('');
  };

  return (
    <div
      className="milanote-inline-comment-bubble"
      style={{
        position: 'fixed',
        top: `${Math.min(window.innerHeight - 320, activeInlineComment.rect.top)}px`,
        left: `${Math.max(10, Math.min(window.innerWidth - 340, activeInlineComment.rect.left))}px`,
        zIndex: 1000000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="comment-bubble-caret" />
      {messages.length > 0 && (
        <div className="comment-messages-list" style={{ maxHeight: '220px', overflowY: 'auto' }}>
          {messages.map((msg) => (
            <div key={msg.id} className="comment-message-item">
              <div className="comment-avatar-circle" style={{ width: 28, height: 28, fontSize: 13 }}>
                {msg.author || 'A'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexGrow: 1 }}>
                {editingMsgId === msg.id ? (
                  <div className="comment-edit-row">
                    <input
                      type="text"
                      className="comment-edit-field"
                      value={editText}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSaveEdit(msg.id);
                        } else if (e.key === 'Escape') {
                          setEditingMsgId(null);
                        }
                      }}
                      autoFocus
                    />
                    <button
                      className="comment-action-btn-primary"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => handleSaveEdit(msg.id, e)}
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      className="comment-action-btn"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingMsgId(null);
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="comment-message-bubble">
                      {msg.text}
                    </div>
                    <div className="comment-actions-bar">
                      <span
                        className="comment-action-link"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingMsgId(msg.id);
                          setEditText(msg.text || '');
                        }}
                        title="Edit comment"
                      >
                        Edit
                      </span>
                      <span className="comment-action-divider">•</span>
                      <span
                        className="comment-action-link"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsReplying(true);
                          setTimeout(() => {
                            if (inputRef.current) inputRef.current.focus();
                          }, 50);
                        }}
                        title="Reply to comment thread"
                      >
                        Reply
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {showInputBox && (
        <div className="comment-input-row">
          <div className="comment-avatar-circle">A</div>
          <div className="comment-input-box-container">
            <input
              ref={inputRef}
              type="text"
              className="comment-input-field"
              placeholder="Write a comment..."
              value={draft}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                } else if (e.key === 'Escape') {
                  if (messages.length > 0) setIsReplying(false);
                  else onClose();
                }
              }}
              autoFocus
            />
            <button
              className="comment-send-btn"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleSend}
              type="button"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const Canvas: React.FC<CanvasProps> = ({
  elements,
  selectedElementId,
  selectedIds = [],
  selectedTableCells = null,
  onSelectTableCells = () => {},
  editingElementId = null,
  renamingLinkId = null,
  onSetRenamingLink = () => {},
  onSelectElement,
  onMultiSelect,
  onSetEditingElement = () => {},
  onUpdateElementPositions,
  onContentChange,
  onStyleChange = () => {},
  onContextMenu,
  onOpenBoard,
  onMoveElementToBoard,
  onMoveToUnsorted,
  onOpenUnsortedDrawer,
  isUnsortedDrawerOpen = false,
  unsortedElements = [],
  onCloseUnsortedDrawer = () => {},
  onMoveFromUnsortedToCanvas = () => {},
  onUnsortedReorder = () => {},
  onHoverBoard,
  isPresentationMode = false,
  onDropTool,
  onCreateTaskListFromItem = () => {},
  onCreateQuickLine,
  onDeleteElement = () => {},
  onSetHoveringTrash = () => {},
  isHoveringTrash = false,
  onDragChange,
  scale,
  onSetScale,
  onViewportChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 });
  const scrollbarDragRef = useRef<{
    axis: 'h' | 'v';
    startMouse: number;
    startPan: number;
    availableTrack: number;
    maxPanTravel: number;
  } | null>(null);
  const scrollbarRafRef = useRef<number | null>(null);
  const pendingScrollbarPanRef = useRef<{ x?: number; y?: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerCanvasX = -pan.x / scale + (rect.width / 2) / scale;
    const centerCanvasY = -pan.y / scale + (rect.height / 2) / scale;
    onViewportChange?.({ centerCanvasX, centerCanvasY });
  }, [pan.x, pan.y, scale, onViewportChange]);
  const dragRafRef = useRef<number | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [dragOverTaskListId, setDragOverTaskListId] = useState<string | null>(null);
  const [isHoveringUnsorted, setIsHoveringUnsorted] = useState(false);
  const hoverUnsortedRef = useRef<number | null>(null);
  const [dropInsertIndex, setDropInsertIndexState] = useState<number | null>(null);
  const dropInsertIndexRef = useRef<number | null>(null);
  const setDropInsertIndex = useCallback((idx: number | null) => {
    dropInsertIndexRef.current = idx;
    setDropInsertIndexState(idx);
  }, []);

  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const selectionRef = useRef<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  const dragRef = useRef<{
    elementId: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    isResize?: boolean;
    resizeDirection?: 'se' | 'e';
    isFromColumn?: boolean;
    origColumnId?: string | null;
    hasExceededThreshold?: boolean;
    targetDx: number;
    targetDy: number;
    currentDx: number;
    currentDy: number;
    clientX: number;
    clientY: number;
    dragGroup: Array<{ id: string; origX: number; origY: number; currentX?: number; currentY?: number; origWidth: number; origHeight: number; zIndex: number; isColumn?: boolean; isFromColumn?: boolean; elementType?: string; isVideoLink?: boolean }>;
  } | null>(null);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const lineHandleDragRef = useRef<{
    lineId: string;
    handle: 'start' | 'end' | 'middle' | 'move';
    origStartX?: number;
    origStartY?: number;
    origEndX?: number;
    origEndY?: number;
    startMouseX?: number;
    startMouseY?: number;
    origContent?: Record<string, any>;
    connectedItems?: Array<{ id: string; origX: number; origY: number; width: number; height: number; zIndex: number }>;
  } | null>(null);
  const [activeLineHandleDrag, setActiveLineHandleDrag] = useState<string | null>(null);
  const [activeInlineComment, setActiveInlineComment] = useState<{ elementId: string; commentId: string; rect: { top: number; left: number } } | null>(null);
  const [hoveredBoardId, setHoveredBoardId] = useState<string | null>(null);
  const hoveredBoardIdRef = useRef<string | null>(null);
  useEffect(() => { onHoverBoard?.(hoveredBoardId); }, [hoveredBoardId, onHoverBoard]);
  const hoverEnterBoardRef = useRef<{ boardId: string; timer: any } | null>(null);
  const [lineDragPreview, setLineDragPreviewState] = useState<{ lineId: string; content: Record<string, any> } | null>(null);
  const lineDragPreviewRef = useRef<{ lineId: string; content: Record<string, any> } | null>(null);
  const setLineDragPreview = useCallback((val: { lineId: string; content: Record<string, any> } | null) => {
    lineDragPreviewRef.current = val;
    setLineDragPreviewState(val);
  }, []);

  const [dragTick, setDragTick] = useState(0);
  const [hoveredLineTarget, setHoveredLineTarget] = useState<{ elementId: string; box: { x: number; y: number; width: number; height: number }; isBoard?: boolean } | null>(null);
  const hoveredElementIdRef = useRef<string | null>(null);
  const lineSnapModeRef = useRef<'center' | 'advanced'>('center');
  const [lineSnapMode, setLineSnapMode] = useState<'center' | 'advanced'>('center');
  const hoverTimerRef = useRef<number | null>(null);
  const lastHoverPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastHoverBoxRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [editingLineLabelId, setEditingLineLabelId] = useState<string | null>(null);
  const [selectedTableCell, setSelectedTableCell] = useState<{ tableId: string; cellIndex: number } | null>(null);
  const [editingTableCell, setEditingTableCell] = useState<{ tableId: string; cellIndex: number } | null>(null);
  const [tableCellDragStart, setTableCellDragStart] = useState<{ tableId: string; startIndex: number } | null>(null);
  const [headerResize, setHeaderResize] = useState<{
    type: 'col' | 'row';
    tableId: string;
    index: number;
    startX: number;
    startY: number;
    startValue: number;
  } | null>(null);
  const headerResizeRef = useRef<{
    type: 'col' | 'row';
    tableId: string;
    index: number;
    startX: number;
    startY: number;
    startValue: number;
  } | null>(null);
  const dragOccurredRef = useRef(false);

  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (screenX - rect.left - pan.x) / scale;
    const y = (screenY - rect.top - pan.y) / scale;
    return { x, y };
  }, [pan.x, pan.y, scale]);

  const canvasToScreen = useCallback((canvasX: number, canvasY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = canvasX * scale + pan.x + rect.left;
    const y = canvasY * scale + pan.y + rect.top;
    return { x, y };
  }, [pan.x, pan.y, scale]);

  const getPanLimits = useCallback((vpWidth: number, vpHeight: number, currentScale: number) => {
    const vpCanvasW = vpWidth / currentScale;
    const vpCanvasH = vpHeight / currentScale;

    const activeEls = elements.filter(el => !el.style?.is_unsorted && !el.style?.parent_column_id);
    let minElX = Infinity, maxElX = -Infinity, minElY = Infinity, maxElY = -Infinity;
    if (activeEls.length > 0) {
      activeEls.forEach(el => {
        const w = el.width || (el.element_type === 'nested_board' ? 80 : 340);
        const h = el.height || (el.element_type === 'nested_board' ? 100 : 60);
        if (el.x < minElX) minElX = el.x;
        if (el.x + w > maxElX) maxElX = el.x + w;
        if (el.y < minElY) minElY = el.y;
        if (el.y + h > maxElY) maxElY = el.y + h;
      });
    }

    const HEADROOM = 400;

    // Anchor canonical origin (0, 0); only expand into negative space if elements are placed there
    const minX = Math.min(0, minElX < Infinity ? minElX - 100 : 0);
    const minY = Math.min(0, minElY < Infinity ? minElY - 100 : 0);

    // Canvas extents are at least the viewport canvas size, expanding outward as elements extend
    const maxX = Math.max(
      vpCanvasW,
      (maxElX > -Infinity ? maxElX : 0) + HEADROOM
    );
    const maxY = Math.max(
      vpCanvasH,
      (maxElY > -Infinity ? maxElY : 0) + HEADROOM
    );

    const maxPanX = -minX * currentScale;
    const minPanX = vpWidth - maxX * currentScale;
    const maxPanY = -minY * currentScale;
    const minPanY = vpHeight - maxY * currentScale;

    return {
      bounds: { minX, maxX, minY, maxY },
      panLimits: {
        minPanX: Math.min(minPanX, maxPanX),
        maxPanX: Math.max(minPanX, maxPanX),
        minPanY: Math.min(minPanY, maxPanY),
        maxPanY: Math.max(minPanY, maxPanY),
      }
    };
  }, [elements]);

  const clampPan = useCallback((x: number, y: number, currentScale = scale) => {
    if (!containerRef.current) return { x, y };
    const rect = containerRef.current.getBoundingClientRect();
    const { panLimits } = getPanLimits(rect.width, rect.height, currentScale);
    const clampedX = Math.min(Math.max(x, panLimits.minPanX), panLimits.maxPanX);
    const clampedY = Math.min(Math.max(y, panLimits.minPanY), panLimits.maxPanY);
    return { x: clampedX, y: clampedY };
  }, [getPanLimits, scale]);

  const scrollbarMetrics = useMemo(() => {
    if (!containerRef.current) {
      return {
        showH: false,
        showV: false,
        thumbLeftPct: 0,
        thumbWidthPct: 100,
        thumbTopPct: 0,
        thumbHeightPct: 100,
      };
    }
    const rect = containerRef.current.getBoundingClientRect();
    const { bounds } = getPanLimits(rect.width, rect.height, scale);
    
    const vpW = rect.width / scale;
    const vpH = rect.height / scale;
    const totalContentW = Math.max(bounds.maxX - bounds.minX, vpW);
    const totalContentH = Math.max(bounds.maxY - bounds.minY, vpH);
    const maxScrollX = totalContentW - vpW;
    const maxScrollY = totalContentH - vpH;

    const currentLeft = -pan.x / scale;
    const currentTop = -pan.y / scale;

    const progressX = maxScrollX > 1 
      ? Math.max(0, Math.min(1, (currentLeft - bounds.minX) / maxScrollX))
      : 0;
    const progressY = maxScrollY > 1
      ? Math.max(0, Math.min(1, (currentTop - bounds.minY) / maxScrollY))
      : 0;

    const thumbRatioX = Math.max(0.05, Math.min(1, vpW / totalContentW));
    const thumbRatioY = Math.max(0.05, Math.min(1, vpH / totalContentH));

    const thumbWidthPct = thumbRatioX * 100;
    const thumbLeftPct = progressX * (1 - thumbRatioX) * 100;

    const thumbHeightPct = thumbRatioY * 100;
    const thumbTopPct = progressY * (1 - thumbRatioY) * 100;

    return {
      showH: maxScrollX > 20,
      showV: maxScrollY > 20,
      thumbLeftPct,
      thumbWidthPct,
      thumbTopPct,
      thumbHeightPct,
    };
  }, [getPanLimits, pan.x, pan.y, scale]);

  const handleScrollbarMouseDown = useCallback((axis: 'h' | 'v', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { bounds, panLimits } = getPanLimits(rect.width, rect.height, scale);

    if (axis === 'h') {
      const trackLength = rect.width - 6;
      const totalContentW = Math.max(bounds.maxX - bounds.minX, rect.width / scale);
      const thumbRatioX = Math.max(0.05, Math.min(1, (rect.width / scale) / totalContentW));
      const thumbLength = Math.max(thumbRatioX * trackLength, 20);
      const availableTrack = Math.max(trackLength - thumbLength, 1);
      const maxPanTravel = panLimits.maxPanX - panLimits.minPanX;

      const isThumb = (e.target as HTMLElement).classList.contains('canvas-scrollbar-thumb');
      let startPan = pan.x;
      if (!isThumb) {
        const trackRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const clickOffset = e.clientX - trackRect.left - thumbLength / 2;
        const targetProgress = Math.max(0, Math.min(1, clickOffset / availableTrack));
        startPan = clampPan(panLimits.maxPanX - targetProgress * maxPanTravel, pan.y).x;
        setPan((prev) => ({ ...prev, x: startPan }));
      }

      scrollbarDragRef.current = {
        axis: 'h',
        startMouse: e.clientX,
        startPan,
        availableTrack,
        maxPanTravel,
      };
    } else {
      const trackLength = rect.height - 6;
      const totalContentH = Math.max(bounds.maxY - bounds.minY, rect.height / scale);
      const thumbRatioY = Math.max(0.05, Math.min(1, (rect.height / scale) / totalContentH));
      const thumbLength = Math.max(thumbRatioY * trackLength, 20);
      const availableTrack = Math.max(trackLength - thumbLength, 1);
      const maxPanTravel = panLimits.maxPanY - panLimits.minPanY;

      const isThumb = (e.target as HTMLElement).classList.contains('canvas-scrollbar-thumb');
      let startPan = pan.y;
      if (!isThumb) {
        const trackRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const clickOffset = e.clientY - trackRect.top - thumbLength / 2;
        const targetProgress = Math.max(0, Math.min(1, clickOffset / availableTrack));
        startPan = clampPan(pan.x, panLimits.maxPanY - targetProgress * maxPanTravel).y;
        setPan((prev) => ({ ...prev, y: startPan }));
      }

      scrollbarDragRef.current = {
        axis: 'v',
        startMouse: e.clientY,
        startPan,
        availableTrack,
        maxPanTravel,
      };
    }
  }, [getPanLimits, pan.x, pan.y, scale, clampPan]);

  const computeLineEndpoint = useCallback((lineEl: Element, content: Record<string, any>, isStart: boolean) => {
    const targetId = isStart ? content.start_target_id : content.end_target_id;
    if (targetId) {
      let box = { x: 0, y: 0, width: 340, height: 200 };
      const targetDom = document.getElementById(`milanote-el-${targetId}`);
      const stateEl = elements.find(x => x.id === targetId);
      if (targetDom) {
        const isBoard = stateEl?.element_type === 'nested_board';
        const iconDom = isBoard ? targetDom.querySelector('.board-icon-badge, .column-board-icon-box') : null;
        const r = (iconDom || targetDom).getBoundingClientRect();
        const tl = screenToCanvas(r.left, r.top);
        const br = screenToCanvas(r.right, r.bottom);
        box = { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
      } else if (stateEl) {
        box = { x: stateEl.x, y: stateEl.y, width: stateEl.width || 340, height: stateEl.height || 200 };
        if (stateEl.element_type === 'nested_board') {
          box = { x: stateEl.x + (box.width - 64) / 2, y: stateEl.y, width: 64, height: 64 };
        }
      }

      const anchor = (isStart ? content.start_anchor : content.end_anchor) || 'center';
      if (anchor === 'top') return { x: box.x + box.width / 2, y: box.y, box, anchor, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
      if (anchor === 'bottom') return { x: box.x + box.width / 2, y: box.y + box.height, box, anchor, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
      if (anchor === 'left') return { x: box.x, y: box.y + box.height / 2, box, anchor, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
      if (anchor === 'right') return { x: box.x + box.width, y: box.y + box.height / 2, box, anchor, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
      if (anchor === 'custom') {
        const rx = (isStart ? content.start_rel_x : content.end_rel_x) ?? 0.5;
        const ry = (isStart ? content.start_rel_y : content.end_rel_y) ?? 0.5;
        return { x: box.x + rx * box.width, y: box.y + ry * box.height, box, anchor, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
      }
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, box, anchor: 'center', cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
    }
    const fx = lineEl.x + (isStart ? (content.start_x ?? 0) : (content.end_x ?? 200));
    const fy = lineEl.y + (isStart ? (content.start_y ?? 200) : (content.end_y ?? 0));
    return { x: fx, y: fy, box: null, anchor: 'none', cx: fx, cy: fy };
  }, [screenToCanvas, elements, dragTick]);

  const getBoxPerimeterPoint = useCallback((center: { x: number; y: number }, dirFrom: { x: number; y: number }, box: { width: number; height: number }) => {
    let dx = dirFrom.x - center.x;
    let dy = dirFrom.y - center.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return center;
    const hw = (box.width || 340) / 2;
    const hh = (box.height || 200) / 2;
    const scaleX = Math.abs(dx) > 0.0001 ? hw / Math.abs(dx) : Infinity;
    const scaleY = Math.abs(dy) > 0.0001 ? hh / Math.abs(dy) : Infinity;
    const scale = Math.min(scaleX, scaleY);
    return { x: center.x + dx * scale, y: center.y + dy * scale };
  }, []);

  const computeBezierCurve = useCallback((s: any, e: any, content: Record<string, any>) => {
    const p0 = { x: s.anchor === 'center' && s.cx !== undefined ? s.cx : s.x, y: s.anchor === 'center' && s.cy !== undefined ? s.cy : s.y };
    const p2 = { x: e.anchor === 'center' && e.cx !== undefined ? e.cx : e.x, y: e.anchor === 'center' && e.cy !== undefined ? e.cy : e.y };
    const pMid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
    const p1 = { x: pMid.x + (content.control_offset_x || 0), y: pMid.y + (content.control_offset_y || 0) };
    const vertex = { x: pMid.x + 0.5 * (content.control_offset_x || 0), y: pMid.y + 0.5 * (content.control_offset_y || 0) };

    const evalBez = (t: number) => ({
      x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
      y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
    });

    const subCurve = (ta: number, tb: number) => {
      const q0a = { x: (1 - ta) * p0.x + ta * p1.x, y: (1 - ta) * p0.y + ta * p1.y };
      const q1a = { x: (1 - ta) * p1.x + ta * p2.x, y: (1 - ta) * p1.y + ta * p2.y };
      const q0b = { x: (1 - tb) * p0.x + tb * p1.x, y: (1 - tb) * p0.y + tb * p1.y };
      const q1b = { x: (1 - tb) * p1.x + tb * p2.x, y: (1 - tb) * p1.y + tb * p2.y };
      const cP0 = { x: (1 - ta) * q0a.x + ta * q1a.x, y: (1 - ta) * q0a.y + ta * q1a.y };
      const cP2 = { x: (1 - tb) * q0b.x + tb * q1b.x, y: (1 - tb) * q0b.y + tb * q1b.y };
      const cP1 = { x: (1 - tb) * q0a.x + tb * q1a.x, y: (1 - tb) * q0a.y + tb * q1a.y };
      return { p0: cP0, p1: cP1, p2: cP2 };
    };

    let tStart = 0;
    if (s.anchor === 'center' && s.box && s.cx !== undefined && s.cy !== undefined) {
      const hw = s.box.width / 2;
      const hh = s.box.height / 2;
      let l = 0, r = 0.5;
      for (let i = 0; i < 12; i++) {
        const m = (l + r) / 2;
        const pt = evalBez(m);
        if (Math.abs(pt.x - s.cx) <= hw && Math.abs(pt.y - s.cy) <= hh) l = m;
        else r = m;
      }
      tStart = (l + r) / 2;
    }

    let tEnd = 1.0;
    if (e.anchor === 'center' && e.box && e.cx !== undefined && e.cy !== undefined) {
      const hw = e.box.width / 2;
      const hh = e.box.height / 2;
      let l = 0.5, r = 1.0;
      for (let i = 0; i < 12; i++) {
        const m = (l + r) / 2;
        const pt = evalBez(m);
        if (Math.abs(pt.x - e.cx) <= hw && Math.abs(pt.y - e.cy) <= hh) r = m;
        else l = m;
      }
      tEnd = (l + r) / 2;
    }

    const main = subCurve(tStart, tEnd);
    const startSegment = tStart > 0.001 ? subCurve(0, tStart) : null;
    const endSegment = tEnd < 0.999 ? subCurve(tEnd, 1.0) : null;

    return { main, startSegment, endSegment, vertex, p0, p2 };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = -e.deltaY * 0.0015;
      const newScale = Math.min(Math.max(scale + zoomFactor, 0.25), 3.0);

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const scaleRatio = newScale / scale;
        const newPanX = mouseX - (mouseX - pan.x) * scaleRatio;
        const newPanY = mouseY - (mouseY - pan.y) * scaleRatio;

        onSetScale(newScale);
        setPan(clampPan(newPanX, newPanY, newScale));
      }
    } else {
      e.preventDefault();
      setPan((prev) => clampPan(prev.x - e.deltaX, prev.y - e.deltaY));
    }
  }, [scale, pan.x, pan.y, onSetScale, clampPan]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeInlineComment) setActiveInlineComment(null);
    const target = e.target as HTMLElement;
    if (target === containerRef.current || target.classList.contains('canvas-viewport') || target.classList.contains('canvas-plane') || target.classList.contains('canvas-viewport-grid')) {
      if (e.button === 1 || e.buttons === 4 || ((e.ctrlKey || e.metaKey) && e.button === 0)) {
        e.preventDefault();
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY, startPanX: pan.x, startPanY: pan.y };
        onSelectElement(null);
        onSetEditingElement(null);
        return;
      }

      if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onSelectElement(null);
        onSetEditingElement(null);
        if (onMultiSelect) onMultiSelect([]);

        const pos = screenToCanvas(e.clientX, e.clientY);
        const newBox = { startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y };
        setSelectionBox(newBox);
        selectionRef.current = newBox;
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === containerRef.current || target.classList.contains('canvas-viewport') || target.classList.contains('canvas-plane') || target.classList.contains('canvas-viewport-grid')) {
      e.preventDefault();
      const pos = screenToCanvas(e.clientX, e.clientY);
      onDropTool('note', Math.round(pos.x - 20), Math.round(pos.y - 20));
    }
  };

  const columns = useMemo(() => elements.filter((el) => el.element_type === 'column' && !el.style?.parent_column_id), [elements]);
  const rootElements = useMemo(() => elements.filter((el) => el.element_type !== 'column' && el.element_type !== 'line' && (!el.style?.parent_column_id || (el.element_type === 'comment' && Boolean(el.content?.is_pinned)))), [elements]);
  const lineElements = useMemo(() => elements.filter((el) => el.element_type === 'line'), [elements]);
  const getColumnChildren = useCallback((columnId: string) => {
    const children = elements.filter((el) => el.style?.parent_column_id === columnId && el.element_type !== 'line' && !(el.element_type === 'comment' && Boolean(el.content?.is_pinned)));
    return children.sort((a, b) => {
      const orderA = a.style?.column_order !== undefined ? a.style.column_order : 9999;
      const orderB = b.style?.column_order !== undefined ? b.style.column_order : 9999;
      return orderA - orderB;
    });
  }, [elements]);

  const checkDragTargets = useCallback((clientX: number, clientY: number, elementId: string, dragGroup: any[]) => {
    if (clientX <= 75 && clientY >= window.innerHeight - 80) {
      onSetHoveringTrash(true);
    } else {
      onSetHoveringTrash(false);
    }

    let foundColId: string | null = null;
    columns.forEach((col) => {
      if (col.id === elementId) return;
      const colDiv = document.getElementById(`milanote-el-${col.id}`);
      if (colDiv) {
        const rect = colDiv.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          foundColId = col.id;
        }
      }
    });
    if (foundColId) {
      const colChildren = getColumnChildren(foundColId).filter(c => !dragGroup.some(g => g.id === c.id));
      let targetIdx = colChildren.length;
      for (let i = 0; i < colChildren.length; i++) {
        const childDiv = document.getElementById(`milanote-el-${colChildren[i].id}`);
        if (childDiv) {
          const rect = childDiv.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (clientY < midY) {
            targetIdx = i;
            break;
          }
        }
      }
      setDropInsertIndex(targetIdx);
    } else {
      setDropInsertIndex(null);
    }
    setDragOverColumnId(foundColId);

    let foundTaskListId: string | null = null;
    const draggedEl = elements.find((x) => x.id === elementId);
    if (draggedEl && draggedEl.element_type === 'task_list') {
      elements.forEach((other) => {
        if (other.id === elementId || other.element_type !== 'task_list') return;
        const tDiv = document.getElementById(`milanote-el-${other.id}`);
        if (tDiv) {
          const rect = tDiv.getBoundingClientRect();
          if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            foundTaskListId = other.id;
          }
        }
      });
    }
    setDragOverTaskListId(foundTaskListId);

    const unsortedBtn = document.querySelector('.unsorted-pill-btn');
    const drawerEl = document.querySelector('.unsorted-drawer');
    let overUnsorted = false;
    if (unsortedBtn) {
      const uRect = unsortedBtn.getBoundingClientRect();
      if (clientX >= uRect.left && clientX <= uRect.right && clientY >= uRect.top && clientY <= uRect.bottom) {
        overUnsorted = true;
      }
    }
    if (drawerEl) {
      const dRect = drawerEl.getBoundingClientRect();
      if (clientX >= dRect.left && clientX <= dRect.right && clientY >= dRect.top && clientY <= dRect.bottom) {
        overUnsorted = true;
      }
    }
    if (overUnsorted && !isHoveringUnsorted) {
      setIsHoveringUnsorted(true);
      if (!hoverUnsortedRef.current && onOpenUnsortedDrawer) {
        hoverUnsortedRef.current = window.setTimeout(() => {
          onOpenUnsortedDrawer();
          hoverUnsortedRef.current = null;
          setIsHoveringUnsorted(false);
        }, 500);
      }
    } else if (!overUnsorted && isHoveringUnsorted) {
      setIsHoveringUnsorted(false);
      if (hoverUnsortedRef.current) {
        clearTimeout(hoverUnsortedRef.current);
        hoverUnsortedRef.current = null;
      }
    }

    let foundBoardId: string | null = null;
    elements.forEach((other) => {
      if (other.id === elementId || other.element_type !== 'nested_board') return;
      const bDiv = document.getElementById(`milanote-el-${other.id}`);
      if (bDiv) {
        const rect = bDiv.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          foundBoardId = other.content?.target_board_id || other.id;
        }
      }
    });
    if (!foundBoardId) {
      const breadcrumbs = document.querySelectorAll('[data-board-id]:not(.active)');
      breadcrumbs.forEach((bEl) => {
        const rect = bEl.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          const bId = bEl.getAttribute('data-board-id');
          if (bId && bId !== elementId) {
            foundBoardId = bId;
          }
        }
      });
    }
    if (hoveredBoardIdRef.current !== foundBoardId) {
      hoveredBoardIdRef.current = foundBoardId;
      setHoveredBoardId(foundBoardId);
    }
    if (foundBoardId) {
      if (hoverEnterBoardRef.current?.boardId !== foundBoardId) {
        if (hoverEnterBoardRef.current?.timer) clearTimeout(hoverEnterBoardRef.current.timer);
        const targetId = foundBoardId;
        const t = setTimeout(() => {
          if (onMoveElementToBoard && dragRef.current) {
            const curPos = screenToCanvas(clientX, clientY);
            const targetX = Math.round(curPos.x - (dragRef.current.offsetX || 0));
            const targetY = Math.round(curPos.y - (dragRef.current.offsetY || 0));
            dragRef.current.startX = clientX;
            dragRef.current.startY = clientY;
            dragRef.current.dragGroup = dragRef.current.dragGroup.map(g => ({
              ...g,
              origX: targetX,
              origY: targetY
            }));
            const isBreadcrumb = !document.querySelector(`#milanote-el-${targetId}`);
            onMoveElementToBoard(elementId, targetId, targetX, targetY, isBreadcrumb, true);
          }
          onOpenBoard(targetId, true);
          hoveredBoardIdRef.current = null;
          setHoveredBoardId(null);
          hoverEnterBoardRef.current = null;
        }, 1400);
        hoverEnterBoardRef.current = { boardId: targetId, timer: t };
      }
    } else if (hoverEnterBoardRef.current) {
      if (hoverEnterBoardRef.current.timer) clearTimeout(hoverEnterBoardRef.current.timer);
      hoverEnterBoardRef.current = null;
    }
  }, [columns, getColumnChildren, elements, isHoveringUnsorted, onOpenUnsortedDrawer, onMoveElementToBoard, onOpenBoard, onSetHoveringTrash, screenToCanvas, setDropInsertIndex]);

  const startDragRafLoop = useCallback(() => {
    if (dragRafRef.current !== null) return;

    const tick = () => {
      const drag = dragRef.current;
      if (!drag || drag.isResize || !drag.hasExceededThreshold) {
        dragRafRef.current = null;
        return;
      }

      // Smooth trailing interpolation with an ever-so-slight physical lag wrt cursor (0.32 lerp factor)
      const LERP_FACTOR = 0.32;
      drag.currentDx += (drag.targetDx - drag.currentDx) * LERP_FACTOR;
      drag.currentDy += (drag.targetDy - drag.currentDy) * LERP_FACTOR;

      if (Math.abs(drag.targetDx - drag.currentDx) < 0.1) drag.currentDx = drag.targetDx;
      if (Math.abs(drag.targetDy - drag.currentDy) < 0.1) drag.currentDy = drag.targetDy;

      drag.dragGroup.forEach((item) => {
        const elDiv = document.getElementById(`milanote-el-${item.id}`);
        if (elDiv) {
          if (drag.isFromColumn && item.id === drag.elementId) {
            elDiv.style.position = 'fixed';
            elDiv.style.left = `${drag.clientX - drag.offsetX}px`;
            elDiv.style.top = `${drag.clientY - drag.offsetY}px`;
            elDiv.style.zIndex = '999999';
            elDiv.style.transform = 'none';
            if (elDiv.classList.contains('column-board-row')) {
              elDiv.style.width = '240px';
            } else if (item.elementType === 'image') {
              elDiv.style.width = `${item.origWidth || 340}px`;
              elDiv.style.height = `${item.origHeight || 220}px`;
            }
          } else {
            const newX = Math.round(item.origX + drag.currentDx);
            const newY = Math.round(item.origY + drag.currentDy);
            item.currentX = newX;
            item.currentY = newY;
            elDiv.style.transform = `translate(${newX}px, ${newY}px)`;
            elDiv.style.left = '0px';
            elDiv.style.top = '0px';
            const portalDiv = document.getElementById(`milanote-drag-portal-${item.id}`);
            if (portalDiv) {
              const scr = canvasToScreen(newX, newY);
              portalDiv.style.left = `${scr.x}px`;
              portalDiv.style.top = `${scr.y}px`;
              portalDiv.style.transform = `scale(${scale})`;
            }
          }
        }
      });

      checkDragTargets(drag.clientX, drag.clientY, drag.elementId, drag.dragGroup);

      const stillInterpolating = Math.abs(drag.targetDx - drag.currentDx) >= 0.1 || Math.abs(drag.targetDy - drag.currentDy) >= 0.1;
      if (dragRef.current || stillInterpolating) {
        dragRafRef.current = requestAnimationFrame(tick);
      } else {
        dragRafRef.current = null;
      }
    };

    dragRafRef.current = requestAnimationFrame(tick);
  }, [canvasToScreen, checkDragTargets, scale]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (e.buttons === 0 && (selectionRef.current || dragRef.current || lineHandleDragRef.current || headerResizeRef.current || isPanning || scrollbarDragRef.current)) {
      if (scrollbarDragRef.current) {
        scrollbarDragRef.current = null;
        if (scrollbarRafRef.current !== null) {
          cancelAnimationFrame(scrollbarRafRef.current);
          scrollbarRafRef.current = null;
        }
        pendingScrollbarPanRef.current = null;
      }
      if (selectionRef.current) {
        selectionRef.current = null;
        setSelectionBox(null);
      }
      if (dragRef.current) {
        dragRef.current = null;
        setActiveDragId(null);
        setDragOverColumnId(null);
        setDragOverTaskListId(null);
        onDragChange?.(false);
      }
      if (lineHandleDragRef.current) {
        lineHandleDragRef.current = null;
        setActiveLineHandleDrag(null);
        setLineDragPreview(null);
      }
      if (headerResizeRef.current) {
        headerResizeRef.current = null;
        setHeaderResize(null);
      }
      if (isPanning) setIsPanning(false);
      return;
    }
    if (scrollbarDragRef.current) {
      const { axis, startMouse, startPan, availableTrack, maxPanTravel } = scrollbarDragRef.current;
      if (axis === 'h') {
        const mouseDelta = e.clientX - startMouse;
        const panDelta = (mouseDelta / availableTrack) * maxPanTravel;
        pendingScrollbarPanRef.current = { x: startPan - panDelta };
      } else {
        const mouseDelta = e.clientY - startMouse;
        const panDelta = (mouseDelta / availableTrack) * maxPanTravel;
        pendingScrollbarPanRef.current = { y: startPan - panDelta };
      }

      if (scrollbarRafRef.current === null) {
        scrollbarRafRef.current = requestAnimationFrame(() => {
          scrollbarRafRef.current = null;
          if (pendingScrollbarPanRef.current) {
            const p = pendingScrollbarPanRef.current;
            pendingScrollbarPanRef.current = null;
            setPan((prev) => clampPan(p.x !== undefined ? p.x : prev.x, p.y !== undefined ? p.y : prev.y));
          }
        });
      }
      return;
    }
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan(clampPan(panStartRef.current.startPanX + dx, panStartRef.current.startPanY + dy));
      return;
    }

    if (lineHandleDragRef.current) {
      const { lineId, handle } = lineHandleDragRef.current;
      const lineEl = elements.find((x) => x.id === lineId);
      if (!lineEl) return;
      const pos = screenToCanvas(e.clientX, e.clientY);
      const currentContent = (lineDragPreviewRef.current?.lineId === lineId ? lineDragPreviewRef.current.content : lineEl.content) || {};

      if (handle === 'move' && lineHandleDragRef.current.startMouseX !== undefined && lineHandleDragRef.current.startMouseY !== undefined) {
        const dx = (e.clientX - lineHandleDragRef.current.startMouseX) / scale;
        const dy = (e.clientY - lineHandleDragRef.current.startMouseY) / scale;
        
        if (lineHandleDragRef.current.connectedItems && lineHandleDragRef.current.connectedItems.length > 0) {
          lineHandleDragRef.current.connectedItems.forEach((item) => {
            const elDiv = document.getElementById(`milanote-el-${item.id}`);
            if (elDiv) {
              const newX = Math.round(item.origX + dx);
              const newY = Math.round(item.origY + dy);
              elDiv.style.transform = `translate(${newX}px, ${newY}px)`;
              elDiv.style.left = '0px';
              elDiv.style.top = '0px';
            }
          });
          setDragTick((t) => t + 1);
        }

        const newStartX = Math.round((lineHandleDragRef.current.origStartX || 0) + dx);
        const newStartY = Math.round((lineHandleDragRef.current.origStartY || 0) + dy);
        const newEndX = Math.round((lineHandleDragRef.current.origEndX || 0) + dx);
        const newEndY = Math.round((lineHandleDragRef.current.origEndY || 0) + dy);
        const nextContent = { ...lineHandleDragRef.current.origContent };
        if (!nextContent.start_target_id) {
          nextContent.start_x = newStartX;
          nextContent.start_y = newStartY;
        }
        if (!nextContent.end_target_id) {
          nextContent.end_x = newEndX;
          nextContent.end_y = newEndY;
        }
        setLineDragPreview({
          lineId,
          content: nextContent
        });
        return;
      }

      if (handle === 'middle') {
        const startP = computeLineEndpoint(lineEl, currentContent, true);
        const endP = computeLineEndpoint(lineEl, currentContent, false);
        const rawMidX = (startP.x + endP.x) / 2;
        const rawMidY = (startP.y + endP.y) / 2;
        const newOffsetX = 2 * (pos.x - rawMidX);
        const newOffsetY = 2 * (pos.y - rawMidY);
        setLineDragPreview({ lineId, content: { ...currentContent, control_offset_x: newOffsetX, control_offset_y: newOffsetY } });
      } else {
        let hitId: string | null = null;
        let hitDom: HTMLElement | null = null;
        const sortedCandidates = [...elements]
          .filter((cand) => cand.id !== lineId && cand.element_type !== 'line')
          .sort((a, b) => {
            const aInCol = Boolean(a.style?.parent_column_id) ? 0 : 1;
            const bInCol = Boolean(b.style?.parent_column_id) ? 0 : 1;
            return aInCol - bInCol;
          });

        for (const cand of sortedCandidates) {
          const dom = document.getElementById(`milanote-el-${cand.id}`);
          if (dom) {
            const rect = dom.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
              hitId = cand.id;
              hitDom = dom;
              break;
            }
          }
        }

        if (hitId && hitDom) {
          const hitStateEl = elements.find((x) => x.id === hitId);
          const isBoard = hitStateEl?.element_type === 'nested_board';
          const iconDom = isBoard ? hitDom.querySelector('.board-icon-badge, .column-board-icon-box') : null;
          const r = (iconDom || hitDom).getBoundingClientRect();
          const tl = screenToCanvas(r.left, r.top);
          const br = screenToCanvas(r.right, r.bottom);
          const box = { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
          setHoveredLineTarget({ elementId: hitId, box, isBoard });
          lastHoverPosRef.current = pos;
          lastHoverBoxRef.current = box;

          if (hitId !== hoveredElementIdRef.current) {
            hoveredElementIdRef.current = hitId;
            if (hoverTimerRef.current) {
              clearTimeout(hoverTimerRef.current);
              hoverTimerRef.current = null;
            }
            lineSnapModeRef.current = 'center';
            setLineSnapMode('center');
            if (!isBoard) {
              hoverTimerRef.current = window.setTimeout(() => {
              lineSnapModeRef.current = 'advanced';
              setLineSnapMode('advanced');
              if (lineHandleDragRef.current && hoveredElementIdRef.current && lastHoverPosRef.current && lastHoverBoxRef.current) {
                const { lineId: lId, handle: lHandle } = lineHandleDragRef.current;
                const p = lastHoverPosRef.current;
                const b = lastHoverBoxRef.current;
                const sps = [
                  { anchor: 'top', x: b.x + b.width / 2, y: b.y },
                  { anchor: 'bottom', x: b.x + b.width / 2, y: b.y + b.height },
                  { anchor: 'left', x: b.x, y: b.y + b.height / 2 },
                  { anchor: 'right', x: b.x + b.width, y: b.y + b.height / 2 },
                ];
                let mAnchor: string | null = null;
                let mDist = Infinity;
                for (const sp of sps) {
                  const d = Math.hypot(p.x - sp.x, p.y - sp.y);
                  if (d < 28 && d < mDist) {
                    mDist = d;
                    mAnchor = sp.anchor;
                  }
                }
                const cContent = lineDragPreviewRef.current?.content || {};
                if (mAnchor) {
                  if (lHandle === 'start') {
                    setLineDragPreview({ lineId: lId, content: { ...cContent, start_target_id: hoveredElementIdRef.current, start_anchor: mAnchor, start_x: 0, start_y: 0 } });
                  } else {
                    setLineDragPreview({ lineId: lId, content: { ...cContent, end_target_id: hoveredElementIdRef.current, end_anchor: mAnchor, end_x: 0, end_y: 0 } });
                  }
                } else {
                  const rx = Math.min(1, Math.max(0, (p.x - b.x) / (b.width || 1)));
                  const ry = Math.min(1, Math.max(0, (p.y - b.y) / (b.height || 1)));
                  if (lHandle === 'start') {
                    setLineDragPreview({ lineId: lId, content: { ...cContent, start_target_id: hoveredElementIdRef.current, start_anchor: 'custom', start_rel_x: rx, start_rel_y: ry, start_x: 0, start_y: 0 } });
                  } else {
                    setLineDragPreview({ lineId: lId, content: { ...cContent, end_target_id: hoveredElementIdRef.current, end_anchor: 'custom', end_rel_x: rx, end_rel_y: ry, end_x: 0, end_y: 0 } });
                  }
                }
              }
            }, 600);
            }
          }

          if (hitStateEl?.element_type === 'nested_board' || lineSnapModeRef.current === 'center') {
            if (handle === 'start') {
              setLineDragPreview({ lineId, content: { ...currentContent, start_target_id: hitId, start_anchor: 'center', start_x: 0, start_y: 0 } });
            } else {
              setLineDragPreview({ lineId, content: { ...currentContent, end_target_id: hitId, end_anchor: 'center', end_x: 0, end_y: 0 } });
            }
          } else {
            const snapPoints = [
              { anchor: 'top', x: box.x + box.width / 2, y: box.y },
              { anchor: 'bottom', x: box.x + box.width / 2, y: box.y + box.height },
              { anchor: 'left', x: box.x, y: box.y + box.height / 2 },
              { anchor: 'right', x: box.x + box.width, y: box.y + box.height / 2 },
            ];

            let matchedAnchor: string | null = null;
            let minDist = Infinity;
            for (const sp of snapPoints) {
              const dist = Math.hypot(pos.x - sp.x, pos.y - sp.y);
              if (dist < 28 && dist < minDist) {
                minDist = dist;
                matchedAnchor = sp.anchor;
              }
            }

            if (matchedAnchor) {
              if (handle === 'start') {
                setLineDragPreview({ lineId, content: { ...currentContent, start_target_id: hitId, start_anchor: matchedAnchor, start_x: 0, start_y: 0 } });
              } else {
                setLineDragPreview({ lineId, content: { ...currentContent, end_target_id: hitId, end_anchor: matchedAnchor, end_x: 0, end_y: 0 } });
              }
            } else {
              const relX = Math.min(1, Math.max(0, (pos.x - box.x) / (box.width || 1)));
              const relY = Math.min(1, Math.max(0, (pos.y - box.y) / (box.height || 1)));
              if (handle === 'start') {
                setLineDragPreview({ lineId, content: { ...currentContent, start_target_id: hitId, start_anchor: 'custom', start_rel_x: relX, start_rel_y: relY, start_x: 0, start_y: 0 } });
              } else {
                setLineDragPreview({ lineId, content: { ...currentContent, end_target_id: hitId, end_anchor: 'custom', end_rel_x: relX, end_rel_y: relY, end_x: 0, end_y: 0 } });
              }
            }
          }
        } else {
          if (hoveredElementIdRef.current) {
            hoveredElementIdRef.current = null;
            if (hoverTimerRef.current) {
              clearTimeout(hoverTimerRef.current);
              hoverTimerRef.current = null;
            }
            lineSnapModeRef.current = 'center';
            setLineSnapMode('center');
          }
          setHoveredLineTarget(null);
          if (handle === 'start') {
            setLineDragPreview({ lineId, content: { ...currentContent, start_target_id: null, start_anchor: 'center', start_x: pos.x - lineEl.x, start_y: pos.y - lineEl.y } });
          } else {
            setLineDragPreview({ lineId, content: { ...currentContent, end_target_id: null, end_anchor: 'center', end_x: pos.x - lineEl.x, end_y: pos.y - lineEl.y } });
          }
        }
      }
      return;
    }

    if (selectionRef.current) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const updatedBox = { ...selectionRef.current, currentX: pos.x, currentY: pos.y };
      selectionRef.current = updatedBox;
      setSelectionBox(updatedBox);

      const minX = Math.min(updatedBox.startX, updatedBox.currentX);
      const maxX = Math.max(updatedBox.startX, updatedBox.currentX);
      const minY = Math.min(updatedBox.startY, updatedBox.currentY);
      const maxY = Math.max(updatedBox.startY, updatedBox.currentY);

      const hitIds: string[] = [];
      elements.forEach((el) => {
        if (el.style?.parent_column_id) return;
        const width = el.width || (el.element_type === 'nested_board' ? 80 : 340);
        const height = el.height || (el.element_type === 'nested_board' ? 100 : 60);
        const elRight = el.x + width;
        const elBottom = el.y + height;
        
        if (elRight >= minX && el.x <= maxX && elBottom >= minY && el.y <= maxY) {
          hitIds.push(el.id);
        }
      });
      if (onMultiSelect) onMultiSelect(hitIds);
      return;
    }

    if (headerResizeRef.current || headerResize) {
      const resizeData = headerResizeRef.current || headerResize;
      if (resizeData) {
        const targetEl = elements.find((x) => x.id === resizeData.tableId);
        if (targetEl && targetEl.content) {
          if (resizeData.type === 'col') {
            const dx = (e.clientX - resizeData.startX) / scale;
            const newWidth = Math.max(Math.round(resizeData.startValue + dx), 40);
            const colWidths = Array.isArray(targetEl.content.colWidths) ? [...targetEl.content.colWidths] : Array(targetEl.content.columns || 4).fill(100);
            if (colWidths[resizeData.index] !== newWidth) {
              colWidths[resizeData.index] = newWidth;
              onContentChange(targetEl.id, { ...targetEl.content, colWidths });
            }
          } else {
            const dy = (e.clientY - resizeData.startY) / scale;
            const newHeight = Math.max(Math.round(resizeData.startValue + dy), 32);
            const rowHeights = Array.isArray(targetEl.content.rowHeights) ? [...targetEl.content.rowHeights] : Array(targetEl.content.rows || 4).fill(38);
            if (rowHeights[resizeData.index] !== newHeight) {
              rowHeights[resizeData.index] = newHeight;
              onContentChange(targetEl.id, { ...targetEl.content, rowHeights });
            }
          }
        }
      }
      return;
    }

    if (dragRef.current) {
      const { elementId, startX, startY, offsetX, offsetY, isResize, resizeDirection, isFromColumn, dragGroup } = dragRef.current;
      
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      const dragThreshold = isFromColumn ? 16 : 6;
      if (!dragRef.current.hasExceededThreshold && dist < dragThreshold && !isResize) {
        return;
      }
      if (!dragRef.current.hasExceededThreshold) {
        dragRef.current.hasExceededThreshold = true;
        onDragChange?.(true);
      }
      if (activeDragId !== elementId) setActiveDragId(elementId);

      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;

      if (isResize && dragGroup.length > 0) {
        const item = dragGroup[0];
        if (item.elementType === 'table') {
          const currentEl = elements.find((x) => x.id === elementId);
          if (currentEl && currentEl.content) {
            const deltaCols = Math.round(dx / 100);
            const deltaRows = resizeDirection === 'e' ? 0 : Math.round(dy / 38);

            let minCols = 1;
            let minRows = 1;
            const currentCols = currentEl.content.columns || (item as any).origCols || 4;
            const allCellIndices = new Set([
              ...Object.keys(currentEl.content.cells || {}).map(Number),
              ...Object.keys(currentEl.content.cellTypes || {}).map(Number)
            ]);
            allCellIndices.forEach((idx) => {
              if (isNaN(idx) || idx <= 0) return;
              const val = currentEl.content.cells?.[idx];
              const isCheckbox = currentEl.content.cellTypes?.[idx]?.type === 'checkbox';
              const hasText = val !== undefined && val !== null && String(val).trim() !== '';
              if (hasText || isCheckbox) {
                const c = ((idx - 1) % currentCols) + 1;
                const r = Math.floor((idx - 1) / currentCols) + 1;
                if (c > minCols) minCols = c;
                if (r > minRows) minRows = r;
              }
            });

            const newCols = Math.max((item as any).origCols + deltaCols, minCols);
            const newRows = Math.max((item as any).origRows + deltaRows, minRows);
            if (newCols !== currentEl.content.columns || newRows !== currentEl.content.rows) {
              const updatedWidths = Array.isArray(currentEl.content.colWidths) ? [...currentEl.content.colWidths] : Array((item as any).origCols).fill(100);
              while (updatedWidths.length < newCols) updatedWidths.push(100);
              const updatedHeights = Array.isArray(currentEl.content.rowHeights) ? [...currentEl.content.rowHeights] : Array((item as any).origRows).fill(38);
              while (updatedHeights.length < newRows) updatedHeights.push(38);

              let updatedCells = currentEl.content.cells;
              let updatedStyles = currentEl.content.cellStyles;
              let updatedTypes = currentEl.content.cellTypes;

              const oldCols = currentEl.content.columns || (item as any).origCols || 4;
              if (newCols !== oldCols) {
                const newCells: Record<number, any> = {};
                const newStyles: Record<number, any> = {};
                const newTypes: Record<number, any> = {};

                Object.keys(currentEl.content.cells || {}).forEach((k) => {
                  const oldIdx = parseInt(k, 10);
                  if (isNaN(oldIdx)) return;
                  const r = Math.floor((oldIdx - 1) / oldCols) + 1;
                  const c = ((oldIdx - 1) % oldCols) + 1;
                  const newIdx = (r - 1) * newCols + c;
                  newCells[newIdx] = currentEl.content.cells?.[oldIdx];
                });

                Object.keys(currentEl.content.cellStyles || {}).forEach((k) => {
                  const oldIdx = parseInt(k, 10);
                  if (isNaN(oldIdx)) return;
                  const r = Math.floor((oldIdx - 1) / oldCols) + 1;
                  const c = ((oldIdx - 1) % oldCols) + 1;
                  const newIdx = (r - 1) * newCols + c;
                  newStyles[newIdx] = currentEl.content.cellStyles?.[oldIdx];
                });

                Object.keys(currentEl.content.cellTypes || {}).forEach((k) => {
                  const oldIdx = parseInt(k, 10);
                  if (isNaN(oldIdx)) return;
                  const r = Math.floor((oldIdx - 1) / oldCols) + 1;
                  const c = ((oldIdx - 1) % oldCols) + 1;
                  const newIdx = (r - 1) * newCols + c;
                  newTypes[newIdx] = currentEl.content.cellTypes?.[oldIdx];
                });

                updatedCells = newCells;
                updatedStyles = newStyles;
                updatedTypes = newTypes;
              }

              onContentChange(elementId, { 
                ...currentEl.content, 
                columns: newCols, 
                rows: newRows, 
                colWidths: updatedWidths, 
                rowHeights: updatedHeights,
                cells: updatedCells,
                cellStyles: updatedStyles,
                cellTypes: updatedTypes,
              });
            }
          }
          return;
        }
        let newWidth = Math.max(item.origWidth + dx, 110);
        let newHeight = Math.max(item.origHeight + dy, 50);

        if (item.isColumn || resizeDirection === 'e') {
          newHeight = item.origHeight;
        } else if (item.elementType === 'link') {
          if (!item.isVideoLink) {
            newHeight = item.origHeight;
          }
        } else if (item.elementType === 'image') {
          const aspectRatio = (item.origWidth && item.origHeight && item.origHeight > 0) ? (item.origWidth / item.origHeight) : (340 / 220);
          newHeight = Math.max(Math.round(newWidth / aspectRatio), 40);
        }

        const elDiv = document.getElementById(`milanote-el-${elementId}`);
        const currentEl = elements.find((x) => x.id === elementId);
        const isAutoHeightEl = item.isColumn || (item.elementType === 'link' && !item.isVideoLink) || (item.elementType === 'image' && Boolean(currentEl?.content?.show_caption));
        if (elDiv) {
          elDiv.style.width = `${newWidth}px`;
          if (item.elementType === 'image') {
            const photoWrap = elDiv.querySelector('.image-photo-wrap') as HTMLElement | null;
            if (photoWrap) photoWrap.style.height = `${newHeight}px`;
          }
          if (!isAutoHeightEl) {
            elDiv.style.height = `${newHeight}px`;
            elDiv.style.minHeight = `${newHeight}px`;
          } else {
            elDiv.style.height = 'auto';
            elDiv.style.minHeight = '0px';
          }
        }
      } else {
        dragRef.current.targetDx = dx;
        dragRef.current.targetDy = dy;
        dragRef.current.clientX = e.clientX;
        dragRef.current.clientY = e.clientY;
        startDragRafLoop();
      }
    }
  }, [isPanning, scale, screenToCanvas, canvasToScreen, elements, onMultiSelect, onSetHoveringTrash, columns, activeDragId, setLineDragPreview, computeLineEndpoint, onContentChange, headerResize, onMoveElementToBoard, onOpenBoard, isHoveringUnsorted, onOpenUnsortedDrawer, startDragRafLoop, clampPan, onDragChange]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (hoverEnterBoardRef.current?.timer) {
      clearTimeout(hoverEnterBoardRef.current.timer);
      hoverEnterBoardRef.current = null;
    }
    if (hoveredBoardId) setHoveredBoardId(null);
    if (scrollbarDragRef.current) {
      scrollbarDragRef.current = null;
    }
    if (scrollbarRafRef.current !== null) {
      cancelAnimationFrame(scrollbarRafRef.current);
      scrollbarRafRef.current = null;
    }
    pendingScrollbarPanRef.current = null;
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    onDragChange?.(false);

    if (lineHandleDragRef.current) {
      if (lineDragPreviewRef.current) {
        onContentChange(lineDragPreviewRef.current.lineId, lineDragPreviewRef.current.content);
      }
      if (lineHandleDragRef.current.handle === 'move' && lineHandleDragRef.current.connectedItems && lineHandleDragRef.current.connectedItems.length > 0 && lineHandleDragRef.current.startMouseX !== undefined && lineHandleDragRef.current.startMouseY !== undefined) {
        const dx = (e.clientX - lineHandleDragRef.current.startMouseX) / scale;
        const dy = (e.clientY - lineHandleDragRef.current.startMouseY) / scale;
        const updates: ElementPositionUpdate[] = lineHandleDragRef.current.connectedItems.map((item) => ({
          id: item.id,
          x: Math.round(item.origX + dx),
          y: Math.round(item.origY + dy),
          width: item.width,
          height: item.height,
          z_index: item.zIndex
        }));
        onUpdateElementPositions(updates);
      }
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      hoveredElementIdRef.current = null;
      lineSnapModeRef.current = 'center';
      setLineSnapMode('center');
      lineHandleDragRef.current = null;
      setLineDragPreview(null);
      setActiveLineHandleDrag(null);
      setHoveredLineTarget(null);
      return;
    }
    if (isPanning) {
      setIsPanning(false);
    }
    if (headerResizeRef.current || headerResize) {
      headerResizeRef.current = null;
      setHeaderResize(null);
      return;
    }
    if (selectionRef.current) {
      selectionRef.current = null;
      setSelectionBox(null);
    }
    if (dragRef.current) {
      const { startX, startY, offsetX, offsetY, isResize, resizeDirection, isFromColumn, origColumnId, dragGroup, hasExceededThreshold } = dragRef.current;
      dragOccurredRef.current = Boolean(hasExceededThreshold) || Boolean(isResize);
      
      if (!hasExceededThreshold && !isResize) {
        dragRef.current = null;
        setActiveDragId(null);
        setDragOverColumnId(null);
        setDragOverTaskListId(null);
        onDragChange?.(false);
        return;
      }

      const dx = dragRef.current.targetDx !== undefined ? dragRef.current.targetDx : (e.clientX - startX) / scale;
      const dy = dragRef.current.targetDy !== undefined ? dragRef.current.targetDy : (e.clientY - startY) / scale;

      // RESOLVED TELEPORT BUG: Only scrub transforms and fixed coordinates when dragging items OUT of columns!
      // Erasing transform on standard canvas cards destroys their translate3d coordinates and causes jumping/teleporting.
      if (isFromColumn) {
        dragGroup.forEach((item) => {
          const elDiv = document.getElementById(`milanote-el-${item.id}`);
          if (elDiv) {
            elDiv.style.position = '';
            elDiv.style.left = '';
            elDiv.style.top = '';
            elDiv.style.transform = '';
            elDiv.style.zIndex = '';
            elDiv.style.width = '';
            elDiv.style.height = '';
          }
        });
      }

      const unsortedDrawerEl = document.querySelector('.unsorted-drawer');
      let overUnsortedDrawer = false;
      if (unsortedDrawerEl) {
        const dRect = unsortedDrawerEl.getBoundingClientRect();
        if (e.clientX >= dRect.left && e.clientX <= dRect.right && e.clientY >= dRect.top && e.clientY <= dRect.bottom) {
          overUnsortedDrawer = true;
        }
      }
      if (hoverUnsortedRef.current) {
        clearTimeout(hoverUnsortedRef.current);
        hoverUnsortedRef.current = null;
      }
      if (isHoveringUnsorted || overUnsortedDrawer) {
        setIsHoveringUnsorted(false);
        if (onMoveToUnsorted && dragGroup.length > 0) {
          dragGroup.forEach((item) => onMoveToUnsorted(item.id));
          dragRef.current = null;
          setActiveDragId(null);
          return;
        }
      }

      if (e.clientX <= 75 && e.clientY >= window.innerHeight - 80) {
        dragGroup.forEach((item) => onDeleteElement(item.id));
        onSetHoveringTrash(false);
        setDragOverColumnId(null);
        setDragOverTaskListId(null);
        dragRef.current = null;
        setActiveDragId(null);
        return;
      }

      if (dragOverTaskListId && !isResize && dragGroup.length === 1) {
        const sourceEl = elements.find((x) => x.id === dragGroup[0].id);
        const targetEl = elements.find((x) => x.id === dragOverTaskListId);
        if (sourceEl && targetEl && sourceEl.element_type === 'task_list' && targetEl.element_type === 'task_list') {
          const sourceItems = (sourceEl.content?.items || []) as any[];
          const targetItems = (targetEl.content?.items || []) as any[];
          onContentChange(targetEl.id, { ...targetEl.content, items: [...targetItems, ...sourceItems] });
          onDeleteElement(sourceEl.id);
          setDragOverTaskListId(null);
          dragRef.current = null;
          setActiveDragId(null);
          return;
        }
      }

      let activeTargetBoardId = hoveredBoardIdRef.current || hoveredBoardId;
      if (!activeTargetBoardId && !isResize) {
        elements.forEach((other) => {
          if (other.element_type !== 'nested_board') return;
          if (dragGroup.some(g => g.id === other.id)) return;
          const bDiv = document.getElementById(`milanote-el-${other.id}`);
          if (bDiv) {
            const rect = bDiv.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
              activeTargetBoardId = other.content?.target_board_id || other.id;
            }
          }
        });
      }
      if (activeTargetBoardId && !isResize && onMoveElementToBoard && dragGroup.length > 0) {
        if (hoverEnterBoardRef.current?.timer) clearTimeout(hoverEnterBoardRef.current.timer);
        hoverEnterBoardRef.current = null;
        const curPos = screenToCanvas(e.clientX, e.clientY);
        const targetX = Math.round(curPos.x - (dragRef.current?.offsetX || 0));
        const targetY = Math.round(curPos.y - (dragRef.current?.offsetY || 0));
        const targetBoard = activeTargetBoardId;
        const isBreadcrumb = !document.querySelector(`#milanote-el-${targetBoard}`);
        dragGroup.forEach((item) => {
          onMoveElementToBoard(item.id, targetBoard, targetX, targetY, isBreadcrumb, false);
        });
        hoveredBoardIdRef.current = null;
        setHoveredBoardId(null);
        dragRef.current = null;
        setActiveDragId(null);
        onDragChange?.(false);
        return;
      }

      if (dragOverColumnId && !isResize && dragGroup.length > 0) {
        const hasNonPinnedItems = dragGroup.some((item) => {
          const el = elements.find((x) => x.id === item.id);
          return !(el && el.element_type === 'comment' && Boolean(el.content?.is_pinned));
        });
        if (hasNonPinnedItems) {
          const targetCol = elements.find((c) => c.id === dragOverColumnId);
          const targetInnerWidth = Math.max((targetCol?.width || 340) - 24, 200);
          const updates: ElementPositionUpdate[] = [];

          const existingChildren = getColumnChildren(dragOverColumnId).filter(
            c => !dragGroup.some(g => g.id === c.id)
          );
          const insertIdx = dropInsertIndexRef.current !== null ? dropInsertIndexRef.current : existingChildren.length;
          const itemsToInsert = dragGroup
            .map(g => elements.find(x => x.id === g.id))
            .filter(el => el && el.element_type !== 'column' && !(el.element_type === 'comment' && Boolean(el.content?.is_pinned))) as Element[];

          const newOrder = [
            ...existingChildren.slice(0, insertIdx),
            ...itemsToInsert,
            ...existingChildren.slice(insertIdx)
          ];

          newOrder.forEach((itemEl, idx) => {
            const styleChanged = itemEl.style?.parent_column_id !== dragOverColumnId || itemEl.style?.column_order !== idx;
            if (styleChanged) {
              onStyleChange(itemEl.id, { ...(itemEl.style || {}), parent_column_id: dragOverColumnId, column_order: idx });
            }
            if (itemEl.element_type === 'image' && itemEl.style?.parent_column_id !== dragOverColumnId) {
              const aspect = (itemEl.width && itemEl.height && itemEl.height > 0) ? (itemEl.width / itemEl.height) : (340 / 220);
              const scaledHeight = Math.round(targetInnerWidth / aspect);
              updates.push({ id: itemEl.id, x: itemEl.x, y: itemEl.y, width: targetInnerWidth, height: scaledHeight, z_index: itemEl.z_index || 10 });
            }
          });

          if (updates.length > 0) {
            onUpdateElementPositions(updates);
          }
          setDragOverColumnId(null);
          setDropInsertIndex(null);
          dragRef.current = null;
          setActiveDragId(null);
          onSetHoveringTrash(false);
          onDragChange?.(false);
          return;
        }
      }

      if (isResize && dragGroup.length > 0) {
        const item = dragGroup[0];
        if (item.elementType === 'table') {
          dragRef.current = null;
          setActiveDragId(null);
          onDragChange?.(false);
          return;
        }
        let newWidth = Math.max(Math.round(item.origWidth + dx), 110);
        let newHeight = Math.max(Math.round(item.origHeight + dy), 50);

        if (item.isColumn || resizeDirection === 'e') {
          newHeight = item.origHeight;
        } else if (item.elementType === 'link') {
          if (!item.isVideoLink) {
            const finalDom = document.getElementById(`milanote-el-${item.id}`);
            newHeight = finalDom ? finalDom.offsetHeight : item.origHeight;
          }
        } else if (item.elementType === 'image') {
          const aspect = (item.origWidth && item.origHeight && item.origHeight > 0) ? (item.origWidth / item.origHeight) : (340 / 220);
          newHeight = Math.max(Math.round(newWidth / aspect), 40);
        }

        const updates: ElementPositionUpdate[] = [{ id: item.id, x: item.origX, y: item.origY, width: newWidth, height: newHeight, z_index: item.zIndex }];

        if (item.isColumn) {
          const childElements = elements.filter(c => c.style?.parent_column_id === item.id);
          const newInnerWidth = Math.max(newWidth - 24, 200);
          childElements.forEach(child => {
            if (child.element_type === 'image') {
              const childAspect = (child.width && child.height && child.height > 0) ? (child.width / child.height) : (340 / 220);
              const scaledHeight = Math.round(newInnerWidth / childAspect);
              updates.push({ id: child.id, x: child.x, y: child.y, width: newInnerWidth, height: scaledHeight, z_index: child.z_index || 10 });
            } else {
              updates.push({ id: child.id, x: child.x, y: child.y, width: newInnerWidth, height: child.height || 60, z_index: child.z_index || 10 });
            }
          });
        }

        onUpdateElementPositions(updates);
      } else if (isFromColumn && dragGroup.length > 0 && dragOverColumnId !== origColumnId) {
        const item = dragGroup[0];
        const el = elements.find((x) => x.id === item.id);
        const isBoard = el?.element_type === 'nested_board';
        const isImage = el?.element_type === 'image';
        const targetWidth = isBoard ? 80 : (isImage ? (el?.width || 340) : 340);
        const targetHeight = isBoard ? 100 : (isImage ? (el?.height || 220) : 60);
        
        const pos = screenToCanvas(e.clientX - (isBoard ? 40 : offsetX), e.clientY - (isBoard ? 35 : offsetY));
        const dropX = Math.round(pos.x);
        const dropY = Math.round(pos.y);
        
        if (el) {
          onStyleChange(item.id, { ...(el.style || {}), parent_column_id: null });
          onUpdateElementPositions([{ id: item.id, x: dropX, y: dropY, width: targetWidth, height: targetHeight, z_index: item.zIndex + 10 }]);
        }
      } else {
        const updates: ElementPositionUpdate[] = dragGroup.map((item) => ({
          id: item.id,
          x: Math.round(item.origX + dx),
          y: Math.round(item.origY + dy),
          width: item.origWidth,
          height: item.origHeight,
          z_index: item.zIndex + 1,
        }));
        onUpdateElementPositions(updates);
      }

      setDragOverColumnId(null);
      dragRef.current = null;
      setActiveDragId(null);
      onSetHoveringTrash(false);
      onDragChange?.(false);
    }
  }, [isPanning, scale, elements, onUpdateElementPositions, onDeleteElement, onSetHoveringTrash, screenToCanvas, onStyleChange, dragOverColumnId, headerResize, onMoveElementToBoard, hoveredBoardId, onOpenBoard, isHoveringUnsorted, onMoveToUnsorted, onDragChange]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove as any);
    window.addEventListener('mouseup', handleMouseUp as any);
    window.addEventListener('blur', handleMouseUp as any);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove as any);
      window.removeEventListener('mouseup', handleMouseUp as any);
      window.removeEventListener('blur', handleMouseUp as any);
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
    };
  }, [handleMouseMove, handleMouseUp, setLineDragPreview, onContentChange]);

  const handleQuickConnectStart = async (e: React.MouseEvent, el: Element) => {
    e.stopPropagation();
    e.preventDefault();
    if (onCreateQuickLine) {
      const newLineId = await onCreateQuickLine(el.id);
      if (newLineId) {
        lineHandleDragRef.current = { lineId: newLineId, handle: 'end' };
        setActiveLineHandleDrag(newLineId);
      }
    }
  };

  const handleElementMouseDown = (e: React.MouseEvent, element: Element, isResize = false, resizeDirection?: 'se' | 'e', isFromColumn = false) => {
    e.stopPropagation();
    if (element.element_type === 'task_list' && isResize) return;
    if (element.style?.is_locked && !isResize) return;

    const target = e.target as HTMLElement;
    const isReadOnlyInput = (target.tagName === 'INPUT' && (target as HTMLInputElement).readOnly) || 
                            (target.tagName === 'TEXTAREA' && (target as HTMLTextAreaElement).readOnly);

    if (!isResize && !isReadOnlyInput && target && (
      editingElementId === element.id ||
      target.tagName === 'INPUT' || 
      target.tagName === 'TEXTAREA' || 
      target.isContentEditable || 
      Boolean(target.closest('[contenteditable="true"]'))
    )) {
      if (selectedElementId !== element.id && !selectedIds.includes(element.id)) {
        onSelectElement(element.id);
      }
      return;
    }

    // RESOLVED REQUIREMENT: Ctrl+Click (and Cmd+Click) multi-selection toggle logic!
    if ((e.ctrlKey || e.metaKey) && !isResize) {
      e.preventDefault();
      const currentSelected = selectedIds.length > 0 ? [...selectedIds] : (selectedElementId ? [selectedElementId] : []);
      const index = currentSelected.indexOf(element.id);
      let nextSelected: string[];
      if (index >= 0) {
        nextSelected = currentSelected.filter((id) => id !== element.id);
      } else {
        nextSelected = [...currentSelected, element.id];
      }
      if (onMultiSelect) onMultiSelect(nextSelected);
      onSelectElement(nextSelected[nextSelected.length - 1] || null);
      if (editingElementId) onSetEditingElement(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    dragOccurredRef.current = false;
    let groupToDrag = [element.id];
    if (selectedIds.includes(element.id) && selectedIds.length > 1 && !isResize) {
      groupToDrag = [...selectedIds];
    } else if (!selectedIds.includes(element.id) && selectedElementId !== element.id) {
      if (selectedElementId || selectedIds.length > 0) {
        onSelectElement(null);
        if (onMultiSelect) onMultiSelect([]);
      }
    }

    if (!isResize) {
      const pinnedChildIds = elements
        .filter((c) => c.element_type === 'comment' && c.content?.is_pinned && groupToDrag.includes(c.content?.pin_target_id))
        .map((c) => c.id);
      for (const cid of pinnedChildIds) {
        if (!groupToDrag.includes(cid)) groupToDrag.push(cid);
      }
    }

    const dragGroup = groupToDrag.map((id) => {
      const found = elements.find((x) => x.id === id) || element;
      const isBoard = found.element_type === 'nested_board';
      const domEl = document.getElementById(`milanote-el-${found.id}`);
      const isRichLink = found.element_type === 'link' && Boolean(found.content?.url && found.content.url.trim().length > 0);
      const measuredHeight = domEl ? domEl.offsetHeight : (isBoard ? 100 : 60);
      return {
        id: found.id,
        origX: found.x,
        origY: found.y,
        origWidth: found.width || (isBoard ? 80 : 340),
        origHeight: isRichLink ? measuredHeight : (found.height || (isBoard ? 100 : 60)),
        zIndex: found.z_index || 10,
        isColumn: found.element_type === 'column',
        isFromColumn: Boolean(found.style?.parent_column_id),
        elementType: found.element_type,
        origCols: found.content?.columns || 4,
        origRows: found.content?.rows || 4,
        isVideoLink: Boolean(found.element_type === 'link' && found.content?.url && (found.content.url.match(/youtube\.com|youtu\.be|vimeo|mp4|twitch/i)))
      };
    });

    dragRef.current = {
      elementId: element.id,
      startX: e.clientX,
      startY: e.clientY,
      offsetX,
      offsetY,
      isResize,
      resizeDirection,
      isFromColumn,
      origColumnId: element.style?.parent_column_id || null,
      hasExceededThreshold: false,
      targetDx: 0,
      targetDy: 0,
      currentDx: 0,
      currentDy: 0,
      clientX: e.clientX,
      clientY: e.clientY,
      dragGroup,
    };

    if (isResize) {
      setActiveDragId(element.id);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    let foundBoardId: string | null = null;
    elements.forEach((other) => {
      if (other.element_type !== 'nested_board') return;
      const bDiv = document.getElementById(`milanote-el-${other.id}`);
      if (bDiv) {
        const rect = bDiv.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          foundBoardId = other.id;
        }
      }
    });
    setHoveredBoardId(foundBoardId);
    if (foundBoardId) {
      if (hoverEnterBoardRef.current?.boardId !== foundBoardId) {
        if (hoverEnterBoardRef.current?.timer) clearTimeout(hoverEnterBoardRef.current.timer);
        const targetId = foundBoardId;
        const t = setTimeout(() => {
          onOpenBoard(targetId, true);
          setHoveredBoardId(null);
          hoverEnterBoardRef.current = null;
        }, 1400);
        hoverEnterBoardRef.current = { boardId: targetId, timer: t };
      }
    } else if (hoverEnterBoardRef.current) {
      if (hoverEnterBoardRef.current.timer) clearTimeout(hoverEnterBoardRef.current.timer);
      hoverEnterBoardRef.current = null;
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (hoverEnterBoardRef.current?.timer) {
      clearTimeout(hoverEnterBoardRef.current.timer);
      hoverEnterBoardRef.current = null;
    }
    let targetBoardId: string | undefined = hoveredBoardIdRef.current || hoveredBoardId || undefined;
    if (!targetBoardId) {
      elements.forEach((other) => {
        if (other.element_type !== 'nested_board') return;
        const bDiv = document.getElementById(`milanote-el-${other.id}`);
        if (bDiv) {
          const rect = bDiv.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            targetBoardId = other.content?.target_board_id || other.id;
          }
        }
      });
    }
    setHoveredBoardId(null);
    hoveredBoardIdRef.current = null;

    const toolId = e.dataTransfer.getData('application/milanote-tool') as ToolType || (window as any).__MILANOTE_DRAGGED_TOOL__;
    if (!toolId) return;

    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    const offset = toolId === 'nested_board' ? 40 : 20;
    onDropTool(toolId, Math.round(canvasPos.x - offset), Math.round(canvasPos.y - offset), undefined, false, targetBoardId);
  };

  const handleColumnDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumnId(null);

    const toolId = e.dataTransfer.getData('application/milanote-tool') as ToolType || (window as any).__MILANOTE_DRAGGED_TOOL__;
    if (!toolId) return;

    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    onDropTool(toolId, Math.round(canvasPos.x), Math.round(canvasPos.y), columnId);
  };

  const handleDetachOrMergeTask = useCallback((sourceElId: string, item: any, clientX: number, clientY: number) => {
    const sourceEl = elements.find((x) => x.id === sourceElId);
    if (!sourceEl || !sourceEl.content) return;

    let targetTaskList: Element | null = null;
    for (let i = 0; i < elements.length; i++) {
      const cand = elements[i];
      if (cand.id === sourceElId || cand.element_type !== 'task_list') continue;
      const tDiv = document.getElementById(`milanote-el-${cand.id}`);
      if (tDiv) {
        const rect = tDiv.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          targetTaskList = cand;
          break;
        }
      }
    }

    const updatedSourceItems = (sourceEl.content.items || []).filter((i: any) => i.id !== item.id);
    onContentChange(sourceElId, { ...sourceEl.content, items: updatedSourceItems });

    if (targetTaskList) {
      const targetItems = (targetTaskList.content?.items || []) as any[];
      onContentChange(targetTaskList.id, { ...targetTaskList.content, items: [...targetItems, item] });
    } else {
      const canvasPos = screenToCanvas(clientX, clientY);
      let foundColId: string | undefined = undefined;
      for (let j = 0; j < columns.length; j++) {
        const col = columns[j];
        const colDiv = document.getElementById(`milanote-el-${col.id}`);
        if (colDiv) {
          const rect = colDiv.getBoundingClientRect();
          if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            foundColId = col.id;
            break;
          }
        }
      }
      onCreateTaskListFromItem(Math.round(canvasPos.x - 170), Math.round(canvasPos.y - 20), item, foundColId);
    }
  }, [elements, onContentChange, screenToCanvas, columns, onCreateTaskListFromItem]);

  const renderCardContent = (el: Element, inColumn: boolean = false, customMouseDown?: (e: React.MouseEvent, el: Element) => void) => {
    const isEditing = editingElementId === el.id;

    if (el.element_type === 'nested_board') {
      const badge = getBoardBadgeStyle(el.content.title, el.content.custom_icon);
      const BadgeIcon = badge.Icon;
      const boardBg = el.style?.board_gradient || el.style?.board_color || badge.badgeBg;

      if (inColumn) {
        return (
          <div
            id={`milanote-el-${el.id}`}
            className={`column-board-row column-inner-card ${selectedElementId === el.id ? 'selected' : ''} ${activeDragId === el.id ? 'dragging' : ''} ${(hoveredBoardId === el.id || (el.content?.target_board_id && hoveredBoardId === el.content.target_board_id)) ? 'hover-enter-target' : ''}`}
            style={activeDragId === el.id && dragRef.current?.hasExceededThreshold ? { zIndex: 999999 } : undefined}
            onMouseDown={(e) => {
              if (customMouseDown) {
                customMouseDown(e, el);
              } else {
                handleElementMouseDown(e, el, false, undefined, true);
              }
            }}
            onDoubleClick={(e) => { e.stopPropagation(); onOpenBoard(el.content.shortcut_target_id || el.id); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, el); }}
          >
            <div className="column-board-icon-box" style={{ background: boardBg, position: 'relative' }}>
              {BadgeIcon && <BadgeIcon size={22} color="#ffffff" />}
              {(el.content.is_shortcut || el.content.shortcut_target_id) && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-2px',
                    left: '-2px',
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#1c1f26',
                    border: '1.5px solid #ffffff',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                  }}
                  title="Board Shortcut"
                >
                  <CornerUpRight size={10} color="#ffffff" strokeWidth={3} />
                </div>
              )}
            </div>
            {selectedElementId === el.id && (
              <div
                className="card-quick-connect-handle"
                title="Drag to connect"
                onMouseDown={(e) => handleQuickConnectStart(e, el)}
              />
            )}
            <div className="column-board-info">
              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  className="board-inline-rename-input"
                  defaultValue={el.content.title || 'New Board'}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    onContentChange(el.id, { ...el.content, title: e.target.value });
                    onSetEditingElement(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      e.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <div 
                  className="column-board-title" 
                  onDoubleClick={(e) => { e.stopPropagation(); onSetEditingElement(el.id); }}
                  title="Double-click name to rename board"
                >
                  {el.content.title || 'New Board'}
                </div>
              )}
              <div className="column-board-subtitle">{badge.cards}</div>
            </div>
          </div>
        );
      }
      return null;
    }

    if (el.element_type === 'link') {
      const hasUrl = Boolean(el.content.url && el.content.url.trim().length > 0);
      if (!isEditing && hasUrl) {
        return (
          <RichLinkPreview
            el={el}
            onSetEditingElement={onSetEditingElement}
            onContentChange={onContentChange}
            isRenaming={renamingLinkId === el.id}
            onFinishRenaming={() => onSetRenamingLink?.(null)}
          />
        );
      }

      return (
        <div className="link-card-content" onDoubleClick={(e) => { e.stopPropagation(); onSetEditingElement(el.id); }}>
          <LinkIcon size={18} color="#73747d" />
          <input
            type="text"
            className="link-input"
            autoFocus={isEditing}
            value={el.content.url || ''}
            readOnly={!isEditing}
            onChange={(e) => onContentChange(el.id, { ...el.content, url: e.target.value })}
            onBlur={() => onSetEditingElement?.(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.currentTarget.blur();
              }
            }}
            placeholder="Enter a link URL (e.g. youtube.com/...)"
          />
        </div>
      );
    }

    if (el.element_type === 'task_list') {
      return (
        <TaskListCard
          el={el}
          isEditing={isEditing}
          onContentChange={onContentChange}
          onSetEditingElement={onSetEditingElement}
          onDetachOrMergeTask={handleDetachOrMergeTask}
          isMergeTarget={dragOverTaskListId === el.id}
          onDeleteElement={onDeleteElement}
        />
      );
    }

    if (el.element_type === 'image') {
      return (
        <div className="column-image-card" style={{ background: Boolean(el.content?.show_caption) ? 'rgb(51, 51, 51)' : 'transparent', borderRadius: 0, overflow: 'hidden' }} onDoubleClick={(e) => { e.stopPropagation(); onSetEditingElement(el.id); }}>
          <div className="image-photo-wrap" style={(!inColumn && Boolean(el.content?.show_caption) && el.height) ? { height: `${el.height}px`, borderRadius: 0 } : { borderRadius: 0 }}>
            <img
              src={el.content.url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80'}
              alt="Art"
              style={{ borderRadius: 0 }}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (!inColumn && img.naturalWidth && img.naturalHeight) {
                  const naturalAspect = img.naturalWidth / img.naturalHeight;
                  const currentWidth = el.width || 340;
                  const currentHeight = el.height || 220;
                  const currentAspect = currentWidth / currentHeight;
                  if (Math.abs(naturalAspect - currentAspect) > 0.02) {
                    const optimalHeight = Math.max(40, Math.round(currentWidth / naturalAspect));
                    onUpdateElementPositions([{ id: el.id, x: el.x, y: el.y, width: currentWidth, height: optimalHeight, z_index: el.z_index || 10 }]);
                  }
                }
              }}
            />
          </div>
          {Boolean(el.content?.show_caption) && (
            <div 
              style={{ background: 'rgb(51, 51, 51)', padding: '8px 12px', width: '100%', minHeight: '56px', display: 'flex', flexDirection: 'column', justifyContent: 'center', cursor: isEditing ? 'text' : 'pointer' }} 
              onMouseDown={(e) => {
                e.stopPropagation();
                if (selectedElementId !== el.id) onSelectElement(el.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSetEditingElement(el.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isEditing) onSetEditingElement(el.id);
              }}
            >
              <div
                className="note-rich-editor image-caption-editor"
                contentEditable={isEditing}
                suppressContentEditableWarning={true}
                data-placeholder="Add a caption..."
                style={{ color: '#e4ebf7', minHeight: '20px', outline: 'none', fontSize: '13.5px' }}
                onBlur={(e) => {
                  if (el.content.caption !== e.currentTarget.innerHTML) {
                    onContentChange(el.id, { ...el.content, caption: e.currentTarget.innerHTML });
                  }
                }}
                dangerouslySetInnerHTML={{ __html: el.content.caption || '' }}
              />
            </div>
          )}
        </div>
      );
    }

    if (el.element_type === 'table') {
      const isSelected = selectedElementId === el.id || selectedIds.includes(el.id) || isEditing;
      const rows = el.content.rows || 4;
      const cols = el.content.columns || 4;
      const totalCells = rows * cols;
      const colWidths: number[] = Array.isArray(el.content.colWidths) ? el.content.colWidths : Array(cols).fill(100);
      const rowHeights: number[] = Array.isArray(el.content.rowHeights) ? el.content.rowHeights : Array(rows).fill(38);
      const gridColsCss = Array.from({ length: cols }, (_, i) => `${colWidths[i] || 100}px`).join(' ');
      const gridRowsCss = Array.from({ length: rows }, (_, i) => `${rowHeights[i] || 38}px`).join(' ');

      const isCellSelected = (cellIndex: number) => 
        isSelected && (
          (selectedTableCells && selectedTableCells.tableId === el.id && selectedTableCells.cellIndices.includes(cellIndex)) || 
          (selectedTableCell?.tableId === el.id && selectedTableCell?.cellIndex === cellIndex)
        );
      const isCellEditing = (cellIndex: number) => isSelected && editingTableCell?.tableId === el.id && editingTableCell?.cellIndex === cellIndex;
      const showTitle = Boolean(el.content.show_title);
      const showCaption = Boolean(el.content.show_caption);

      return (
        <div className={`milanote-table-wrapper ${isSelected ? 'show-headers' : 'no-headers'}`} style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column' }}>
          {isSelected && (
            <div className="table-col-headers-absolute" style={{ display: 'grid', gridTemplateColumns: gridColsCss }}>
              {Array.from({ length: cols }, (_, i) => i).map((colIdx) => {
                const colLetter = getColLetter(colIdx);
                const isColHighlighted = Array.from({ length: rows }, (_, r) => r * cols + colIdx + 1).some((cellIdx) => isCellSelected(cellIdx));
                return (
                  <div 
                    key={colIdx} 
                    className={`table-col-header-item ${isColHighlighted ? 'highlighted' : ''}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (selectedElementId !== el.id) onSelectElement(el.id);
                      const colCells = Array.from({ length: rows }, (_, r) => r * cols + colIdx + 1);
                      setSelectedTableCell({ tableId: el.id, cellIndex: colCells[0] });
                      onSelectTableCells({ tableId: el.id, cellIndices: colCells });
                      setEditingTableCell(null);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (selectedElementId !== el.id) onSelectElement(el.id);
                      const colCells = Array.from({ length: rows }, (_, r) => r * cols + colIdx + 1);
                      setSelectedTableCell({ tableId: el.id, cellIndex: colCells[0] });
                      onSelectTableCells({ tableId: el.id, cellIndices: colCells });
                      setEditingTableCell(null);
                      onContextMenu(e, el, undefined, { tableId: el.id, type: 'column', colIndex: colIdx, cellIndices: colCells });
                    }}
                  >
                    <span>{colLetter}</span>
                    <div 
                      className="col-resize-handle" 
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const val = { type: 'col' as const, tableId: el.id, index: colIdx, startX: e.clientX, startY: e.clientY, startValue: colWidths[colIdx] || 100 };
                        headerResizeRef.current = val;
                        setHeaderResize(val);
                      }} 
                    />
                  </div>
                );
              })}
            </div>
          )}
          {showTitle && (
            <div className="table-title-container" style={{ padding: '14px 14px 10px 14px', textAlign: 'center', background: 'var(--milanote-card-bg)', borderBottom: '1px solid #383b42' }} onMouseDown={(e) => e.stopPropagation()}>
              <input
                type="text"
                className="table-title-input"
                value={el.content.title !== undefined ? el.content.title : 'New Table'}
                onChange={(e) => onContentChange(el.id, { ...el.content, title: e.target.value })}
                placeholder="Add a title..."
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#b0b5be', fontSize: '15px', fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: 'serif' }}
              />
            </div>
          )}
          <div style={{ position: 'relative', width: '100%' }}>
            {isSelected && (
              <>
                <div style={{ position: 'relative' }}>
                  <div className="table-row-indices-absolute" style={{ display: 'grid', gridTemplateRows: gridRowsCss }}>
                    {Array.from({ length: rows }, (_, i) => i + 1).map((r) => {
                      const isRowHighlighted = Array.from({ length: cols }, (_, c) => (r - 1) * cols + c + 1).some((cellIdx) => isCellSelected(cellIdx));
                      return (
                        <div 
                          key={r} 
                          className={`table-row-index-item ${isRowHighlighted ? 'highlighted' : ''}`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          if (selectedElementId !== el.id) onSelectElement(el.id);
                          const rowCells = Array.from({ length: cols }, (_, c) => (r - 1) * cols + c + 1);
                          setSelectedTableCell({ tableId: el.id, cellIndex: rowCells[0] });
                          onSelectTableCells({ tableId: el.id, cellIndices: rowCells });
                          setEditingTableCell(null);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (selectedElementId !== el.id) onSelectElement(el.id);
                          const rowCells = Array.from({ length: cols }, (_, c) => (r - 1) * cols + c + 1);
                          setSelectedTableCell({ tableId: el.id, cellIndex: rowCells[0] });
                          onSelectTableCells({ tableId: el.id, cellIndices: rowCells });
                          setEditingTableCell(null);
                          onContextMenu(e, el, undefined, { tableId: el.id, type: 'row', rowIndex: r - 1, cellIndices: rowCells });
                        }}
                      >
                        <span>{r}</span>
                        <div 
                          className="row-resize-handle" 
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const val = { type: 'row' as const, tableId: el.id, index: r - 1, startX: e.clientX, startY: e.clientY, startValue: rowHeights[r - 1] || 38 };
                            headerResizeRef.current = val;
                            setHeaderResize(val);
                          }} 
                        />
                      </div>
                    );
                  })}
                  </div>
                  <div className="table-grid" style={{ display: 'grid', gridTemplateColumns: gridColsCss, gridTemplateRows: gridRowsCss, overflow: 'visible' }}>
                    {Array.from({ length: totalCells }, (_, i) => i + 1).map((cellIndex) => {
                      const cellStyle = el.content.cellStyles?.[cellIndex] || {};
                      const cellType = el.content.cellTypes?.[cellIndex]?.type || 'auto';
                      const cellValue = (el.content.cells && el.content.cells[cellIndex]) !== undefined ? el.content.cells[cellIndex] : '';
                      const isEditingCell = isCellEditing(cellIndex);
                      const isSelectedCell = isCellSelected(cellIndex);

                      const displayValue = (!isEditingCell && typeof cellValue === 'string' && cellValue.startsWith('=')) 
                        ? evaluateFormula(cellValue, el.content.cells || {}, cols, rows) 
                        : cellValue;

                      const customCssStyle: React.CSSProperties = {
                        width: '100%',
                        color: cellStyle.textColor || undefined,
                        backgroundColor: cellStyle.cellColor || undefined,
                        textAlign: (cellStyle.alignX as any) || 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: cellStyle.alignY === 'middle' ? 'center' : cellStyle.alignY === 'bottom' ? 'flex-end' : 'flex-start',
                      };

                      const isCheckboxChecked = cellValue === 'true' || cellValue === '1' || cellValue === 'checked' || Boolean(el.content.cellTypes?.[cellIndex]?.checked);
                      const defaultAlignX = cellStyle.alignX === 'left' ? 'flex-start' : cellStyle.alignX === 'right' ? 'flex-end' : 'center';
                      const defaultAlignY = cellStyle.alignY === 'top' ? 'flex-start' : cellStyle.alignY === 'bottom' ? 'flex-end' : 'center';

                      return (
                        <div 
                          key={cellIndex} 
                          style={{ position: 'relative', display: 'flex', width: '100%' }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isSelected) onSelectElement(el.id);
                            if (!isCellSelected(cellIndex)) {
                              setSelectedTableCell({ tableId: el.id, cellIndex });
                              onSelectTableCells({ tableId: el.id, cellIndices: [cellIndex] });
                            }
                            const curIndices = (selectedTableCells && selectedTableCells.tableId === el.id && selectedTableCells.cellIndices.includes(cellIndex))
                              ? selectedTableCells.cellIndices
                              : [cellIndex];
                            const r = Math.floor((cellIndex - 1) / cols);
                            const c = (cellIndex - 1) % cols;
                            onContextMenu(e, el, undefined, { tableId: el.id, type: 'cell', rowIndex: r, colIndex: c, cellIndices: curIndices });
                          }}
                        >
                          {cellType === 'checkbox' ? (
                            <div
                              className={`table-cell ${isSelectedCell ? 'selected-cell' : ''}`}
                              style={{ ...customCssStyle, alignItems: defaultAlignX as any, justifyContent: defaultAlignY as any }}
                              onMouseDown={(e) => {
                                if (!isSelected) {
                                  onSelectElement(el.id);
                                  setSelectedTableCell(null);
                                  onSelectTableCells(null);
                                  setEditingTableCell(null);
                                  return;
                                }
                                e.stopPropagation();
                                setTableCellDragStart({ tableId: el.id, startIndex: cellIndex });
                                if (!isSelectedCell) {
                                  setSelectedTableCell({ tableId: el.id, cellIndex });
                                  onSelectTableCells({ tableId: el.id, cellIndices: [cellIndex] });
                                  setEditingTableCell(null);
                                } else {
                                  const nextVal = !isCheckboxChecked ? 'true' : 'false';
                                  onContentChange(el.id, { 
                                    ...el.content, 
                                    cells: { ...(el.content.cells || {}), [cellIndex]: nextVal },
                                    cellTypes: { ...(el.content.cellTypes || {}), [cellIndex]: { type: 'checkbox', checked: !isCheckboxChecked } }
                                  });
                                }
                              }}
                              onMouseEnter={(e) => {
                                if (tableCellDragStart && tableCellDragStart.tableId === el.id && e.buttons === 1) {
                                  const rangeIndices = getCellRange(tableCellDragStart.startIndex, cellIndex, cols);
                                  onSelectTableCells({ tableId: el.id, cellIndices: rangeIndices });
                                  setEditingTableCell(null);
                                }
                              }}
                              onMouseUp={() => {
                                if (tableCellDragStart) setTableCellDragStart(null);
                              }}
                            >
                              <span className="table-cell-checkbox-wrap">
                                <input type="checkbox" checked={isCheckboxChecked} readOnly style={{ pointerEvents: 'none', width: '15px', height: '15px', accentColor: '#33a1fd' }} />
                              </span>
                            </div>
                          ) : (
                            <div
                              className={`table-cell ${isSelectedCell ? 'selected-cell' : ''}`}
                              style={customCssStyle}
                              contentEditable={isEditingCell}
                              suppressContentEditableWarning
                              onMouseDown={(e) => {
                                if (!isSelected) {
                                  onSelectElement(el.id);
                                  setSelectedTableCell(null);
                                  onSelectTableCells(null);
                                  setEditingTableCell(null);
                                  return;
                                }

                                e.stopPropagation();
                                setTableCellDragStart({ tableId: el.id, startIndex: cellIndex });

                                if (!isSelectedCell) {
                                  setSelectedTableCell({ tableId: el.id, cellIndex });
                                  onSelectTableCells({ tableId: el.id, cellIndices: [cellIndex] });
                                  setEditingTableCell(null);
                                } else if (!isEditingCell) {
                                  setEditingTableCell({ tableId: el.id, cellIndex });
                                  setTimeout(() => {
                                    e.currentTarget.focus();
                                    const range = document.createRange();
                                    const sel = window.getSelection();
                                    if (e.currentTarget && e.currentTarget.childNodes.length > 0 && sel) {
                                      range.selectNodeContents(e.currentTarget);
                                      range.collapse(false);
                                      sel.removeAllRanges();
                                      sel.addRange(range);
                                    }
                                  }, 10);
                                }
                              }}
                              onMouseEnter={(e) => {
                                if (tableCellDragStart && tableCellDragStart.tableId === el.id && e.buttons === 1) {
                                  const rangeIndices = getCellRange(tableCellDragStart.startIndex, cellIndex, cols);
                                  onSelectTableCells({ tableId: el.id, cellIndices: rangeIndices });
                                  setEditingTableCell(null);
                                }
                              }}
                              onMouseUp={() => {
                                if (tableCellDragStart) setTableCellDragStart(null);
                              }}
                              onBlur={(e) => {
                                const updatedCells = { ...(el.content.cells || {}), [cellIndex]: e.currentTarget.textContent };
                                onContentChange(el.id, { ...el.content, cells: updatedCells });
                              }}
                            >
                              {displayValue}
                            </div>
                          )}

                          {isEditingCell && typeof cellValue === 'string' && cellValue.startsWith('=') && (
                            <div className="formula-autocomplete-popup" contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>
                              {[
                                { label: 'SUM', desc: 'Adds all numbers in range' },
                                { label: 'IF', desc: 'Conditional boolean test' },
                                { label: 'MIN', desc: 'Minimum value' },
                                { label: 'MAX', desc: 'Maximum value' },
                                { label: 'COUNT', desc: 'Count numerical cells' },
                                { label: 'AVERAGE', desc: 'Arithmetic mean' },
                              ].map((fn) => (
                                <button
                                  key={fn.label}
                                  className="formula-autocomplete-item"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const nextVal = `=${fn.label}()`;
                                    onContentChange(el.id, { ...el.content, cells: { ...(el.content.cells || {}), [cellIndex]: nextVal } });
                                    setEditingTableCell({ tableId: el.id, cellIndex });
                                  }}
                                >
                                  <span>{fn.label}</span>
                                  <span style={{ fontSize: '11px', opacity: 0.6 }}>{fn.desc}</span>
                                </button>
                              ))}
                              <div className="formula-autocomplete-item help-footer">
                                View formula help &gt;
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            {!isSelected && (
              <div className="table-grid" style={{ display: 'grid', gridTemplateColumns: gridColsCss, gridTemplateRows: gridRowsCss, overflow: 'visible' }}>
                {Array.from({ length: totalCells }, (_, i) => i + 1).map((cellIndex) => {
                  const cellStyle = el.content.cellStyles?.[cellIndex] || {};
                  const cellType = el.content.cellTypes?.[cellIndex]?.type || 'auto';
                  const cellValue = (el.content.cells && el.content.cells[cellIndex]) !== undefined ? el.content.cells[cellIndex] : '';
                  const displayValue = (typeof cellValue === 'string' && cellValue.startsWith('=')) 
                    ? evaluateFormula(cellValue, el.content.cells || {}, cols, rows) 
                    : cellValue;

                  const customCssStyle: React.CSSProperties = {
                    width: '100%',
                    color: cellStyle.textColor || undefined,
                    backgroundColor: cellStyle.cellColor || undefined,
                    textAlign: (cellStyle.alignX as any) || 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: cellStyle.alignY === 'middle' ? 'center' : cellStyle.alignY === 'bottom' ? 'flex-end' : 'flex-start',
                  };

                  const isCheckboxChecked = cellValue === 'true' || cellValue === '1' || cellValue === 'checked' || Boolean(el.content.cellTypes?.[cellIndex]?.checked);
                  const defaultAlignX = cellStyle.alignX === 'left' ? 'flex-start' : cellStyle.alignX === 'right' ? 'flex-end' : 'center';
                  const defaultAlignY = cellStyle.alignY === 'top' ? 'flex-start' : cellStyle.alignY === 'bottom' ? 'flex-end' : 'center';

                  return (
                    <div key={cellIndex} style={{ position: 'relative', display: 'flex', width: '100%' }}>
                      {cellType === 'checkbox' ? (
                        <div
                          className="table-cell"
                          style={{ ...customCssStyle, alignItems: defaultAlignX as any, justifyContent: defaultAlignY as any }}
                          onMouseDown={(e) => {
                            onSelectElement(el.id);
                            setSelectedTableCell(null);
                            onSelectTableCells(null);
                            setEditingTableCell(null);
                          }}
                        >
                          <span className="table-cell-checkbox-wrap">
                            <input type="checkbox" checked={isCheckboxChecked} readOnly style={{ pointerEvents: 'none', width: '15px', height: '15px', accentColor: '#33a1fd' }} />
                          </span>
                        </div>
                      ) : (
                        <div
                          className="table-cell"
                          style={customCssStyle}
                          onMouseDown={(e) => {
                            onSelectElement(el.id);
                            setSelectedTableCell(null);
                            onSelectTableCells(null);
                            setEditingTableCell(null);
                          }}
                        >
                          {displayValue}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {showCaption && (
            <div className="table-caption-container" style={{ padding: '12px 14px 14px 14px', background: 'var(--milanote-card-bg)', borderTop: '1px solid #383b42' }} onMouseDown={(e) => e.stopPropagation()}>
              <input
                type="text"
                className="table-caption-input"
                value={el.content.caption !== undefined ? el.content.caption : ''}
                onChange={(e) => onContentChange(el.id, { ...el.content, caption: e.target.value })}
                placeholder="Add a description"
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#818691', fontSize: '13px', outline: 'none' }}
              />
            </div>
          )}
        </div>
      );
    }
    if (el.element_type === 'comment') {
      return (
        <CommentCard
          el={el}
          elements={elements}
          isDragging={activeDragId === el.id}
          isSelected={selectedElementId === el.id || selectedIds.includes(el.id)}
          onContentChange={onContentChange}
        />
      );
    }

    const isLightBg = isLightColor(el.style?.background_color);
    const textColor = isLightBg ? '#2d3340' : '#e4ebf7';

    return (
      <div 
        style={{ width: '100%', height: '100%', minHeight: '26px', cursor: isEditing ? 'text' : 'grab', position: 'relative', color: textColor }} 
        onDoubleClick={(e) => { e.stopPropagation(); onSetEditingElement(el.id); }}
      >
        <div
          className="note-rich-editor"
          contentEditable={isEditing}
          suppressContentEditableWarning={true}
          data-placeholder="Start typing..."
          style={{ color: 'inherit' }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              e.stopPropagation();
              const selection = window.getSelection();
              if (!selection || selection.rangeCount === 0) return;
              
              let node: Node | null = selection.anchorNode;
              let inList = false;
              while (node && node !== e.currentTarget) {
                if (node.nodeName === 'LI' || node.nodeName === 'UL' || node.nodeName === 'OL') {
                  inList = true;
                  break;
                }
                node = node.parentNode;
              }

              if (inList) {
                if (e.shiftKey) {
                  document.execCommand('outdent', false, undefined);
                } else {
                  document.execCommand('indent', false, undefined);
                }
              } else {
                if (!e.shiftKey) {
                  if (!document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')) {
                    document.execCommand('insertText', false, '        ');
                  }
                }
              }
            }
          }}
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (isEditing || target.closest('a') || target.closest('.milanote-inline-comment')) {
              e.stopPropagation();
            }
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            const commentSpan = target.closest('.milanote-inline-comment') as HTMLElement | null;
            if (commentSpan) {
              e.stopPropagation();
              const commentId = commentSpan.getAttribute('data-comment-id');
              if (commentId) {
                const rect = commentSpan.getBoundingClientRect();
                setActiveInlineComment({
                  elementId: el.id,
                  commentId,
                  rect: { top: rect.bottom + 8, left: rect.right - 20 }
                });
                return;
              }
            }
            const linkTag = target.closest('a') as HTMLAnchorElement | null;
            if (linkTag) {
              e.preventDefault();
              e.stopPropagation();
              if (linkTag.href && linkTag.href.trim() !== '') {
                openExternalUrl(linkTag.href);
              }
            }
          }}
          onInput={(e) => {
            const target = e.currentTarget;
            const html = target.innerHTML;
            const text = target.textContent || '';
            const hasFormatting = html.includes('<ul') || html.includes('<ol') || html.includes('<li') || html.includes('text-align') || html.includes('&nbsp;') || html.includes('\u00A0') || html.includes('<h') || html.includes('<pre') || html.includes('<blockquote') || text.length > 0;
            if (text.trim() === '' && !hasFormatting) {
              if (target.innerHTML === '<br>' || target.innerHTML === '<div><br></div>' || target.innerHTML === '<p><br></p>') {
                target.innerHTML = '';
              }
            }
          }}
          onBlur={(e) => {
            const target = e.currentTarget;
            const text = target.textContent || '';
            const html = target.innerHTML;
            const hasFormatting = html.includes('<ul') || html.includes('<ol') || html.includes('<li') || html.includes('text-align') || html.includes('&nbsp;') || html.includes('\u00A0') || text.length > 0;
            const cleanText = (text.trim() === '' && !hasFormatting) ? '' : html;
            onContentChange(el.id, { ...el.content, text: cleanText });
          }}
          dangerouslySetInnerHTML={{
            __html: (() => {
              const text = el.content.text || '';
              const hasFormatting = text.includes('<ul') || text.includes('<ol') || text.includes('<li') || text.includes('text-align') || text.includes('&nbsp;') || text.includes('\u00A0');
              if (text.replace(/<[^>]*>/g, '').trim() === '' && !hasFormatting) {
                return '';
              }
              return text;
            })()
          }}
        />
      </div>
    );
  };

  const renderStandardCard = (el: Element, inColumn: boolean = false, customMouseDown?: (e: React.MouseEvent, el: Element) => void) => {
    if (el.element_type === 'nested_board' && inColumn) {
      return renderCardContent(el, true, customMouseDown);
    }

    const isSelected = selectedElementId === el.id || selectedIds.includes(el.id);
    const isDragging = activeDragId === el.id || Boolean(dragRef.current?.dragGroup.some(g => g.id === el.id));
    const isBoard = el.element_type === 'nested_board';
    const isEditing = editingElementId === el.id;

    if (el.element_type === 'column') {
      const isCollapsed = Boolean(el.style?.is_collapsed);
      const children = getColumnChildren(el.id);
      const boardCount = children.filter((c) => c.element_type === 'nested_board').length;
      const cardCount = children.length - boardCount;
      const countSubtitle = `${boardCount > 0 ? `${boardCount} board${boardCount > 1 ? 's' : ''}${cardCount > 0 ? ', ' : ''}` : ''}${cardCount > 0 ? `${cardCount} card${cardCount > 1 ? 's' : ''}` : (boardCount === 0 ? '0 cards' : '')}`;
      const dragItem = isDragging ? dragRef.current?.dragGroup.find(g => g.id === el.id) : null;
      const posX = (dragItem && dragItem.currentX !== undefined) ? dragItem.currentX : el.x;
      const posY = (dragItem && dragItem.currentY !== undefined) ? dragItem.currentY : el.y;
      const isActiveDrag = Boolean(isDragging && dragRef.current?.hasExceededThreshold && !inColumn);
      const screenPos = isActiveDrag ? canvasToScreen(posX, posY) : { x: 0, y: 0 };

      return (
        <React.Fragment key={el.id}>
          <div
            id={`milanote-el-${el.id}`}
            className={`milanote-card column-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isCollapsed ? 'collapsed' : ''} ${inColumn ? 'column-inner-card' : ''}`}
            style={inColumn ? {
              backgroundColor: el.style?.background_color || undefined,
              color: isLightColor(el.style?.background_color) ? '#2d3340' : undefined,
              width: '100%',
              height: 'auto',
              ...(isDragging && dragRef.current?.hasExceededThreshold ? { position: 'fixed', zIndex: 999999 } : {})
            } : {
              transform: `translate(${posX}px, ${posY}px)`,
              width: el.width || 340,
              zIndex: isDragging ? 99999 : (el.z_index || 5),
              backgroundColor: el.style?.background_color || undefined,
              color: isLightColor(el.style?.background_color) ? '#2d3340' : undefined,
              opacity: isActiveDrag ? 0 : 1,
            }}
            onMouseDown={(e) => {
              if (customMouseDown) {
                customMouseDown(e, el);
              } else {
                handleElementMouseDown(e, el, false, undefined, inColumn);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (dragOccurredRef.current) {
                dragOccurredRef.current = false;
                return;
              }
              if (e.ctrlKey || e.metaKey) return;
              if (selectedElementId === el.id && editingElementId !== el.id) {
                onSetEditingElement(el.id);
              } else if (selectedElementId !== el.id) {
                onSelectElement(el.id);
              }
            }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, el); }}
          >
            {Boolean(el.style?.top_strip_color) && (
              <div className="note-top-strip-bar" style={{ backgroundColor: el.style?.top_strip_color }} />
            )}
            <div className="column-header">
              <input
                className="column-title-serif"
                defaultValue={el.content.title || 'New Column'}
                onBlur={(e) => onContentChange(el.id, { ...el.content, title: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                ref={(input) => { if (editingElementId === el.id && input) input.focus(); }}
                style={{ color: isLightColor(el.style?.background_color) ? '#2d3340' : undefined }}
              />
              <div className="column-subtitle-cards" style={{ color: isLightColor(el.style?.background_color) ? '#4a5568' : undefined }}>{countSubtitle}</div>

              <button
                className="column-minimize-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextCollapsed = !isCollapsed;
                  onStyleChange(el.id, { ...(el.style || {}), is_collapsed: nextCollapsed });
                }}
                title={isCollapsed ? 'Expand column' : 'Minimize column'}
                style={{ color: isLightColor(el.style?.background_color) ? '#2d3340' : undefined }}
              >
                {isCollapsed ? '+' : '–'}
              </button>
            </div>

            {!isCollapsed && (
              <div
                className={`column-drop-well ${dragOverColumnId === el.id ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverColumnId(el.id);
                  let targetIdx = children.length;
                  for (let i = 0; i < children.length; i++) {
                    const childDiv = document.getElementById(`milanote-el-${children[i].id}`);
                    if (childDiv) {
                      const r = childDiv.getBoundingClientRect();
                      if (e.clientY < r.top + r.height / 2) {
                        targetIdx = i;
                        break;
                      }
                    }
                  }
                  setDropInsertIndex(targetIdx);
                }}
                onDragLeave={(e) => { e.stopPropagation(); setDragOverColumnId(null); setDropInsertIndex(null); }}
                onDrop={(e) => handleColumnDrop(e, el.id)}
              >
                {(() => {
                  const isDragActive = Boolean(activeDragId && dragRef.current?.hasExceededThreshold);
                  if (!isDragActive) {
                    if (children.length === 0) {
                      return <div className="column-empty-placeholder" />;
                    }
                    return children.map((child) => renderStandardCard(child, true));
                  }
                  const childNodes: React.ReactNode[] = [];
                  let nonDragIdx = 0;

                  if (children.length === 0) {
                    childNodes.push(<div key="empty-ph" className="column-empty-placeholder" />);
                  } else {
                    children.forEach((child) => {
                      const isDragged = child.id === activeDragId || Boolean(dragRef.current?.dragGroup.some(g => g.id === child.id));
                      if (!isDragged) {
                        if (dragOverColumnId === el.id && dropInsertIndex === nonDragIdx) {
                          childNodes.push(<div key={`drop-ind-${nonDragIdx}`} className="column-insertion-indicator" />);
                        }
                        childNodes.push(renderStandardCard(child, true));
                        nonDragIdx++;
                      } else {
                        childNodes.push(renderStandardCard(child, true));
                      }
                    });
                  }

                  if (dragOverColumnId === el.id && (dropInsertIndex === null || dropInsertIndex >= nonDragIdx)) {
                    childNodes.push(<div key="drop-ind-end" className="column-insertion-indicator" />);
                  }
                  return childNodes;
                })()}
              </div>
            )}

            {!inColumn && !el.style?.is_unsorted && (
              <>
                <div className="resize-handle-e" onMouseDown={(e) => handleElementMouseDown(e, el, true, 'e')} />
                <div className="card-diagonal-grip-se" onMouseDown={(e) => handleElementMouseDown(e, el, true, 'se')} />
              </>
            )}
          </div>

          {isActiveDrag && document.body && createPortal(
            <div
              id={`milanote-drag-portal-${el.id}`}
              className={`milanote-card column-card selected dragging ${isCollapsed ? 'collapsed' : ''}`}
              style={{
                position: 'fixed',
                left: `${screenPos.x}px`,
                top: `${screenPos.y}px`,
                width: el.width || 340,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                zIndex: 9999999,
                backgroundColor: el.style?.background_color || undefined,
                color: isLightColor(el.style?.background_color) ? '#2d3340' : undefined,
                boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
                pointerEvents: 'none',
              }}
            >
              {Boolean(el.style?.top_strip_color) && (
                <div className="note-top-strip-bar" style={{ backgroundColor: el.style?.top_strip_color }} />
              )}
              <div className="column-header">
                <input
                  className="column-title-serif"
                  readOnly
                  value={el.content.title || 'New Column'}
                  style={{ color: isLightColor(el.style?.background_color) ? '#2d3340' : undefined }}
                />
                <div className="column-subtitle-cards" style={{ color: isLightColor(el.style?.background_color) ? '#4a5568' : undefined }}>{countSubtitle}</div>
              </div>
              {!isCollapsed && (
                <div className="column-drop-well">
                  {children.length === 0 ? (
                    <div className="column-empty-placeholder" />
                  ) : (
                    children.map((child) => renderStandardCard(child, true))
                  )}
                </div>
              )}
            </div>,
            document.body
          )}
        </React.Fragment>
      );
    }

    if (isBoard && !inColumn) {
      const badge = getBoardBadgeStyle(el.content.title, el.content.custom_icon);
      const BadgeIcon = badge.Icon;
      const boardBg = el.style?.board_gradient || el.style?.board_color || badge.badgeBg;
      const dragItem = isDragging ? dragRef.current?.dragGroup.find(g => g.id === el.id) : null;
      const posX = (dragItem && dragItem.currentX !== undefined) ? dragItem.currentX : el.x;
      const posY = (dragItem && dragItem.currentY !== undefined) ? dragItem.currentY : el.y;
      const isActiveDrag = Boolean(isDragging && dragRef.current?.hasExceededThreshold);
      const screenPos = isActiveDrag ? canvasToScreen(posX, posY) : { x: 0, y: 0 };

      return (
        <React.Fragment key={el.id}>
          <div
            id={`milanote-el-${el.id}`}
            className={`board-card-vertical ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${(hoveredBoardId === el.id || (el.content?.target_board_id && hoveredBoardId === el.content.target_board_id)) ? 'hover-enter-target' : ''}`}
            style={{
              transform: `translate(${posX}px, ${posY}px)`,
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: isDragging ? 99999 : (el.z_index || 10),
              userSelect: 'none',
              opacity: isActiveDrag ? 0 : 1,
            }}
            onMouseDown={(e) => {
              if (customMouseDown) {
                customMouseDown(e, el);
              } else {
                handleElementMouseDown(e, el, false, undefined, false);
              }
            }}
            onDoubleClick={(e) => { e.stopPropagation(); onOpenBoard(el.content.shortcut_target_id || el.id); }}
            onClick={(e) => {
              e.stopPropagation();
              if (dragOccurredRef.current) {
                dragOccurredRef.current = false;
                return;
              }
              if (e.ctrlKey || e.metaKey) return;
              if (selectedElementId === el.id && editingElementId !== el.id) {
                onSetEditingElement(el.id);
              } else if (selectedElementId !== el.id) {
                onSelectElement(el.id);
              }
            }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, el); }}
          >
            <div className="board-icon-badge" style={{ background: boardBg, position: 'relative' }}>
              {BadgeIcon && <BadgeIcon size={36} color="#ffffff" />}
              {(el.content.is_shortcut || el.content.shortcut_target_id) && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-2px',
                    left: '-2px',
                    width: '24px',
                    height: '24px',
                    backgroundColor: '#1c1f26',
                    border: '2px solid #ffffff',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
                    zIndex: 2,
                  }}
                  title="Board Shortcut"
                >
                  <CornerUpRight size={15} color="#ffffff" strokeWidth={3} />
                </div>
              )}
            </div>
            {!inColumn && isSelected && (
              <div
                className="card-quick-connect-handle"
                title="Drag to connect"
                onMouseDown={(e) => handleQuickConnectStart(e, el)}
              />
            )}
            {isEditing ? (
              <input
                type="text"
                autoFocus
                className="board-inline-rename-input centered"
                defaultValue={el.content.title || 'New Board'}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  onContentChange(el.id, { ...el.content, title: e.target.value });
                  onSetEditingElement(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <div 
                className="board-title-text" 
                onDoubleClick={(e) => { e.stopPropagation(); onSetEditingElement(el.id); }}
                title="Double-click name to rename board"
              >
                {el.content.title || 'New Board'}
              </div>
            )}
            <div className="board-subtitle-text">{badge.cards}</div>
          </div>

          {isActiveDrag && document.body && createPortal(
            <div
              id={`milanote-drag-portal-${el.id}`}
              className="board-card-vertical selected dragging"
              style={{
                position: 'fixed',
                left: `${screenPos.x}px`,
                top: `${screenPos.y}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                zIndex: 9999999,
                pointerEvents: 'none',
              }}
            >
              <div className="board-icon-badge" style={{ background: boardBg }}>
                {BadgeIcon && <BadgeIcon size={36} color="#ffffff" />}
              </div>
              <div className="board-title-text">{el.content.title || 'New Board'}</div>
              <div className="board-subtitle-text">{badge.cards}</div>
            </div>,
            document.body
          )}
        </React.Fragment>
      );
    }

    const cardWidth = el.width || 340;
    const cardHeight = el.height || 60;
    const isCustomResizedVideo = el.element_type === 'link' && Boolean(el.content?.url && el.content.url.match(/youtube\.com|youtu\.be|vimeo|mp4|twitch/i)) && (el.height || 60) > 100;

    const isComment = el.element_type === 'comment';
    const isPinnedComment = isComment && Boolean(el.content?.is_pinned);
    const customBg = el.style?.background_color;
    const topStrip = el.style?.top_strip_color;
    const useDarkText = isLightColor(customBg);
    const dragItem = isDragging ? dragRef.current?.dragGroup.find(g => g.id === el.id) : null;
    const posX = (dragItem && dragItem.currentX !== undefined) ? dragItem.currentX : el.x;
    const posY = (dragItem && dragItem.currentY !== undefined) ? dragItem.currentY : el.y;
    const isActiveDrag = Boolean(isDragging && dragRef.current?.hasExceededThreshold && !inColumn);
    const screenPos = isActiveDrag ? canvasToScreen(posX, posY) : { x: 0, y: 0 };

    return (
      <React.Fragment key={el.id}>
        <div
          id={`milanote-el-${el.id}`}
          className={`milanote-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${inColumn ? 'column-inner-card' : ''} ${el.element_type === 'note' ? 'note-card-wrapper' : ''} ${el.element_type === 'task_list' ? 'task-list-card-wrapper' : ''} ${el.element_type === 'image' ? 'image-card-wrapper' : ''} ${el.element_type === 'image' && el.style?.is_transparent ? 'image-transparent' : ''} ${el.element_type === 'link' ? 'link-card-wrapper' : ''} ${el.element_type === 'link' && !Boolean(el.content?.url && el.content.url.trim().length > 0) ? 'link-empty-wrapper' : ''} ${el.element_type === 'table' ? 'table-card-wrapper' : ''} ${isComment ? 'comment-card-wrapper' : ''} ${dragOverTaskListId === el.id ? 'task-list-merge-target' : ''}`}
          style={inColumn ? {
            backgroundColor: customBg || undefined,
            color: useDarkText ? '#2d3340' : undefined,
            minHeight: (el.element_type === 'note' || el.element_type === 'task_list' || el.element_type === 'link') ? 60 : undefined,
            height: 'auto',
            ...(isDragging && dragRef.current?.hasExceededThreshold ? { position: 'fixed', zIndex: 999999 } : {})
          } : {
            transform: `translate(${posX}px, ${posY}px)`,
            width: el.element_type === 'table' ? 'fit-content' : (isPinnedComment ? 18 : cardWidth),
            height: (el.element_type === 'note' || el.element_type === 'task_list' || isComment || (el.element_type === 'link' && !isCustomResizedVideo) || (el.element_type === 'image' && (inColumn || Boolean(el.content?.show_caption))) || el.element_type === 'table') ? 'auto' : cardHeight,
            minHeight: (el.element_type === 'note' || el.element_type === 'task_list' || (el.element_type === 'link' && !isCustomResizedVideo)) ? 60 : ((isComment || el.element_type === 'table') ? 0 : cardHeight),
            zIndex: isDragging ? 99999 : (isComment ? 50000 + (el.z_index || 0) : (el.z_index || 10)),
            backgroundColor: customBg || undefined,
            color: useDarkText ? '#2d3340' : undefined,
            opacity: isActiveDrag ? 0 : 1,
          }}
          onMouseDown={(e) => {
            if (customMouseDown) {
              customMouseDown(e, el);
            } else {
              handleElementMouseDown(e, el, false, undefined, inColumn);
            }
          }}
          onDoubleClick={(e) => { e.stopPropagation(); onSetEditingElement(el.id); }}
          onClick={(e) => {
            e.stopPropagation();
            if (dragOccurredRef.current) {
              dragOccurredRef.current = false;
              return;
            }
            if (e.ctrlKey || e.metaKey) return;
            if (selectedElementId === el.id && editingElementId !== el.id) {
              onSetEditingElement(el.id);
            } else if (selectedElementId !== el.id) {
              onSelectElement(el.id);
            }
          }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, el); }}
        >
          {Boolean(topStrip) && !isComment && (
            <div className="note-top-strip-bar" style={{ backgroundColor: topStrip }} />
          )}
          <div className="card-body">
            {renderCardContent(el, inColumn, customMouseDown)}
          </div>

          {!inColumn && !isComment && el.element_type !== 'task_list' && (
            <>
              <div className="card-diagonal-grip-se" onMouseDown={(e) => handleElementMouseDown(e, el, true, 'se')} />
              {el.element_type !== 'image' && (
                <div className="resize-handle-e" onMouseDown={(e) => handleElementMouseDown(e, el, true, 'e')} />
              )}
            </>
          )}
          {isSelected && (
            <div
              className="card-quick-connect-handle"
              title="Drag to connect"
              onMouseDown={(e) => handleQuickConnectStart(e, el)}
            />
          )}
        </div>

        {isActiveDrag && document.body && createPortal(
          <div
            id={`milanote-drag-portal-${el.id}`}
            className={`milanote-card selected dragging ${el.element_type === 'note' ? 'note-card-wrapper' : ''} ${el.element_type === 'task_list' ? 'task-list-card-wrapper' : ''} ${el.element_type === 'image' ? 'image-card-wrapper' : ''} ${el.element_type === 'image' && el.style?.is_transparent ? 'image-transparent' : ''} ${el.element_type === 'link' ? 'link-card-wrapper' : ''} ${el.element_type === 'link' && !Boolean(el.content?.url && el.content.url.trim().length > 0) ? 'link-empty-wrapper' : ''} ${el.element_type === 'table' ? 'table-card-wrapper' : ''} ${isComment ? 'comment-card-wrapper' : ''}`}
            style={{
              position: 'fixed',
              left: `${screenPos.x}px`,
              top: `${screenPos.y}px`,
              width: el.element_type === 'table' ? 'fit-content' : (isPinnedComment ? 18 : cardWidth),
              height: (el.element_type === 'note' || el.element_type === 'task_list' || isComment || (el.element_type === 'link' && !isCustomResizedVideo) || (el.element_type === 'image' && Boolean(el.content?.show_caption)) || el.element_type === 'table') ? 'auto' : cardHeight,
              minHeight: (el.element_type === 'note' || el.element_type === 'task_list' || (el.element_type === 'link' && !isCustomResizedVideo)) ? 60 : ((isComment || el.element_type === 'table') ? 0 : cardHeight),
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              zIndex: 9999999,
              backgroundColor: customBg || undefined,
              color: useDarkText ? '#2d3340' : undefined,
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
              pointerEvents: 'none',
            }}
          >
            {Boolean(topStrip) && !isComment && (
              <div className="note-top-strip-bar" style={{ backgroundColor: topStrip }} />
            )}
            <div className="card-body">
              {renderCardContent(el, false)}
            </div>
          </div>,
          document.body
        )}
      </React.Fragment>
    );
  };

  const selectionRect = selectionBox ? {
    left: Math.min(selectionBox.startX, selectionBox.currentX),
    top: Math.min(selectionBox.startY, selectionBox.currentY),
    width: Math.abs(selectionBox.currentX - selectionBox.startX),
    height: Math.abs(selectionBox.currentY - selectionBox.startY)
  } : null;

  const dotAlpha = 0.09;
  const dotRadius = Math.max(0.8, Number((scale * 0.9).toFixed(2)));

  return (
    <div
      ref={containerRef}
      className="canvas-viewport"
      data-pan-x={pan.x}
      data-pan-y={pan.y}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        if (target === containerRef.current || target.classList.contains('canvas-viewport') || target.classList.contains('canvas-plane') || target.classList.contains('canvas-viewport-grid')) {
          onContextMenu(e, null, screenToCanvas(e.clientX, e.clientY));
        }
      }}
    >
      <div
        className="canvas-viewport-grid"
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          backgroundSize: `${11 * scale}px ${11 * scale}px`,
          backgroundImage: scale >= 1.0 ? `radial-gradient(rgba(255, 255, 255, ${dotAlpha}) ${dotRadius}px, transparent 0)` : 'none',
        }}
      />

      <div
        className="canvas-plane"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        }}
      >
        {selectionRect && (
          <div
            className="rubber-band-selection"
            style={{
              left: selectionRect.left,
              top: selectionRect.top,
              width: selectionRect.width,
              height: selectionRect.height,
            }}
          />
        )}

        {/* INTERACTIVE LINES LAYER (BASE SVG UNDER CARDS FOR UNSELECTED LINES) */}
        <svg
          className="milanote-lines-layer"
          style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', overflow: 'visible', zIndex: 12, pointerEvents: 'none' }}
        >
          <defs>
            {lineElements.map((el) => {
              const col = el.style?.line_color || '#a8b0c0';
              const sArrow = el.style?.start_arrow || 'none';
              const eArrow = el.style?.end_arrow === undefined ? 'arrow' : el.style?.end_arrow;
              const markerSize = 8 + (el.style?.line_weight || 2);
              return (
                <React.Fragment key={`defs-${el.id}`}>
                  {sArrow === 'arrow' && (
                    <marker id={`arrow-start-${el.id}`} viewBox="0 0 10 10" refX="2" refY="5" markerUnits="userSpaceOnUse" markerWidth={markerSize} markerHeight={markerSize} orient="auto">
                      <path d="M 10 0 L 0 5 L 10 10 z" fill={col} />
                    </marker>
                  )}
                  {eArrow === 'arrow' && (
                    <marker id={`arrow-end-${el.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth={markerSize} markerHeight={markerSize} orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={col} />
                    </marker>
                  )}
                </React.Fragment>
              );
            })}
          </defs>

          {lineElements.map((el) => {
            const isSelected = selectedElementId === el.id || selectedIds.includes(el.id);
            const content = (lineDragPreview?.lineId === el.id ? lineDragPreview.content : el.content) || {};
            const style = el.style || {};
            const col = style.line_color || '#a8b0c0';
            const weight = style.line_weight || 2;
            const isDashed = Boolean(style.is_dashed);
            const sArrow = style.start_arrow || 'none';
            const eArrow = style.end_arrow === undefined ? 'arrow' : style.end_arrow;

            const s = computeLineEndpoint(el, content, true);
            const e = computeLineEndpoint(el, content, false);
            const { main } = computeBezierCurve(s, e, content);

            const isInteracting = isSelected || activeLineHandleDrag === el.id;

            return (
              <g key={el.id}>
                {/* INVISIBLE WIDER HIT TARGET FOR CLICK SELECTING AND DRAGGING LINE */}
                <path
                  d={`M ${main.p0.x} ${main.p0.y} Q ${main.p1.x} ${main.p1.y} ${main.p2.x} ${main.p2.y}`}
                  stroke="transparent"
                  strokeWidth={Math.max(16, weight + 12)}
                  fill="none"
                  style={{ cursor: 'move', pointerEvents: 'auto' }}
                  onClick={(evt) => {
                    evt.stopPropagation();
                    onSelectElement(el.id);
                  }}
                  onMouseDown={(evt) => {
                    evt.stopPropagation();
                    onSelectElement(el.id);
                    const sPt = computeLineEndpoint(el, content, true);
                    const ePt = computeLineEndpoint(el, content, false);
                    const connectedIds: string[] = [];
                    if (content.start_target_id) connectedIds.push(content.start_target_id);
                    if (content.end_target_id && !connectedIds.includes(content.end_target_id)) connectedIds.push(content.end_target_id);
                    const connectedItems = connectedIds.map((cid) => {
                      const found = elements.find((x) => x.id === cid);
                      return found ? { id: found.id, origX: found.x, origY: found.y, width: found.width, height: found.height, zIndex: found.z_index } : null;
                    }).filter(Boolean) as Array<{ id: string; origX: number; origY: number; width: number; height: number; zIndex: number }>;

                    lineHandleDragRef.current = {
                      lineId: el.id,
                      handle: 'move',
                      origStartX: sPt.x - el.x,
                      origStartY: sPt.y - el.y,
                      origEndX: ePt.x - el.x,
                      origEndY: ePt.y - el.y,
                      startMouseX: evt.clientX,
                      startMouseY: evt.clientY,
                      origContent: { ...content },
                      connectedItems
                    };
                    setActiveLineHandleDrag(el.id);
                  }}
                  onContextMenu={(evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    onContextMenu(evt, el);
                  }}
                />
                {/* VISIBLE CURVED LINE (WHEN UNSELECTED, SHOWN UNDER CARDS) */}
                {!isInteracting && (
                  <path
                    d={`M ${main.p0.x} ${main.p0.y} Q ${main.p1.x} ${main.p1.y} ${main.p2.x} ${main.p2.y}`}
                    stroke={col}
                    strokeWidth={weight}
                    strokeDasharray={isDashed ? `${Math.max(6, weight * 3)} ${Math.max(4, weight * 2)}` : undefined}
                    fill="none"
                    markerStart={sArrow === 'arrow' ? `url(#arrow-start-${el.id})` : undefined}
                    markerEnd={eArrow === 'arrow' ? `url(#arrow-end-${el.id})` : undefined}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {columns.map((column) => renderStandardCard(column, false))}

        {rootElements.map((el) => renderStandardCard(el, false))}

        {/* INTERACTIVE OVERLAY FOR SELECTED LINES, HANDLES, AND SNAP MARKERS ABOVE CARDS */}
        <svg
          className="milanote-lines-interactive-overlay"
          style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', overflow: 'visible', zIndex: 9999, pointerEvents: 'none' }}
        >
          <defs>
            {lineElements.map((el) => {
              const col = el.style?.line_color || '#a8b0c0';
              const sArrow = el.style?.start_arrow || 'none';
              const eArrow = el.style?.end_arrow === undefined ? 'arrow' : el.style?.end_arrow;
              const markerSize = 8 + (el.style?.line_weight || 2);
              return (
                <React.Fragment key={`defs-overlay-${el.id}`}>
                  {sArrow === 'arrow' && (
                    <marker id={`arrow-start-selected-${el.id}`} viewBox="0 0 10 10" refX="2" refY="5" markerUnits="userSpaceOnUse" markerWidth={markerSize} markerHeight={markerSize} orient="auto">
                      <path d="M 10 0 L 0 5 L 10 10 z" fill={col} />
                    </marker>
                  )}
                  {eArrow === 'arrow' && (
                    <marker id={`arrow-end-selected-${el.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth={markerSize} markerHeight={markerSize} orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={col} />
                    </marker>
                  )}
                </React.Fragment>
              );
            })}
          </defs>

          {lineElements.map((el) => {
            const isSelected = selectedElementId === el.id || selectedIds.includes(el.id);
            const content = (lineDragPreview?.lineId === el.id ? lineDragPreview.content : el.content) || {};
            const style = el.style || {};
            const weight = style.line_weight || 2;
            const isDashed = Boolean(style.is_dashed);
            const sArrow = style.start_arrow || 'none';
            const eArrow = style.end_arrow === undefined ? 'arrow' : style.end_arrow;

            const isInteracting = isSelected || activeLineHandleDrag === el.id;
            if (!isInteracting) return null;

            const s = computeLineEndpoint(el, content, true);
            const e = computeLineEndpoint(el, content, false);
            const { main, startSegment, endSegment, vertex } = computeBezierCurve(s, e, content);

            return (
              <g key={`overlay-${el.id}`}>
                {/* DOTTED GUIDELINES TO CENTER WHEN SELECTED */}
                {s.anchor === 'center' && s.box && startSegment && (
                  <>
                    <path d={`M ${startSegment.p0.x} ${startSegment.p0.y} Q ${startSegment.p1.x} ${startSegment.p1.y} ${startSegment.p2.x} ${startSegment.p2.y}`} stroke="#8592a6" strokeWidth="1.5" strokeDasharray="3 3" fill="none" style={{ pointerEvents: 'none' }} />
                    <circle cx={s.cx} cy={s.cy} r={4} fill="#ffffff" stroke="#2b2d31" strokeWidth="1.5" style={{ pointerEvents: 'none' }} />
                  </>
                )}
                {e.anchor === 'center' && e.box && endSegment && (
                  <>
                    <path d={`M ${endSegment.p0.x} ${endSegment.p0.y} Q ${endSegment.p1.x} ${endSegment.p1.y} ${endSegment.p2.x} ${endSegment.p2.y}`} stroke="#8592a6" strokeWidth="1.5" strokeDasharray="3 3" fill="none" style={{ pointerEvents: 'none' }} />
                    <circle cx={e.cx} cy={e.cy} r={4} fill="#ffffff" stroke="#2b2d31" strokeWidth="1.5" style={{ pointerEvents: 'none' }} />
                  </>
                )}
                {/* INVISIBLE WIDER HIT TARGET FOR DRAGGING SELECTED LINE */}
                <path
                  d={`M ${main.p0.x} ${main.p0.y} Q ${main.p1.x} ${main.p1.y} ${main.p2.x} ${main.p2.y}`}
                  stroke="transparent"
                  strokeWidth={Math.max(16, weight + 12)}
                  fill="none"
                  style={{ cursor: 'move', pointerEvents: 'auto' }}
                  onMouseDown={(evt) => {
                    evt.stopPropagation();
                    onSelectElement(el.id);
                    const sPt = computeLineEndpoint(el, content, true);
                    const ePt = computeLineEndpoint(el, content, false);
                    const connectedIds: string[] = [];
                    if (content.start_target_id) connectedIds.push(content.start_target_id);
                    if (content.end_target_id && !connectedIds.includes(content.end_target_id)) connectedIds.push(content.end_target_id);
                    const connectedItems = connectedIds.map((cid) => {
                      const found = elements.find((x) => x.id === cid);
                      return found ? { id: found.id, origX: found.x, origY: found.y, width: found.width, height: found.height, zIndex: found.z_index } : null;
                    }).filter(Boolean) as Array<{ id: string; origX: number; origY: number; width: number; height: number; zIndex: number }>;

                    lineHandleDragRef.current = {
                      lineId: el.id,
                      handle: 'move',
                      origStartX: sPt.x - el.x,
                      origStartY: sPt.y - el.y,
                      origEndX: ePt.x - el.x,
                      origEndY: ePt.y - el.y,
                      startMouseX: evt.clientX,
                      startMouseY: evt.clientY,
                      origContent: { ...content },
                      connectedItems
                    };
                    setActiveLineHandleDrag(el.id);
                  }}
                />
                {/* VISIBLE SELECTED CURVED LINE ABOVE CARDS */}
                <path
                  d={`M ${main.p0.x} ${main.p0.y} Q ${main.p1.x} ${main.p1.y} ${main.p2.x} ${main.p2.y}`}
                  stroke={style.line_color || '#a8b0c0'}
                  strokeWidth={Math.max(2, weight)}
                  strokeDasharray={isDashed ? `${Math.max(6, weight * 3)} ${Math.max(4, weight * 2)}` : undefined}
                  fill="none"
                  markerStart={sArrow === 'arrow' ? `url(#arrow-start-selected-${el.id})` : undefined}
                  markerEnd={eArrow === 'arrow' ? `url(#arrow-end-selected-${el.id})` : undefined}
                  style={{ pointerEvents: 'none' }}
                />
                {/* INTERACTIVE DRAG HANDLES */}
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={5}
                  className="line-handle-circle"
                  style={{ pointerEvents: 'auto' }}
                  onMouseDown={(evt) => {
                    evt.stopPropagation();
                    lineHandleDragRef.current = { lineId: el.id, handle: 'start' };
                    setActiveLineHandleDrag(el.id);
                  }}
                />
                <circle
                  cx={vertex.x}
                  cy={vertex.y}
                  r={5}
                  className="line-handle-circle"
                  style={{ pointerEvents: 'auto' }}
                  onMouseDown={(evt) => {
                    evt.stopPropagation();
                    lineHandleDragRef.current = { lineId: el.id, handle: 'middle' };
                    setActiveLineHandleDrag(el.id);
                  }}
                />
                <circle
                  cx={e.x}
                  cy={e.y}
                  r={5}
                  className="line-handle-circle"
                  style={{ pointerEvents: 'auto' }}
                  onMouseDown={(evt) => {
                    evt.stopPropagation();
                    lineHandleDragRef.current = { lineId: el.id, handle: 'end' };
                    setActiveLineHandleDrag(el.id);
                  }}
                />
              </g>
            );
          })}

          {/* VISUAL SNAP MARKERS (DEFAULT: CENTER; ADVANCED: 4 EDGE MIDPOINTS) DURING ENDPOINT DRAGGING */}
          {hoveredLineTarget && (
            <g style={{ pointerEvents: 'none' }}>
              {(lineSnapMode === 'center' || hoveredLineTarget.isBoard ? [
                { x: hoveredLineTarget.box.x + hoveredLineTarget.box.width / 2, y: hoveredLineTarget.box.y + hoveredLineTarget.box.height / 2 },
              ] : [
                { x: hoveredLineTarget.box.x + hoveredLineTarget.box.width / 2, y: hoveredLineTarget.box.y },
                { x: hoveredLineTarget.box.x + hoveredLineTarget.box.width / 2, y: hoveredLineTarget.box.y + hoveredLineTarget.box.height },
                { x: hoveredLineTarget.box.x, y: hoveredLineTarget.box.y + hoveredLineTarget.box.height / 2 },
                { x: hoveredLineTarget.box.x + hoveredLineTarget.box.width, y: hoveredLineTarget.box.y + hoveredLineTarget.box.height / 2 },
              ]).map((pt, idx) => (
                <circle
                  key={`snap-pt-${idx}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={5.5}
                  fill="#ffffff"
                  stroke="#3c7eff"
                  strokeWidth="2"
                  style={{ filter: 'drop-shadow(0 0 5px rgba(60, 126, 255, 0.9))' }}
                />
              ))}
            </g>
          )}
        </svg>

        {/* LINE LABEL PILLS IN HTML LAYER OVER SVG */}
        {lineElements.map((el) => {
          const content = (lineDragPreview?.lineId === el.id ? lineDragPreview.content : el.content) || {};
          const showLabel = Boolean(content.show_label || (content.label && content.label.trim().length > 0));
          if (!showLabel) return null;

          const s = computeLineEndpoint(el, content, true);
          const e = computeLineEndpoint(el, content, false);
          const { vertex } = computeBezierCurve(s, e, content);
          const isEditing = editingLineLabelId === el.id;

          return (
            <div
              key={`label-${el.id}`}
              className="line-floating-label"
              style={{ left: vertex.x, top: vertex.y, zIndex: 10000, cursor: isEditing ? 'text' : 'pointer' }}
              onClick={(evt) => evt.stopPropagation()}
              onMouseDown={(evt) => {
                evt.stopPropagation();
                if (!isEditing) {
                  lineHandleDragRef.current = { lineId: el.id, handle: 'middle' };
                  setActiveLineHandleDrag(el.id);
                }
              }}
              onDoubleClick={(evt) => {
                evt.stopPropagation();
                setEditingLineLabelId(el.id);
              }}
            >
              {isEditing ? (
                <input
                  autoFocus
                  value={content.label ?? 'Label'}
                  onChange={(evt) => {
                    const nextLabel = evt.target.value;
                    onContentChange(el.id, { ...content, label: nextLabel });
                  }}
                  onBlur={() => setEditingLineLabelId(null)}
                  onKeyDown={(evt) => {
                    if (evt.key === 'Enter') setEditingLineLabelId(null);
                  }}
                  placeholder="Label..."
                />
              ) : (
                <span style={{ padding: '0 4px', userSelect: 'none', pointerEvents: 'none' }}>
                  {content.label || 'Label'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* FLOATING INLINE COMMENT BUBBLE */}
      {activeInlineComment && (() => {
        const targetEl = elements.find(x => x.id === activeInlineComment.elementId);
        if (!targetEl) return null;
        return (
          <InlineCommentBubble
            targetEl={targetEl}
            activeInlineComment={activeInlineComment}
            onClose={() => setActiveInlineComment(null)}
            onContentChange={onContentChange}
          />
        );
      })()}

      {/* CANVAS HORIZONTAL & VERTICAL SCROLLBARS */}
      {scrollbarMetrics.showH && (
        <div
          className="canvas-scrollbar-h"
          onMouseDown={(e) => handleScrollbarMouseDown('h', e)}
        >
          <div
            className={`canvas-scrollbar-thumb ${scrollbarDragRef.current?.axis === 'h' ? 'dragging' : ''}`}
            style={{
              left: `${scrollbarMetrics.thumbLeftPct}%`,
              width: `${scrollbarMetrics.thumbWidthPct}%`,
              height: '100%',
            }}
          />
        </div>
      )}
      {scrollbarMetrics.showV && (
        <div
          className="canvas-scrollbar-v"
          onMouseDown={(e) => handleScrollbarMouseDown('v', e)}
        >
          <div
            className={`canvas-scrollbar-thumb ${scrollbarDragRef.current?.axis === 'v' ? 'dragging' : ''}`}
            style={{
              top: `${scrollbarMetrics.thumbTopPct}%`,
              height: `${scrollbarMetrics.thumbHeightPct}%`,
              width: '100%',
            }}
          />
        </div>
      )}

      <UnsortedDrawer
        isOpen={Boolean(isUnsortedDrawerOpen)}
        onClose={() => onCloseUnsortedDrawer && onCloseUnsortedDrawer()}
        unsortedElements={unsortedElements || []}
        onMoveToCanvas={(el, x, y) => onMoveFromUnsortedToCanvas && onMoveFromUnsortedToCanvas(el, x, y)}
        onReorder={(src, tgt) => onUnsortedReorder && onUnsortedReorder(src, tgt)}
        onSelectElement={onSelectElement}
        selectedElementId={selectedElementId}
        selectedIds={selectedIds}
        onMultiSelect={onMultiSelect}
        onDropNewTool={(tool) => onDropTool && onDropTool(tool, 100, 100, undefined, true)}
        renderElement={(el, onMouseDown) => renderStandardCard(el, true, onMouseDown)}
      />
    </div>
  );
};
