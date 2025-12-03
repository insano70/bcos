'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSelectedItems } from '@/app/selected-items-context';

/**
 * Hook for managing item selection state in DataTableStandard.
 *
 * ## Architecture Note: Global vs Local Selection State
 *
 * This hook uses **GLOBAL selection state** via `useSelectedItems` context.
 * Selection persists across components and page navigation, enabling features like:
 * - Bulk actions via the DeleteButton component
 * - Selection awareness in header components
 * - Cross-component selection coordination
 *
 * **Contrast with EditableDataTable** which uses **LOCAL selection state** via `useState`.
 * This is intentional:
 * - EditableDataTable manages its own row selection for inline editing
 * - Selection is scoped to the table instance, not shared globally
 * - Avoids conflicts when multiple editable tables are on the same page
 *
 * ## When to use which:
 * - **DataTableStandard + useItemSelection**: Read-only tables where selection drives
 *   external bulk actions (e.g., mass delete via toolbar button)
 * - **EditableDataTable**: Tables with inline edit/save/cancel, where selection is
 *   internal to the component
 *
 * @param items - Array of items with id property, used to determine "select all" scope
 * @returns Selection state and handlers for checkbox changes
 */
export const useItemSelection = <T extends { id: string | number }>(items: T[]) => {
  const { selectedItems, setSelectedItems } = useSelectedItems();
  const [isAllSelected, setIsAllSelected] = useState<boolean>(false);

  // Build a Set of valid IDs for O(1) lookup
  const validIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);

  // Use ref to access current selectedItems without adding to deps
  const selectedItemsRef = useRef(selectedItems);
  selectedItemsRef.current = selectedItems;

  // Clear stale selections when validIds changes (e.g., after deletion or filtering)
  // Uses ref for selectedItems to avoid triggering effect when selections change
  useEffect(() => {
    const currentSelected = selectedItemsRef.current;
    const validSelected = currentSelected.filter((id) => validIds.has(id));
    
    // Only update if we actually removed items
    if (validSelected.length !== currentSelected.length) {
      setSelectedItems(validSelected);
      setIsAllSelected(false);
    }
  }, [validIds, setSelectedItems]);

  const handleCheckboxChange = useCallback((id: string | number, checked: boolean) => {
    setIsAllSelected(false);
    if (checked) {
      setSelectedItems((prev) => [...prev, id]);
    } else {
      setSelectedItems((prev) => prev.filter((itemId) => itemId !== id));
    }
  }, [setSelectedItems]);

  const handleSelectAllChange = useCallback((checked: boolean) => {
    setIsAllSelected(checked);
    if (checked) {
      setSelectedItems(items.map((item) => item.id));
    } else {
      setSelectedItems([]);
    }
  }, [items, setSelectedItems]);

  return {
    selectedItems,
    isAllSelected,
    handleCheckboxChange,
    handleSelectAllChange,
  };
};
