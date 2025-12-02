// Data Table Component Library
// Extracted shared components for DataTable and EditableDataTable

// Base Components
export { BaseDataTable } from './base-data-table';
export { DataTableHeader } from './data-table-header';
export { DataTableToolbar } from './data-table-toolbar';
export { DataTablePagination } from './data-table-pagination';
export { DataTableRow } from './data-table-row';

// Hooks
export { useBulkActionModal } from './use-bulk-action-modal';
export { useDataTableFiltering, type ActiveFilter, type DateRange } from './use-data-table-filtering';

// Column Presets
export {
  checkboxColumn,
  actionsColumn,
  dateColumn,
  statusBadgeColumn,
  userColumn,
  textColumn,
} from './column-presets';

// Utilities
export { getDensityClasses, getAlignmentClass } from './utils';
export type { DensityMode } from './utils';

// Types
export type {
  DataTableColumn,
  DataTableBulkAction,
  DataTablePaginationState,
} from './types';

