'use client';

import { memo } from 'react';
import { Button } from '@/components/ui/button';
import type { DataTableBulkAction } from './types';

/** Configurable labels for i18n support */
export interface DataTableToolbarLabels {
    addRow?: string;
    adding?: string;
    selected?: (count: number) => string;
    exportCsv?: string;
    densityNormal?: string;
    densityCompact?: string;
    switchToCompact?: string;
    switchToNormal?: string;
    searchAriaLabel?: string;
}

/** Default English labels */
const DEFAULT_LABELS: Required<DataTableToolbarLabels> = {
    addRow: '+ Add Row',
    adding: 'Adding...',
    selected: (count) => `${count} selected`,
    exportCsv: 'Export CSV',
    densityNormal: 'Normal',
    densityCompact: 'Compact',
    switchToCompact: 'Switch to compact view',
    switchToNormal: 'Switch to normal view',
    searchAriaLabel: 'Search table',
};

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

    // i18n
    labels?: DataTableToolbarLabels | undefined;
}

function DataTableToolbarInner<T>({
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
    labels: customLabels,
}: DataTableToolbarProps<T>) {
    // Merge custom labels with defaults
    const labels = { ...DEFAULT_LABELS, ...customLabels };
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
                            {labels.selected(selectedItemsCount)}
                        </span>
                    ) : searchable ? (
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            value={searchQuery}
                            onChange={(e) => onSearchChange?.(e.target.value)}
                            className="form-input w-full"
                            aria-label={labels.searchAriaLabel}
                        />
                    ) : (
                        <div />
                    )}
                </div>

                {/* Right side - Actions */}
                <div className="flex items-center gap-2">
                    {/* Quick Add */}
                    {onQuickAdd && (
                        <Button
                            variant="primary"
                            onClick={onQuickAdd}
                            disabled={isQuickAdding}
                        >
                            {isQuickAdding ? labels.adding : labels.addRow}
                        </Button>
                    )}

                    {/* Bulk Actions */}
                    {showBulkActions &&
                        bulkActions?.map((action) => (
                            <Button
                                key={action.label}
                                variant={action.variant === 'danger' ? 'danger' : 'primary'}
                                size="sm"
                                onClick={() => onBulkAction?.(action)}
                                leftIcon={action.icon}
                            >
                                {action.label}
                            </Button>
                        ))}

                    {/* Density Toggle */}
                    {densityToggle && onDensityChange && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onDensityChange(density === 'normal' ? 'compact' : 'normal')}
                            title={density === 'normal' ? labels.switchToCompact : labels.switchToNormal}
                            leftIcon={
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
                            }
                        >
                            {density === 'normal' ? labels.densityNormal : labels.densityCompact}
                        </Button>
                    )}

                    {/* Export */}
                    {exportable && onExport && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onExport}
                        >
                            {labels.exportCsv}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

export const DataTableToolbar = memo(DataTableToolbarInner) as typeof DataTableToolbarInner;
