'use client';

import type { DataTableBulkAction } from './types';

interface DataTableToolbarProps<T> {
    // Search
    searchable?: boolean | undefined;
    searchPlaceholder?: string | undefined;
    searchQuery?: string | undefined;
    onSearchChange?: ((value: string) => void) | undefined;

    // Actions
    bulkActions?: DataTableBulkAction<T>[] | undefined;
    selectedItemsCount?: number | undefined;
    onBulkAction?: ((action: DataTableBulkAction<T>) => void) | undefined;

    // Quick Add
    onQuickAdd?: (() => void) | undefined;
    isQuickAdding?: boolean | undefined;

    // Density
    densityToggle?: boolean | undefined;
    density?: 'normal' | 'compact' | undefined;
    onDensityChange?: ((density: 'normal' | 'compact') => void) | undefined;

    // Export
    exportable?: boolean | undefined;
    onExport?: (() => void) | undefined;
}

export function DataTableToolbar<T>({
    searchable,
    searchPlaceholder,
    searchQuery,
    onSearchChange,
    bulkActions,
    selectedItemsCount = 0,
    onBulkAction,
    onQuickAdd,
    isQuickAdding,
    densityToggle,
    density,
    onDensityChange,
    exportable,
    onExport,
}: DataTableToolbarProps<T>) {
    const showBulkActions = bulkActions && bulkActions.length > 0 && selectedItemsCount > 0;

    if (
        !searchable &&
        !exportable &&
        !densityToggle &&
        !showBulkActions &&
        !onQuickAdd
    ) {
        return null;
    }

    return (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Left side - Search or Selection Count */}
                <div className="flex-1 min-w-[200px] max-w-md flex items-center gap-4">
                    {showBulkActions ? (
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            {selectedItemsCount} selected
                        </span>
                    ) : searchable ? (
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            value={searchQuery}
                            onChange={(e) => onSearchChange?.(e.target.value)}
                            className="form-input w-full"
                        />
                    ) : (
                        <div />
                    )}
                </div>

                {/* Right side - Actions */}
                <div className="flex items-center gap-2">
                    {/* Quick Add */}
                    {onQuickAdd && (
                        <button
                            type="button"
                            onClick={onQuickAdd}
                            disabled={isQuickAdding}
                            className="btn bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-60"
                        >
                            {isQuickAdding ? 'Adding...' : '+ Add Row'}
                        </button>
                    )}

                    {/* Bulk Actions */}
                    {showBulkActions &&
                        bulkActions?.map((action) => (
                            <button
                                key={action.label}
                                type="button"
                                onClick={() => onBulkAction?.(action)}
                                className={`btn-sm ${action.variant === 'danger'
                                        ? 'bg-red-500 hover:bg-red-600 text-white'
                                        : 'bg-gray-900 hover:bg-gray-800 text-gray-100'
                                    }`}
                            >
                                {action.icon && <span className="mr-1">{action.icon}</span>}
                                {action.label}
                            </button>
                        ))}

                    {/* Density Toggle */}
                    {densityToggle && onDensityChange && (
                        <button
                            type="button"
                            onClick={() => onDensityChange(density === 'normal' ? 'compact' : 'normal')}
                            className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300"
                            title={density === 'normal' ? 'Switch to compact view' : 'Switch to normal view'}
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                                {density === 'normal' ? (
                                    <>
                                        <rect x="2" y="3" width="12" height="1" />
                                        <rect x="2" y="7" width="12" height="1" />
                                        <rect x="2" y="11" width="12" height="1" />
                                    </>
                                ) : (
                                    <>
                                        <rect x="2" y="2" width="12" height="1" />
                                        <rect x="2" y="5" width="12" height="1" />
                                        <rect x="2" y="8" width="12" height="1" />
                                        <rect x="2" y="11" width="12" height="1" />
                                    </>
                                )}
                            </svg>
                            <span className="ml-2">{density === 'normal' ? 'Normal' : 'Compact'}</span>
                        </button>
                    )}

                    {/* Export */}
                    {exportable && onExport && (
                        <button
                            type="button"
                            onClick={onExport}
                            className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300"
                        >
                            Export CSV
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
