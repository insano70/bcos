import { useState, useMemo } from 'react';

export interface PaginationResult<T> {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
  currentItems: T[];
  hasNext: boolean;
  hasPrevious: boolean;
  goToPage: (page: number) => void;
  goToNext: () => void;
  goToPrevious: () => void;
  startItem: number;
  endItem: number;
}

export interface UsePaginationOptions {
  itemsPerPage?: number;
  initialPage?: number;
}

export function usePagination<T>(
  items: T[] | undefined | null,
  options: UsePaginationOptions = {}
): PaginationResult<T> {
  const { itemsPerPage = 10, initialPage = 1 } = options;
  const [currentPage, setCurrentPage] = useState(initialPage);

  const safeItems = items || [];
  const totalItems = safeItems.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Reset to page 1 if current page is out of bounds
  const validCurrentPage = useMemo(() => {
    if (totalPages === 0) return 1;
    if (currentPage > totalPages) {
      setCurrentPage(1);
      return 1;
    }
    return currentPage;
  }, [currentPage, totalPages]);

  const startIndex = (validCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = safeItems.slice(startIndex, endIndex);

  const startItem = totalItems === 0 ? 0 : startIndex + 1;
  const endItem = endIndex;

  const hasNext = validCurrentPage < totalPages;
  const hasPrevious = validCurrentPage > 1;

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToNext = () => {
    if (hasNext) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const goToPrevious = () => {
    if (hasPrevious) {
      setCurrentPage(prev => prev - 1);
    }
  };

  return {
    currentPage: validCurrentPage,
    totalPages,
    itemsPerPage,
    totalItems,
    currentItems,
    hasNext,
    hasPrevious,
    goToPage,
    goToNext,
    goToPrevious,
    startItem,
    endItem,
  };
}
