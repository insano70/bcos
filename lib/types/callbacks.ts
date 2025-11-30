/**
 * Callback Type Signatures
 *
 * Standardized callback types for consistent event handling across the application.
 * Using these types ensures type safety and improves code readability.
 *
 * Naming Convention:
 * - On*Callback: For event handlers (e.g., OnClickCallback)
 * - *Handler: For processing functions (e.g., ErrorHandler)
 * - *Fn: For generic function types (e.g., TransformFn)
 */

// =============================================================================
// Basic Callback Types
// =============================================================================

/**
 * Simple void callback with no parameters
 */
export type VoidCallback = () => void;

/**
 * Async void callback with no parameters
 */
export type AsyncVoidCallback = () => Promise<void>;

/**
 * Generic callback with a single typed parameter
 */
export type Callback<T> = (value: T) => void;

/**
 * Async callback with a single typed parameter
 */
export type AsyncCallback<T> = (value: T) => Promise<void>;

/**
 * Callback that returns a value
 */
export type CallbackWithReturn<T, R> = (value: T) => R;

/**
 * Async callback that returns a value
 */
export type AsyncCallbackWithReturn<T, R> = (value: T) => Promise<R>;

// =============================================================================
// Event Handler Types
// =============================================================================

/**
 * Click event handler
 */
export type OnClickCallback = (event: React.MouseEvent) => void;

/**
 * Change event handler for inputs
 */
export type OnChangeCallback<T = string> = (value: T) => void;

/**
 * Form submit handler
 */
export type OnSubmitCallback<T = Record<string, unknown>> = (data: T) => void | Promise<void>;

/**
 * Selection change handler
 */
export type OnSelectCallback<T> = (selected: T | null) => void;

/**
 * Multi-selection change handler
 */
export type OnMultiSelectCallback<T> = (selected: T[]) => void;

/**
 * Toggle/switch handler
 */
export type OnToggleCallback = (enabled: boolean) => void;

/**
 * Search/filter handler
 */
export type OnSearchCallback = (query: string) => void;

/**
 * Pagination handler
 */
export type OnPageChangeCallback = (page: number, pageSize?: number) => void;

/**
 * Sort handler
 */
export type OnSortCallback = (column: string, direction: 'asc' | 'desc') => void;

/**
 * File upload handler
 */
export type OnUploadCallback = (files: File[]) => void | Promise<void>;

/**
 * Drag and drop handler
 */
export type OnDropCallback<T = unknown> = (item: T, targetId: string) => void;

// =============================================================================
// Error and Status Handlers
// =============================================================================

/**
 * Error handler
 */
export type ErrorHandler = (error: Error) => void;

/**
 * Async error handler
 */
export type AsyncErrorHandler = (error: Error) => Promise<void>;

/**
 * Success handler with optional data
 */
export type SuccessHandler<T = void> = (result: T) => void;

/**
 * Loading state handler
 */
export type LoadingHandler = (isLoading: boolean) => void;

/**
 * Status change handler
 */
export type StatusHandler<T extends string = string> = (status: T) => void;

// =============================================================================
// Data Processing Types
// =============================================================================

/**
 * Transform function
 */
export type TransformFn<TInput, TOutput> = (input: TInput) => TOutput;

/**
 * Async transform function
 */
export type AsyncTransformFn<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

/**
 * Filter predicate function
 */
export type FilterFn<T> = (item: T) => boolean;

/**
 * Comparator function for sorting
 */
export type CompareFn<T> = (a: T, b: T) => number;

/**
 * Reducer function
 */
export type ReducerFn<T, R> = (accumulator: R, current: T) => R;

/**
 * Mapper function
 */
export type MapperFn<T, R> = (item: T, index: number) => R;

/**
 * Validator function
 */
export type ValidatorFn<T> = (value: T) => boolean | string;

/**
 * Async validator function
 */
export type AsyncValidatorFn<T> = (value: T) => Promise<boolean | string>;

// =============================================================================
// API and Data Fetching Types
// =============================================================================

/**
 * Data fetcher function
 */
export type FetcherFn<T> = () => Promise<T>;

/**
 * Parameterized data fetcher function
 */
export type ParameterizedFetcherFn<TParams, TResult> = (params: TParams) => Promise<TResult>;

/**
 * Mutation function
 */
export type MutationFn<TInput, TResult> = (input: TInput) => Promise<TResult>;

/**
 * Delete function
 */
export type DeleteFn = (id: string) => Promise<void>;

/**
 * Bulk delete function
 */
export type BulkDeleteFn = (ids: string[]) => Promise<void>;

// =============================================================================
// UI-Specific Types
// =============================================================================

/**
 * Render function for custom rendering
 */
export type RenderFn<T> = (data: T) => React.ReactNode;

/**
 * Cell renderer for tables
 */
export type CellRenderFn<T> = (value: unknown, row: T, columnKey: string) => React.ReactNode;

/**
 * Label formatter function
 */
export type LabelFormatterFn<T> = (value: T) => string;

/**
 * Tooltip content generator
 */
export type TooltipFn<T> = (data: T) => string | React.ReactNode;

/**
 * Action handler with item context
 */
export type ActionHandler<T> = (item: T, action: string) => void | Promise<void>;

// =============================================================================
// Modal and Dialog Types
// =============================================================================

/**
 * Modal open handler
 */
export type OnOpenCallback = () => void;

/**
 * Modal close handler
 */
export type OnCloseCallback = () => void;

/**
 * Confirm dialog handler
 */
export type OnConfirmCallback = () => void | Promise<void>;

/**
 * Cancel dialog handler
 */
export type OnCancelCallback = () => void;

/**
 * Dialog result handler
 */
export type DialogResultHandler<T> = (result: T | null) => void;

// =============================================================================
// Navigation Types
// =============================================================================

/**
 * Navigation handler
 */
export type OnNavigateCallback = (path: string) => void;

/**
 * Tab change handler
 */
export type OnTabChangeCallback = (tabId: string) => void;

/**
 * Breadcrumb click handler
 */
export type OnBreadcrumbClickCallback = (path: string, index: number) => void;

// =============================================================================
// Utility Type Helpers
// =============================================================================

/**
 * Extract the parameter type from a callback
 */
export type CallbackParam<T> = T extends Callback<infer P> ? P : never;

/**
 * Extract the return type from a callback with return
 */
export type CallbackReturn<T> = T extends CallbackWithReturn<unknown, infer R> ? R : never;

/**
 * Make a callback optional
 */
export type OptionalCallback<T extends (...args: never[]) => unknown> = T | undefined;

/**
 * Create a debounced callback type
 */
export type DebouncedCallback<T extends (...args: never[]) => unknown> = T & {
  cancel: () => void;
  flush: () => void;
};

