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
  hasNext: providedHasNext
}: PaginationClassicProps) {
  // Use provided values or calculate defaults
  const startItem = providedStartItem ?? (totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1);
  const endItem = providedEndItem ?? Math.min(currentPage * itemsPerPage, totalItems);
  const hasPrevious = providedHasPrevious ?? (currentPage > 1);
  const hasNext = providedHasNext ?? (endItem < totalItems);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
      <nav className="mb-4 sm:mb-0 sm:order-1" role="navigation" aria-label="Navigation">
        <ul className="flex justify-center">
          <li className="ml-3 first:ml-0">
            {hasPrevious ? (
              <button 
                onClick={onPrevious}
                className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
              >
                &lt;- Previous
              </button>
            ) : (
              <span className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-300 dark:text-gray-600">
                &lt;- Previous
              </span>
            )}
          </li>
          <li className="ml-3 first:ml-0">
            {hasNext ? (
              <button 
                onClick={onNext}
                className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
              >
                Next -&gt;
              </button>
            ) : (
              <span className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-300 dark:text-gray-600">
                Next -&gt;
              </span>
            )}
          </li>
        </ul>
      </nav>
      <div className="text-sm text-gray-500 text-center sm:text-left">
        {totalItems === 0 ? (
          'No results'
        ) : (
          <>
            Showing <span className="font-medium text-gray-600 dark:text-gray-300">{startItem}</span> to{' '}
            <span className="font-medium text-gray-600 dark:text-gray-300">{endItem}</span> of{' '}
            <span className="font-medium text-gray-600 dark:text-gray-300">{totalItems}</span> results
          </>
        )}
      </div>
    </div>
  );
}
