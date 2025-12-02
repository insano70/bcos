'use client';

import PaginationClassic from '@/components/pagination-classic';
import type { DataTablePaginationState } from './types';

interface DataTablePaginationProps {
    pagination: DataTablePaginationState;
    isLoading?: boolean;
}

export function DataTablePagination({ pagination, isLoading }: DataTablePaginationProps) {
    if (isLoading || pagination.totalItems === 0) return null;

    return (
        <div className="mt-8">
            <PaginationClassic
                currentPage={pagination.currentPage}
                totalItems={pagination.totalItems}
                itemsPerPage={pagination.itemsPerPage}
                startItem={pagination.startItem}
                endItem={pagination.endItem}
                hasPrevious={pagination.hasPrevious}
                hasNext={pagination.hasNext}
                onPrevious={pagination.goToPrevious}
                onNext={pagination.goToNext}
            />
        </div>
    );
}
