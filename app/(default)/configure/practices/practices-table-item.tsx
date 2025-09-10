import type { Practice } from './practices-table';

interface PracticesTableItemProps {
  practice: Practice;
  onCheckboxChange: (id: string, checked: boolean) => void;
  isSelected: boolean;
}

export default function PracticesTableItem({
  practice,
  onCheckboxChange,
  isSelected,
}: PracticesTableItemProps) {
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckboxChange(practice.id, e.target.checked);
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return '-';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      case 'inactive':
        return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      case 'pending':
        return 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'text-gray-700 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  return (
    <tr>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="flex items-center">
          <label className="inline-flex">
            <span className="sr-only">Select</span>
            <input
              className="form-checkbox"
              type="checkbox"
              onChange={handleCheckboxChange}
              checked={isSelected}
            />
          </label>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="flex items-center">
          <div className="w-10 h-10 shrink-0 mr-2 sm:mr-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium text-sm">
              🏥
            </div>
          </div>
          <div className="font-medium text-gray-800 dark:text-gray-100">{practice.name}</div>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left">
          <a
            href={`https://${practice.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {practice.domain}
          </a>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left text-gray-600 dark:text-gray-400">{practice.template_name}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-center">
          <span
            className={`inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
              practice.status
            )}`}
          >
            {practice.status.charAt(0).toUpperCase() + practice.status.slice(1)}
          </span>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left text-gray-600 dark:text-gray-400">{practice.owner_email}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left text-gray-500 dark:text-gray-400">
          {formatDate(practice.created_at)}
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        {/* Actions */}
        <div className="flex items-center space-x-2">
          <a
            href={`/configure/practices/${practice.id}`}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          >
            Edit
          </a>
          <span className="text-gray-300">|</span>
          <a
            href={`/template-preview/${practice.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
          >
            Preview
          </a>
        </div>
      </td>
    </tr>
  );
}
