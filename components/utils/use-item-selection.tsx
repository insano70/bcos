'use client';

import { useState } from 'react';
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

  const handleCheckboxChange = (id: string | number, checked: boolean) => {
    setIsAllSelected(false);
    if (checked) {
      setSelectedItems([...selectedItems, id]);
    } else {
      setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
    }
  };

  const handleSelectAllChange = (checked: boolean) => {
    setIsAllSelected(checked);
    if (checked) {
      setSelectedItems(items.map((item) => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  return {
    selectedItems,
    isAllSelected,
    handleCheckboxChange,
    handleSelectAllChange,
  };
};
