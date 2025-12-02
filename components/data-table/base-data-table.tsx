'use client';

import { type ReactNode, memo } from 'react';
import { DataTableHeader } from './data-table-header';
import type { DataTableColumn } from './types';

/** Default max height for sticky header scroll container */
const DEFAULT_MAX_HEIGHT = 600;
/** Default number of skeleton rows shown during loading */
const DEFAULT_LOADING_SKELETON_ROWS = 5;

interface BaseDataTableProps<T> {
    title: string;
    data: T[];
    columns: DataTableColumn<T>[];
    isLoading?: boolean;
    emptyState?: {
        title: string;
        description?: string;
        icon?: ReactNode;
    } | undefined;

    // Header Props
    sortable?: boolean | undefined;
    onSort?: ((key: keyof T) => void) | undefined;
    getSortIcon?: ((key: keyof T) => ReactNode) | undefined;
    /** Current sort key for aria-sort attribute */
    currentSortKey?: keyof T | undefined;
    /** Current sort direction for aria-sort attribute */
    currentSortDirection?: 'ascending' | 'descending' | 'none' | undefined;
    selectable?: boolean | undefined;
    selectionMode?: 'single' | 'multi' | undefined;
    isAllSelected?: boolean | undefined;
    onSelectAll?: ((checked: boolean) => void) | undefined;

    // Layout Props
    expandable?: boolean | undefined;
    stickyHeader?: boolean | undefined;
    density?: 'normal' | 'compact' | undefined;
    /** Max height in pixels for sticky header scroll container. Default: 600 */
    maxHeight?: number | undefined;
    /** Number of skeleton rows to show during loading. Default: 5 */
    loadingSkeletonRows?: number | undefined;

    // Render Props
    children: ReactNode; // The tbody content
}

export function BaseDataTableComponent<T>({
    title,
    data,
    columns,
    isLoading,
    emptyState,
    sortable,
    onSort,
    getSortIcon,
    currentSortKey,
    currentSortDirection,
    selectable,
    selectionMode,
    isAllSelected,
    onSelectAll,
    expandable,
    stickyHeader,
    density,
    maxHeight = DEFAULT_MAX_HEIGHT,
    loadingSkeletonRows = DEFAULT_LOADING_SKELETON_ROWS,
    children,
}: BaseDataTableProps<T>) {
    const scrollContainerStyle = stickyHeader ? { maxHeight: `${maxHeight}px` } : undefined;

    return (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl relative">
            <header className="px-5 py-4">
                <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                    {title}{' '}
                    <span className="text-gray-400 dark:text-gray-500 font-medium">{data.length}</span>
                </h2>
            </header>
            <div>
                <div
                    className={`overflow-x-auto ${stickyHeader ? 'overflow-y-auto' : ''}`}
                    style={scrollContainerStyle}
                >
                    <table className="table-auto w-full dark:text-gray-300">
                        <DataTableHeader
                            columns={columns}
                            sortable={!!sortable}
                            onSort={onSort}
                            getSortIcon={getSortIcon}
                            currentSortKey={currentSortKey}
                            currentSortDirection={currentSortDirection}
                            selectable={!!selectable}
                            selectionMode={selectionMode}
                            isAllSelected={isAllSelected}
                            onSelectAll={onSelectAll}
                            expandable={!!expandable}
                            stickyHeader={!!stickyHeader}
                            density={density}
                        />
                        <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                            {isLoading ? (
                                // Loading skeleton
                                Array.from({ length: loadingSkeletonRows }, (_, idx) => idx).map((idx) => (
                                    <tr key={`skeleton-${idx}`}>
                                        {expandable && (
                                            <td className="px-2 first:pl-5 last:pr-5 py-3">
                                                <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                                            </td>
                                        )}
                                        {columns.map((col) => (
                                            <td
                                                key={`skeleton-col-${idx}-${String(col.key)}`}
                                                className="px-2 first:pl-5 last:pr-5 py-3"
                                            >
                                                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : data.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={columns.length + (expandable ? 1 : 0)}
                                        className="px-2 first:pl-5 last:pr-5 py-12 text-center"
                                    >
                                        {emptyState ? (
                                            <>
                                                {emptyState.icon && <div className="mb-2">{emptyState.icon}</div>}
                                                <div className="text-gray-500 dark:text-gray-400">{emptyState.title}</div>
                                                {emptyState.description && (
                                                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
                                                        {emptyState.description}
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <div className="text-gray-500 dark:text-gray-400">No data found</div>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                children
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export const BaseDataTable = memo(BaseDataTableComponent) as typeof BaseDataTableComponent;
