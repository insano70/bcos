import { Button } from '@/components/ui/button';

interface PaginationClassicProps {
  currentPage?: number;
  itemsPerPage?: number;
  totalItems?: number;
  onPrevious?: () => void;
  onNext?: () => void;
  startItem?: number;
  endItem?: number;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export default function PaginationClassic({
  currentPage = 1,
  itemsPerPage = 10,
  totalItems = 0,
  onPrevious,
  onNext,
  startItem: providedStartItem,
  endItem: providedEndItem,
  hasPrevious: providedHasPrevious,
  hasNext: providedHasNext,
}: PaginationClassicProps) {
  // Use provided values or calculate defaults
  const startItem =
    providedStartItem ?? (totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1);
  const endItem = providedEndItem ?? Math.min(currentPage * itemsPerPage, totalItems);
  const hasPrevious = providedHasPrevious ?? currentPage > 1;
  const hasNext = providedHasNext ?? endItem < totalItems;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
      <nav className="mb-4 sm:mb-0 sm:order-1" aria-label="Navigation">
        <ul className="flex justify-center">
          <li className="ml-3 first:ml-0">
            <Button variant="secondary" onClick={onPrevious} disabled={!hasPrevious}>
              &lt;- Previous
            </Button>
          </li>
          <li className="ml-3 first:ml-0">
            <Button variant="secondary" onClick={onNext} disabled={!hasNext}>
              Next -&gt;
            </Button>
          </li>
        </ul>
      </nav>
      <div className="text-sm text-gray-500 text-center sm:text-left">
        {totalItems === 0 ? (
          'No results'
        ) : (
          <>
            Showing{' '}
            <span className="font-medium text-gray-600 dark:text-gray-300">{startItem}</span> to{' '}
            <span className="font-medium text-gray-600 dark:text-gray-300">{endItem}</span> of{' '}
            <span className="font-medium text-gray-600 dark:text-gray-300">{totalItems}</span>{' '}
            results
          </>
        )}
      </div>
    </div>
  );
}
