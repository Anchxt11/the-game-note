export interface SavedSelection {
  start: number;
  end: number;
  isBackward?: boolean;
}

/**
 * Saves the current character-offset selection within a container element.
 */
export function saveSelection(container: HTMLElement): SavedSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  try {
    const range = sel.getRangeAt(0);
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
      return null;
    }

    const isBackward = sel.anchorNode && sel.focusNode ? (
      sel.anchorNode === sel.focusNode 
        ? sel.anchorOffset > sel.focusOffset 
        : (sel.anchorNode.compareDocumentPosition(sel.focusNode) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
    ) : false;

    const preRange = range.cloneRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;

    preRange.setEnd(range.endContainer, range.endOffset);
    const end = preRange.toString().length;

    return { start, end, isBackward };
  } catch (err) {
    return null;
  }
}

/**
 * Restores the character-offset selection within a container element.
 */
export function restoreSelection(container: HTMLElement, saved: SavedSelection | null): boolean {
  if (!saved) return false;
  const sel = window.getSelection();
  if (!sel) return false;

  try {
    if (document.activeElement !== container && !container.contains(document.activeElement)) {
      container.focus();
    }

    let charIndex = 0;
    let startNode: Node | null = null;
    let startOffset = 0;
    let endNode: Node | null = null;
    let endOffset = 0;

    const nodeIterator = document.createNodeIterator(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentNode: Node | null;
    while ((currentNode = nodeIterator.nextNode())) {
      const textLen = currentNode.textContent?.length || 0;
      const nextCharIndex = charIndex + textLen;

      if (!startNode && saved.start >= charIndex && (saved.start < nextCharIndex || (saved.start === nextCharIndex && !nodeIterator.referenceNode))) {
        startNode = currentNode;
        startOffset = saved.start - charIndex;
      }
      if (!endNode && saved.end >= charIndex && (saved.end < nextCharIndex || (saved.end === nextCharIndex && !nodeIterator.referenceNode))) {
        endNode = currentNode;
        endOffset = saved.end - charIndex;
      }

      charIndex = nextCharIndex;
    }

    // Fallback if exactly at total text boundary or empty container
    if (!startNode) {
      startNode = container.lastChild || container;
      startOffset = startNode.nodeType === Node.TEXT_NODE 
        ? (startNode.textContent?.length || 0)
        : startNode.childNodes.length;
    }
    if (!endNode) {
      endNode = container.lastChild || container;
      endOffset = endNode.nodeType === Node.TEXT_NODE 
        ? (endNode.textContent?.length || 0)
        : endNode.childNodes.length;
    }

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch (e) {
    return false;
  }
}
