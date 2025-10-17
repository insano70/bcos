'use client';

import { useState } from 'react';
import type { ChartFilter } from '@/lib/types/analytics';

/**
 * Advanced Filter Builder Component
 * Supports multiple conditions, AND/OR logic, and nested filter groups
 */

type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'like'
  | 'between';

interface FilterGroup {
  id: string;
  logic: 'AND' | 'OR';
  filters: ChartFilter[];
  groups: FilterGroup[];
}

interface AdvancedFilterBuilderProps {
  availableFields: Array<{
    name: string;
    displayName: string;
    type: string;
    allowedValues?: string[];
  }>;
  onFiltersChange: (filters: ChartFilter[]) => void;
  initialFilters?: ChartFilter[];
}

const OPERATORS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater than or equal' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less than or equal' },
  { value: 'in', label: 'in list' },
  { value: 'not_in', label: 'not in list' },
  { value: 'like', label: 'contains' },
  { value: 'between', label: 'between' },
];

export default function AdvancedFilterBuilder({
  availableFields,
  onFiltersChange,
  initialFilters = [],
}: AdvancedFilterBuilderProps) {
  const [rootGroup, setRootGroup] = useState<FilterGroup>({
    id: 'root',
    logic: 'AND',
    filters: initialFilters,
    groups: [],
  });

  const addFilter = (groupId: string) => {
    const newFilter: ChartFilter = {
      field: availableFields[0]?.name || '',
      operator: 'eq',
      value: '',
    };

    updateGroup(groupId, (group) => ({
      ...group,
      filters: [...group.filters, newFilter],
    }));
  };

  const removeFilter = (groupId: string, filterIndex: number) => {
    updateGroup(groupId, (group) => ({
      ...group,
      filters: group.filters.filter((_, index) => index !== filterIndex),
    }));
  };

  const updateFilter = (groupId: string, filterIndex: number, updates: Partial<ChartFilter>) => {
    updateGroup(groupId, (group) => ({
      ...group,
      filters: group.filters.map((filter, index) =>
        index === filterIndex ? { ...filter, ...updates } : filter
      ),
    }));
  };

  const addGroup = (parentGroupId: string) => {
    const newGroup: FilterGroup = {
      id: `group_${Date.now()}`,
      logic: 'AND',
      filters: [],
      groups: [],
    };

    updateGroup(parentGroupId, (group) => ({
      ...group,
      groups: [...group.groups, newGroup],
    }));
  };

  const updateGroup = (groupId: string, updater: (group: FilterGroup) => FilterGroup) => {
    const updateGroupRecursive = (group: FilterGroup): FilterGroup => {
      if (group.id === groupId) {
        return updater(group);
      }
      return {
        ...group,
        groups: group.groups.map(updateGroupRecursive),
      };
    };

    const updatedRoot = updateGroupRecursive(rootGroup);
    setRootGroup(updatedRoot);

    // Convert to flat filter array and notify parent
    const flatFilters = flattenFilters(updatedRoot);
    onFiltersChange(flatFilters);
  };

  const flattenFilters = (group: FilterGroup): ChartFilter[] => {
    const filters = [...group.filters];
    group.groups.forEach((subGroup) => {
      filters.push(...flattenFilters(subGroup));
    });
    return filters;
  };

  const renderFilterGroup = (group: FilterGroup, depth: number = 0) => {
    return (
      <div
        key={group.id}
        className={`border border-gray-200 dark:border-gray-700 rounded-lg p-4 ${
          depth > 0 ? 'ml-6 mt-3' : ''
        }`}
      >
        {/* Group Logic Selector */}
        {(group.filters.length > 1 || group.groups.length > 0) && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Logic:</span>
            <select
              value={group.logic}
              onChange={(e) =>
                updateGroup(group.id, (g) => ({ ...g, logic: e.target.value as 'AND' | 'OR' }))
              }
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
          </div>
        )}

        {/* Filters */}
        {group.filters.map((filter, index) => (
          <div key={index} className="flex items-center gap-3 mb-3">
            {/* Field Selector */}
            <select
              value={filter.field}
              onChange={(e) => updateFilter(group.id, index, { field: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {availableFields.map((field) => (
                <option key={field.name} value={field.name}>
                  {field.displayName}
                </option>
              ))}
            </select>

            {/* Operator Selector */}
            <select
              value={filter.operator}
              onChange={(e) =>
                updateFilter(group.id, index, { operator: e.target.value as FilterOperator })
              }
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {/* Value Input */}
            {renderValueInput(group.id, index, filter)}

            {/* Remove Filter Button */}
            <button
              onClick={() => removeFilter(group.id, index)}
              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              title="Remove filter"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}

        {/* Nested Groups */}
        {group.groups.map((subGroup) => renderFilterGroup(subGroup, depth + 1))}

        {/* Add Filter/Group Buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => addFilter(group.id)}
            className="px-3 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            + Add Filter
          </button>

          {depth < 2 && ( // Limit nesting depth
            <button
              onClick={() => addGroup(group.id)}
              className="px-3 py-2 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            >
              + Add Group
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderValueInput = (groupId: string, filterIndex: number, filter: ChartFilter) => {
    const field = availableFields.find((f) => f.name === filter.field);

    if (filter.operator === 'in' || filter.operator === 'not_in') {
      return (
        <textarea
          value={Array.isArray(filter.value) ? filter.value.join('\n') : (filter.value ?? '')}
          onChange={(e) =>
            updateFilter(groupId, filterIndex, {
              value: e.target.value.split('\n').filter((v) => v.trim()),
            })
          }
          placeholder="Enter values (one per line)"
          rows={3}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      );
    }

    if (filter.operator === 'between') {
      const values = Array.isArray(filter.value) ? filter.value : ['', ''];
      return (
        <div className="flex gap-2 flex-1">
          <input
            type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'date' : 'text'}
            value={values[0]?.toString() || ''}
            onChange={(e) =>
              updateFilter(groupId, filterIndex, {
                value: [e.target.value, values[1] || ''],
              })
            }
            placeholder="From"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <input
            type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'date' : 'text'}
            value={values[1]?.toString() || ''}
            onChange={(e) =>
              updateFilter(groupId, filterIndex, {
                value: [values[0] || '', e.target.value],
              })
            }
            placeholder="To"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
      );
    }

    if (field?.allowedValues && field.allowedValues.length > 0) {
      return (
        <select
          value={
            typeof filter.value === 'string' || typeof filter.value === 'number' ? filter.value : ''
          }
          onChange={(e) => updateFilter(groupId, filterIndex, { value: e.target.value })}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          <option value="">Select value...</option>
          {field.allowedValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'date' : 'text'}
        value={filter.value?.toString() || ''}
        onChange={(e) => updateFilter(groupId, filterIndex, { value: e.target.value })}
        placeholder="Enter value"
        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Advanced Filters</h3>
        <button
          onClick={() => setRootGroup({ id: 'root', logic: 'AND', filters: [], groups: [] })}
          className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          Clear All
        </button>
      </div>

      {renderFilterGroup(rootGroup)}

      {/* Filter Summary */}
      {rootGroup.filters.length > 0 && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Active Filters ({flattenFilters(rootGroup).length}):
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            {flattenFilters(rootGroup).map((filter, index) => (
              <div key={index}>
                {availableFields.find((f) => f.name === filter.field)?.displayName}{' '}
                {filter.operator}{' '}
                {Array.isArray(filter.value)
                  ? filter.value.join(', ')
                  : filter.value?.toString() || ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
