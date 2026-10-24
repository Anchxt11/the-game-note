import { Element } from '../types';

/**
 * Returns the IDs of all line/arrow elements that should be deleted when `deletedElementIds` are deleted.
 * 
 * Rules:
 * 1) The arrow has 2 elements and one of them is deleted -> delete the arrow
 * 2) The arrow has only 1 element and that element has been deleted -> delete the arrow
 * 
 * NOTE: DO NOT delete arrows that are not connected to elements (standalone free-drawn arrows).
 */
export function getConnectedLinesToDelete(
  deletedElementIds: Iterable<string>,
  allElements: Element[]
): string[] {
  const deletedSet = new Set(deletedElementIds);
  if (deletedSet.size === 0) return [];

  // Also include cards contained in any deleted column
  const columnIds = new Set(
    allElements.filter((el) => deletedSet.has(el.id) && el.element_type === 'column').map((el) => el.id)
  );
  if (columnIds.size > 0) {
    allElements.forEach((el) => {
      if (el.style?.parent_column_id && columnIds.has(el.style.parent_column_id)) {
        deletedSet.add(el.id);
      }
    });
  }

  const lineIdsToDelete: string[] = [];

  for (const el of allElements) {
    if (el.element_type !== 'line') continue;
    if (deletedSet.has(el.id)) continue; // Arrow itself was already in the deletion set

    const startId = typeof el.content?.start_target_id === 'string' && el.content.start_target_id.trim().length > 0
      ? el.content.start_target_id.trim()
      : null;
    const endId = typeof el.content?.end_target_id === 'string' && el.content.end_target_id.trim().length > 0
      ? el.content.end_target_id.trim()
      : null;

    const hasStart = startId !== null;
    const hasEnd = endId !== null;

    // Free-standing arrow: user intends to place it not connected to 2 elements or 1 element -> DO NOT delete!
    if (!hasStart && !hasEnd) {
      continue;
    }

    // Scenario 1: Arrow has 2 elements (hasStart && hasEnd) and one (or both) of them is deleted.
    // Scenario 2: Arrow has only 1 element (hasStart XOR hasEnd) and that element has been deleted.
    // In both scenarios, if either connected element is in deletedSet, the arrow must be deleted!
    const isStartDeleted = hasStart && deletedSet.has(startId);
    const isEndDeleted = hasEnd && deletedSet.has(endId);

    if (isStartDeleted || isEndDeleted) {
      lineIdsToDelete.push(el.id);
    }
  }

  return lineIdsToDelete;
}

/**
 * Filters out orphaned lines from a list of board elements (e.g. on load or sync)
 * where the line had connected elements that no longer exist on the board.
 */
export function pruneOrphanedLines(elements: Element[]): { validElements: Element[]; orphanedLineIds: string[] } {
  const elementIdSet = new Set(elements.map((e) => e.id));
  const orphanedLineIds: string[] = [];

  const validElements = elements.filter((el) => {
    if (el.element_type !== 'line') return true;

    const startId = typeof el.content?.start_target_id === 'string' && el.content.start_target_id.trim().length > 0
      ? el.content.start_target_id.trim()
      : null;
    const endId = typeof el.content?.end_target_id === 'string' && el.content.end_target_id.trim().length > 0
      ? el.content.end_target_id.trim()
      : null;

    const hasStart = startId !== null;
    const hasEnd = endId !== null;

    // Standalone arrow -> keep!
    if (!hasStart && !hasEnd) return true;

    // Scenario 1: 2 elements, but one or both no longer exist on the board
    if (hasStart && hasEnd && (!elementIdSet.has(startId) || !elementIdSet.has(endId))) {
      orphanedLineIds.push(el.id);
      return false;
    }

    // Scenario 2: 1 element, but it no longer exists on the board
    if (hasStart && !hasEnd && !elementIdSet.has(startId)) {
      orphanedLineIds.push(el.id);
      return false;
    }
    if (!hasStart && hasEnd && !elementIdSet.has(endId)) {
      orphanedLineIds.push(el.id);
      return false;
    }

    return true;
  });

  return { validElements, orphanedLineIds };
}
