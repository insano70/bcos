import type { ReactNode } from 'react';

/**
 * Action definition for dropdown menus in data table rows.
 */
export interface DataTableDropdownAction<T> {
  label: string | ((item: T) => string);
  icon?: ReactNode;
  onClick: (item: T) => void | Promise<void>;
  variant?: 'default' | 'danger';
  /** @deprecated Use confirmModal instead */
  confirm?: string | ((item: T) => string);
  confirmModal?: {
    title: string | ((item: T) => string);
    message: string | ((item: T) => string);
    confirmText?: string | ((item: T) => string);
  };
  /** Conditionally show/hide the action */
  show?: (item: T) => boolean;
}

export interface DataTableColumn<T> {
  key: keyof T | 'checkbox' | 'actions' | 'expand';
  header?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  width?: string | number;
  minWidth?: number;
  visible?: boolean;
  
  // Renderers
  render?: (item: T) => ReactNode;
  
  // Edit specific
  editable?: boolean;
  required?: boolean;
  validate?: (value: unknown, item: T) => string | undefined;
  renderEdit?: (
    item: T,
    value: unknown,
    onChange: (value: unknown) => void,
    error?: string
  ) => ReactNode;
}

export interface DataTableBulkAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (items: T[]) => void | Promise<void>;
  variant?: 'default' | 'danger';
  confirmModal?: {
    title: string | ((item: T) => string); // Support dynamic titles
    message: string | ((item: T) => string); // Support dynamic messages
    confirmText?: string | ((item: T) => string);
  };
  /** @deprecated Use confirmModal instead for consistent modal UX */
  confirm?: string;
}

export interface DataTablePaginationState {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  startItem: number;
  endItem: number;
  hasPrevious: boolean;
  hasNext: boolean;
  goToPrevious: () => void;
  goToNext: () => void;
}
