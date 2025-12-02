'use client';

import type { DataTableColumn } from './types';
import { getAlignmentClass } from './utils';

/** Sort direction for aria-sort attribute */
type SortDirection = 'ascending' | 'descending' | 'none';

interface DataTableHeaderProps<T> {
    columns: DataTableColumn<T>[];
    sortable?: boolean | undefined;
    onSort?: ((key: keyof T) => void) | undefined;
    getSortIcon?: ((key: keyof T) => React.ReactNode) | undefined;
    /** Current sort key for aria-sort attribute */
    currentSortKey?: keyof T | undefined;
    /** Current sort direction for aria-sort attribute */
    currentSortDirection?: SortDirection | undefined;
    selectable?: boolean | undefined;
    selectionMode?: 'single' | 'multi' | undefined;
    isAllSelected?: boolean | undefined;
    onSelectAll?: ((checked: boolean) => void) | undefined;
    expandable?: boolean | undefined;
    stickyHeader?: boolean | undefined;
    density?: 'normal' | 'compact' | undefined;
}

export function DataTableHeader<T>({
    columns,
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
}: DataTableHeaderProps<T>) {
    const paddingClass = density === 'compact' ? 'py-2' : 'py-3';

    return (
        <thead
            className={`text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60 ${stickyHeader ? 'sticky top-0 z-10' : ''
                }`}
        >
            <tr>
                {expandable && (
                    <th className={`px-2 first:pl-5 last:pr-5 ${paddingClass} whitespace-nowrap w-px`}>
                        <span className="sr-only">Expand</span>
                    </th>
                )}

                {columns.map((column) => {
                    if (column.key === 'checkbox') {
                        return (
                            <th
                                key="checkbox"
                                className={`px-2 first:pl-5 last:pr-5 ${paddingClass} whitespace-nowrap w-px`}
                            >
                                {selectable && selectionMode === 'multi' && onSelectAll && (
                                    <div className="flex items-center">
                                        <label className="inline-flex">
                                            <span className="sr-only">Select all</span>
                                            <input
                                                className="form-checkbox"
                                                type="checkbox"
                                                onChange={(e) => onSelectAll(e.target.checked)}
                                                checked={isAllSelected}
                                            />
                                        </label>
                                    </div>
                                )}
                            </th>
                        );
                    }

                    if (column.key === 'actions') {
                        return (
                            <th
                                key="actions"
                                className={`px-2 first:pl-5 last:pr-5 ${paddingClass} whitespace-nowrap w-px`}
                            >
                                <span className="sr-only">{column.header || 'Actions'}</span>
                            </th>
                        );
                    }

                    const alignClass = getAlignmentClass(column.align);
                    const widthStyle = column.width ? { width: column.width } : undefined;
                    
                    // Determine aria-sort value for sortable columns
                    const isSortedColumn = currentSortKey === column.key;
                    const ariaSortValue = sortable && column.sortable
                        ? isSortedColumn && currentSortDirection
                            ? currentSortDirection
                            : 'none'
                        : undefined;

                    return (
                        <th
                            key={String(column.key)}
                            className={`px-2 first:pl-5 last:pr-5 ${paddingClass} whitespace-nowrap ${column.className || ''}`}
                            style={widthStyle}
                            aria-sort={ariaSortValue}
                        >
                            {sortable && column.sortable && onSort ? (
                                <button
                                    type="button"
                                    onClick={() => onSort(column.key as keyof T)}
                                    className={`flex items-center gap-1 font-semibold hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer ${alignClass}`}
                                >
                                    <span>{column.header}</span>
                                    {getSortIcon?.(column.key as keyof T)}
                                </button>
                            ) : (
                                <div className={`font-semibold ${alignClass}`}>{column.header}</div>
                            )}
                        </th>
                    );
                })}
            </tr>
        </thead>
    );
}
