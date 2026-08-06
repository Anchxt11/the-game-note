import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Bold,
  Italic,
  Strikethrough,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Code,
  Link as LinkIcon,
  MessageSquare,
  Trash2
} from 'lucide-react';
import { Element } from '../types';

interface TextEditSubSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete: () => void;
  element: Element | null;
  onApplyFormat?: (format: string, param?: string) => void;
}

export const TextEditSubSidebar: React.FC<TextEditSubSidebarProps> = ({
  isOpen,
  onClose,
  onDelete,
  element,
  onApplyFormat = () => {}
}) => {
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    strikethrough: false,
    underline: false,
    bullet: false,
    number: false,
    align: 'left' as 'left' | 'center' | 'right',
    hasSelection: false,
    textStyle: 'P',
    textColor: '',
  });

  const updateFormatStates = useCallback(() => {
    try {
      const isCenter = document.queryCommandState('justifyCenter');
      const isRight = document.queryCommandState('justifyRight');
      const selection = window.getSelection();
      const hasSel = Boolean(selection && selection.toString().trim() !== '');

      const rgb2hex = (rgb: string) => {
        if (!rgb) return '';
        if (rgb.startsWith('#')) return rgb.toLowerCase();
        const matches = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!matches) return '';
        const hex = (x: string) => ("0" + parseInt(x).toString(16)).slice(-2);
        return "#" + hex(matches[1]) + hex(matches[2]) + hex(matches[3]);
      };

      let currentStyle = 'P';
      let currentColor = '';
      let currentHighlight = '';
      let isInsideEditor = false;

      if (selection && selection.anchorNode) {
        let node: Node | null = selection.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;
        
        let checkNode = node as HTMLElement | null;
        while(checkNode) {
          if (checkNode.classList && checkNode.classList.contains('note-rich-editor')) {
            isInsideEditor = true;
            break;
          }
          checkNode = checkNode.parentElement;
        }

        if (isInsideEditor) {
          let curr = node as HTMLElement | null;
          while (curr && curr.classList && !curr.classList.contains('note-rich-editor')) {
            const tag = curr.tagName.toUpperCase();
            if (['H1', 'H2', 'H5', 'H6', 'PRE', 'BLOCKQUOTE'].includes(tag)) {
              currentStyle = tag;
            }
            if (!currentColor && curr.style && curr.style.color) currentColor = rgb2hex(curr.style.color);
            curr = curr.parentElement;
          }
        }
      }

      if (!isInsideEditor) {
        return; // Don't update formats if selection is outside editor
      }

      try {
        const c = document.queryCommandValue('foreColor');
        if (c && !currentColor) currentColor = rgb2hex(c);
      } catch(e) {}

      setFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        strikethrough: document.queryCommandState('strikethrough'),
        underline: document.queryCommandState('underline'),
        bullet: document.queryCommandState('insertUnorderedList'),
        number: document.queryCommandState('insertOrderedList'),
        align: isCenter ? 'center' : isRight ? 'right' : 'left',
        hasSelection: hasSel,
        textStyle: currentStyle,
        textColor: currentColor,
      });
    } catch (e) {
      // Ignore if document is not in focused editable state
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('selectionchange', updateFormatStates);
    window.addEventListener('mouseup', updateFormatStates);
    window.addEventListener('keyup', updateFormatStates);
    return () => {
      document.removeEventListener('selectionchange', updateFormatStates);
      window.removeEventListener('mouseup', updateFormatStates);
      window.removeEventListener('keyup', updateFormatStates);
    };
  }, [isOpen, updateFormatStates]);

  if (!isOpen || !element) return null;

  const handleFormatClick = (format: string, param?: string) => {
    onApplyFormat(format, param);
    // Re-check format states immediately after execution
    setTimeout(updateFormatStates, 20);
  };

  const hasColor = formats.textColor && formats.textColor !== '#ffffff';

  return (
    <aside 
      className="milanote-sub-sidebar"
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Top Close Back Arrow */}
      <button className="sub-sidebar-btn" onClick={onClose} title="Done editing (Return to View Mode)">
        <ArrowLeft size={20} />
      </button>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* Text style button with colorful gradient palette dot badge */}
      <div style={{ position: 'relative' }}>
        <button 
          className="sub-sidebar-btn" 
          style={{ flexDirection: 'column', gap: '3px', height: '48px', width: '100%' }} 
          title="Text style"
          onClick={() => setShowStyleMenu(!showStyleMenu)}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>T</span>
            <div className="text-style-dot" style={{ position: 'absolute', right: '-8px', bottom: '-4px', width: '10px', height: '10px', borderWidth: '1px' }} />
          </div>
          <span style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '-0.2px', color: '#a5a5ad' }}>Style</span>
        </button>

        {showStyleMenu && (
          <div className="text-style-popover" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
            <div className={`style-menu-item ${formats.textStyle === 'H1' ? 'active' : ''}`} onClick={() => handleFormatClick('heading', 'H1')}>
              <span style={{ fontWeight: 800, fontSize: '17px', color: '#ffffff' }}>Large heading</span>
              {formats.textStyle === 'H1' ? <span className="style-check">✓</span> : <span className="style-shortcut">^⇧1</span>}
            </div>
            <div className={`style-menu-item ${formats.textStyle === 'H2' ? 'active' : ''}`} onClick={() => handleFormatClick('heading', 'H2')}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#ffffff' }}>Normal heading</span>
              {formats.textStyle === 'H2' ? <span className="style-check">✓</span> : <span className="style-shortcut">^⇧2</span>}
            </div>
            <div className={`style-menu-item ${formats.textStyle === 'P' ? 'active' : ''}`} onClick={() => handleFormatClick('heading', 'P')}>
              <span style={{ fontWeight: 400, fontSize: '14px', color: '#e0e0e0' }}>Normal text</span>
              {formats.textStyle === 'P' ? <span className="style-check">✓</span> : <span className="style-shortcut"></span>}
            </div>
            <div className={`style-menu-item ${formats.textStyle === 'H6' ? 'active' : ''}`} onClick={() => handleFormatClick('small')}>
              <span style={{ fontWeight: 400, fontSize: '12px', color: '#cccccc' }}>Small text</span>
              {formats.textStyle === 'H6' ? <span className="style-check">✓</span> : <span className="style-shortcut">^⇧9</span>}
            </div>

            <div className={`style-menu-item ${formats.textStyle === 'PRE' ? 'active' : ''}`} onClick={() => handleFormatClick('code-block')}>
              <div className="style-block-badge code-badge">Code block</div>
              {formats.textStyle === 'PRE' ? <span className="style-check">✓</span> : <span className="style-shortcut">^&gt;</span>}
            </div>
            <div className={`style-menu-item ${formats.textStyle === 'H5' ? 'active' : ''}`} onClick={() => handleFormatClick('callout')}>
              <div className="style-block-badge callout-badge">
                <span style={{ marginRight: '6px' }}>⚠️</span> Callout
              </div>
              {formats.textStyle === 'H5' ? <span className="style-check">✓</span> : <span className="style-shortcut">^⇧6</span>}
            </div>
            <div className={`style-menu-item ${formats.textStyle === 'BLOCKQUOTE' ? 'active' : ''}`} onClick={() => handleFormatClick('quote')}>
              <span className="quote-badge">"Quote block"</span>
              {formats.textStyle === 'BLOCKQUOTE' ? <span className="style-check">✓</span> : <span className="style-shortcut">^"</span>}
            </div>

            <div className="style-popover-divider" />

            <div className="style-colors-section">
              <div className="color-section-title">Color</div>
              <div className="color-swatches">
                {['#ffffff', '#2a8bdf', '#27ae60', '#f2994a', '#eb5757', '#828282'].map((color, i) => (
                  <div 
                    key={`color-${i}`} 
                    className={`color-swatch text-color ${formats.textColor === color ? 'active' : (!hasColor && i === 0 ? 'active' : '')}`}
                    onClick={() => handleFormatClick('color', color)}
                  >
                    <span style={{ color }}>A</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* Formatting group with live active format tracking! */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', alignItems: 'center' }}>
        <button className={`sub-sidebar-btn ${formats.bold ? 'active' : ''}`} onClick={() => handleFormatClick('bold')} title="Bold (Ctrl+B)">
          <Bold size={18} />
        </button>
        <button className={`sub-sidebar-btn ${formats.italic ? 'active' : ''}`} onClick={() => handleFormatClick('italic')} title="Italic (Ctrl+I)">
          <Italic size={18} />
        </button>
        <button className={`sub-sidebar-btn ${formats.strikethrough ? 'active' : ''}`} onClick={() => handleFormatClick('strikethrough')} title="Strikethrough">
          <Strikethrough size={18} />
        </button>
        <button className={`sub-sidebar-btn ${formats.underline ? 'active' : ''}`} onClick={() => handleFormatClick('underline')} title="Underline (Ctrl+U)">
          <Underline size={18} />
        </button>
      </div>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* Lists group */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', alignItems: 'center' }}>
        <button className={`sub-sidebar-btn ${formats.bullet ? 'active' : ''}`} onClick={() => handleFormatClick('bullet-list')} title="Bullet List">
          <List size={18} />
        </button>
        <button className={`sub-sidebar-btn ${formats.number ? 'active' : ''}`} onClick={() => handleFormatClick('number-list')} title="Numbered List">
          <ListOrdered size={18} />
        </button>
        <button 
          className={`sub-sidebar-btn ${formats.align !== 'left' ? 'active' : ''}`} 
          onClick={() => {
            if (formats.align === 'left') handleFormatClick('align-center');
            else if (formats.align === 'center') handleFormatClick('align-right');
            else handleFormatClick('align-left');
          }} 
          title={`Text Alignment (${formats.align.charAt(0).toUpperCase() + formats.align.slice(1)}) - Click to cycle`}
        >
          {formats.align === 'center' ? <AlignCenter size={18} /> : formats.align === 'right' ? <AlignRight size={18} /> : <AlignLeft size={18} />}
        </button>
      </div>

      <div className="toolbar-separator" style={{ width: '36px', margin: '8px 0' }} />

      {/* Embeds & Comments */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', alignItems: 'center' }}>
        <button 
          className="sub-sidebar-btn" 
          onClick={() => formats.hasSelection && handleFormatClick('code')} 
          disabled={!formats.hasSelection}
          style={{ opacity: formats.hasSelection ? 1 : 0.25, cursor: formats.hasSelection ? 'pointer' : 'not-allowed' }}
          title={formats.hasSelection ? "Code Block" : "Select text first to use Code Block"}
        >
          <Code size={18} />
        </button>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button 
            className="sub-sidebar-btn" 
            onClick={(e) => {
              e.stopPropagation();
              if (!formats.hasSelection) return;
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                savedRangeRef.current = sel.getRangeAt(0).cloneRange();
              }
              setShowLinkPrompt(!showLinkPrompt);
              setLinkUrlInput('');
            }} 
            disabled={!formats.hasSelection}
            style={{ opacity: formats.hasSelection ? 1 : 0.25, cursor: formats.hasSelection ? 'pointer' : 'not-allowed' }}
            title={formats.hasSelection ? "Insert Link" : "Select text first to insert Link"}
          >
            <LinkIcon size={18} />
          </button>
          {showLinkPrompt && (
            <div 
              className="link-prompt-tooltip"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="link-prompt-caret" />
              <input
                type="text"
                className="link-prompt-input"
                placeholder="Enter a URL..."
                value={linkUrlInput}
                onChange={(e) => setLinkUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    let url = linkUrlInput.trim();
                    if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
                      url = 'https://' + url;
                    }
                    setShowLinkPrompt(false);
                    if (url && savedRangeRef.current && !savedRangeRef.current.collapsed) {
                      try {
                        const range = savedRangeRef.current;
                        const anchor = document.createElement('a');
                        anchor.href = url;
                        anchor.className = 'milanote-text-link';
                        anchor.setAttribute('target', '_blank');
                        anchor.setAttribute('rel', 'noopener noreferrer');
                        anchor.style.color = '#eb5e34';
                        anchor.style.textDecoration = 'underline';
                        anchor.style.cursor = 'pointer';

                        const content = range.extractContents();
                        anchor.appendChild(content);
                        range.insertNode(anchor);

                        // Position cursor immediately after the link
                        const newRange = document.createRange();
                        newRange.setStartAfter(anchor);
                        newRange.collapse(true);
                        const sel = window.getSelection();
                        if (sel) {
                          sel.removeAllRanges();
                          sel.addRange(newRange);
                        }
                        handleFormatClick('link-applied-dom', url);
                      } catch (err) {
                        console.error('DOM link wrapping failed, falling back to execCommand:', err);
                        if (url) handleFormatClick('link', url);
                      }
                    } else if (url) {
                      if (savedRangeRef.current) {
                        const sel = window.getSelection();
                        if (sel) {
                          sel.removeAllRanges();
                          sel.addRange(savedRangeRef.current);
                        }
                      }
                      handleFormatClick('link', url);
                    }
                  } else if (e.key === 'Escape') {
                    setShowLinkPrompt(false);
                  }
                }}
                autoFocus
              />
            </div>
          )}
        </div>
        <button 
          className="sub-sidebar-btn" 
          onClick={() => {
            if (!formats.hasSelection) return;
            const cid = `ic-${Date.now()}`;
            handleFormatClick('comment', cid);
          }}
          disabled={!formats.hasSelection}
          style={{ opacity: formats.hasSelection ? 1 : 0.25, cursor: formats.hasSelection ? 'pointer' : 'not-allowed' }}
          title={formats.hasSelection ? "Add comment" : "Select text first to add comment"}
        >
          <MessageSquare size={18} />
        </button>
      </div>

      {/* Bottom Trash Bin */}
      <button 
        className="sub-sidebar-btn trash-bottom" 
        style={{ flexDirection: 'column', gap: '2px', height: '48px' }}
        onClick={() => { onDelete(); onClose(); }} 
        title="Delete card"
      >
        <Trash2 size={18} />
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '-0.2px' }}>Trash</span>
      </button>
    </aside>
  );
};
