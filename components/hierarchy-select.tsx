'use client';

import { motion, type PanInfo } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Generic Hierarchy Select Component
 *
 * A mobile-friendly, fully responsive hierarchical dropdown with type-ahead filtering.
 * Works with any hierarchical data structure (organizations, categories, work items, etc.).
 *
 * Features:
 * - Type-ahead search/filtering
 * - Touch-friendly mobile interface
 * - Responsive design with bottom sheet on mobile
 * - Keyboard navigation
 * - Visual hierarchy with indentation
 * - Optional tree lines and icons
 * - Accessibility (ARIA labels, screen reader support)
 */

/**
 * Base interface for items that can be used in hierarchy select.
 * All hierarchy items must have at least an id and name field,
 * with optional parent reference for building the tree structure.
 */
export interface HierarchyItemBase {
  /** Allow any property values for flexibility with different data structures */
  [key: string]: unknown;
}

/**
 * Concrete hierarchy item with computed level
 */
export interface HierarchyItem extends HierarchyItemBase {
  id: string | number;
  name: string;
  level: number;
  isActive?: boolean;
}

export interface HierarchySelectProps<T extends HierarchyItemBase> {
  // Required
  items: T[];
  value: string | number | undefined;
  onChange: (value: string | number | undefined) => void;

  // Field mapping
  idField: keyof T;
  nameField: keyof T;
  parentField: keyof T;

  // Optional configuration
  activeField?: keyof T;
  searchFields?: (keyof T)[];

  // UI customization
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  allowClear?: boolean;
  showSearch?: boolean;

  // Visual options
  indentSize?: number;
  showTreeLines?: boolean;
  showIcons?: boolean;
  renderCustomItem?: (item: T, level: number) => React.ReactNode;

  // Filtering
  filter?: (item: T) => boolean;
  rootLabel?: string;
}

export default function HierarchySelect<T extends HierarchyItemBase>({
  items,
  value,
  onChange,
  idField,
  nameField,
  parentField,
  activeField = 'is_active',
  searchFields,
  placeholder = 'Select...',
  label,
  required = false,
  disabled = false,
  error,
  allowClear = true,
  showSearch = true,
  indentSize = 4,
  showTreeLines = false,
  showIcons = false,
  renderCustomItem,
  filter,
  rootLabel = 'None',
}: HierarchySelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  
  // Drag-to-dismiss state for mobile bottom sheet
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Tailwind md breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Track virtual keyboard on mobile using visualViewport API
  // When keyboard appears, adjust bottom sheet position to stay above it
  useEffect(() => {
    if (!isMobile || !isOpen) {
      setKeyboardOffset(0);
      return;
    }

    const handleViewportResize = () => {
      if (window.visualViewport) {
        // Calculate keyboard height: difference between window height and visual viewport height
        // The visual viewport shrinks when the keyboard appears
        const keyboardHeight = window.innerHeight - window.visualViewport.height;
        // Only set offset if keyboard is actually showing (height > 0)
        // Add a small threshold to avoid false positives from browser chrome changes
        setKeyboardOffset(keyboardHeight > 50 ? keyboardHeight : 0);
      }
    };

    // Listen to visualViewport resize events
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('scroll', handleViewportResize);
    
    // Initial check in case keyboard is already open
    handleViewportResize();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('scroll', handleViewportResize);
    };
  }, [isMobile, isOpen]);

  // Build hierarchical structure
  const hierarchicalItems = useMemo(() => {
    let filteredItems = items;

    // Filter by active field
    if (activeField) {
      filteredItems = items.filter((item) => {
        const isActive = item[activeField];
        return isActive === true || isActive === undefined;
      });
    }

    // Apply custom filter
    if (filter) {
      filteredItems = filteredItems.filter(filter);
    }

    // Build hierarchy recursively
    const buildHierarchy = (
      parentId: string | number | null | undefined = null,
      level = 0
    ): HierarchyItem[] => {
      const children = filteredItems.filter((item) => {
        const itemParentId = item[parentField];
        if (parentId === null || parentId === undefined) {
          return itemParentId === null || itemParentId === undefined;
        }
        return itemParentId === parentId;
      });

      // Sort children alphabetically by name (case-insensitive)
      const sortedChildren = [...children].sort((a, b) => {
        const nameA = String(a[nameField]).toLowerCase();
        const nameB = String(b[nameField]).toLowerCase();
        return nameA.localeCompare(nameB);
      });

      return sortedChildren.flatMap((item) => {
        const hierarchyItem: HierarchyItem = {
          id: item[idField] as string | number,
          name: item[nameField] as string,
          level,
          ...item,
        };

        const descendants = buildHierarchy(item[idField] as string | number, level + 1);
        return [hierarchyItem, ...descendants];
      });
    };

    return buildHierarchy();
  }, [items, idField, nameField, parentField, activeField, filter]);

  // Filter based on search term
  const filteredHierarchy = useMemo(() => {
    if (!showSearch || !searchTerm.trim()) {
      return hierarchicalItems;
    }

    const lowerSearch = searchTerm.toLowerCase();
    const fieldsToSearch = searchFields || [nameField];

    return hierarchicalItems.filter((item) => {
      return fieldsToSearch.some((field) => {
        const fieldValue = item[field as keyof HierarchyItem];
        return String(fieldValue).toLowerCase().includes(lowerSearch);
      });
    });
  }, [hierarchicalItems, searchTerm, showSearch, searchFields, nameField]);

  // Get selected item
  const selectedItem = hierarchicalItems.find((item) => item.id === value);

  // Event handlers
  const handleSelect = (itemId: string | number | undefined) => {
    onChange(itemId);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Auto-focus search input on desktop
  useEffect(() => {
    if (isOpen && showSearch && searchInputRef.current && !isMobile) {
      searchInputRef.current.focus();
    }
  }, [isOpen, showSearch, isMobile]);

  // Prevent body scroll on mobile when dropdown is open
  useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, isMobile]);

  // Reset drag state when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setDragY(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  // Drag handlers for swipe-to-dismiss on mobile
  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Only allow downward dragging (positive Y)
    if (info.offset.y > 0) {
      setDragY(info.offset.y);
    }
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    
    // Dismiss thresholds:
    // - Distance: dragged more than 100px down
    // - Velocity: flicked down faster than 500px/s
    const shouldDismiss = info.offset.y > 100 || info.velocity.y > 500;
    
    if (shouldDismiss) {
      setIsOpen(false);
      setSearchTerm('');
    }
    
    // Reset drag position (springs back if not dismissed)
    setDragY(0);
  };

  // Render tree lines helper
  const getTreePrefix = (level: number, isLast: boolean) => {
    if (!showTreeLines || level === 0) return '';
    const prefix = '\u00A0'.repeat((level - 1) * 2);
    const connector = isLast ? '└─' : '├─';
    return `${prefix}${connector}\u00A0`;
  };

  // Render icon helper
  const getIcon = (item: HierarchyItem) => {
    if (!showIcons) return null;

    const hasChildren = hierarchicalItems.some(
      (i) => i[parentField as string] === item.id
    );

    return <span className="mr-2 text-gray-500">{hasChildren ? '📁' : '📄'}</span>;
  };

  return (
    <div ref={dropdownRef} className="relative w-full">
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Trigger Button - Touch-friendly on mobile (min 44px height) */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        className={`
          w-full px-3 py-2 min-h-[44px] text-left border rounded-md shadow-sm
          flex items-center justify-between
          transition-colors duration-150
          ${
            disabled
              ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700'
              : 'cursor-pointer bg-white dark:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 active:bg-gray-50 dark:active:bg-gray-600'
          }
          ${error ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'}
          text-gray-800 dark:text-gray-100
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label || placeholder}
      >
        <span
          className={`truncate flex-1 ${selectedItem ? '' : 'text-gray-500 dark:text-gray-400'}`}
        >
          {selectedItem
            ? `${'\u00A0'.repeat(selectedItem.level * indentSize)}${selectedItem.name}`
            : placeholder}
        </span>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {allowClear && selectedItem && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors touch-manipulation cursor-pointer"
              aria-label="Clear selection"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 20 20"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Error Message */}
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Dropdown - Desktop: Absolute, Mobile: Fixed Bottom Sheet */}
      {isOpen && (
        <>
          {/* Mobile Backdrop */}
          {isMobile && (
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* Dropdown Container - Uses motion.div on mobile for swipe-to-dismiss */}
          <motion.div
            className={`
              ${
                isMobile
                  ? 'fixed inset-x-0 z-50 rounded-t-2xl md:hidden touch-none'
                  : 'absolute z-50 w-full mt-1 rounded-lg max-h-80 hidden md:flex'
              }
              bg-white dark:bg-gray-800
              border border-gray-300 dark:border-gray-600
              shadow-lg
              flex flex-col
              ${isMobile && keyboardOffset > 0 && !isDragging ? 'transition-[bottom,max-height] duration-150 ease-out' : ''}
            `}
            style={
              isMobile
                ? {
                    bottom: keyboardOffset,
                    // When keyboard is visible, reduce max-height to fit in remaining space
                    // Account for safe area at top and leave some padding
                    maxHeight: keyboardOffset > 0
                      ? `calc(100vh - ${keyboardOffset}px - env(safe-area-inset-top, 0px) - 20px)`
                      : '85vh',
                  }
                : {}
            }
            // Framer Motion drag props (only active on mobile)
            drag={isMobile ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.2 }}
            // Apply drag offset and entry animation
            initial={isMobile ? { y: '100%' } : { opacity: 1 }}
            animate={isMobile ? { y: dragY } : { opacity: 1 }}
            transition={isDragging ? { type: 'tween', duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }}
            // Conditionally spread drag handlers only on mobile (avoids exactOptionalPropertyTypes issues)
            {...(isMobile ? {
              onDragStart: handleDragStart,
              onDrag: handleDrag,
              onDragEnd: handleDragEnd,
            } : {})}
            role="listbox"
            aria-label={label || 'Select an option'}
          >
            {/* Mobile Handle - Visual indicator for swipe gesture */}
            {isMobile && (
              <div 
                className="flex justify-center py-3 border-b border-gray-200 dark:border-gray-700 cursor-grab active:cursor-grabbing"
              >
                <div className="w-10 h-1.5 bg-gray-300 dark:bg-gray-500 rounded-full" />
              </div>
            )}

            {/* Mobile Header */}
            {isMobile && label && (
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{label}</h3>
              </div>
            )}

            {/* Search Input - Larger touch target on mobile */}
            {/* touch-auto prevents triggering sheet drag when interacting with search */}
            {showSearch && (
              <div 
                className={`p-3 md:p-2 border-b border-gray-200 dark:border-gray-700 touch-auto`}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 md:w-4 md:h-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 20 20"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search..."
                    className={`
                      w-full pl-9 pr-3 border border-gray-300 dark:border-gray-600 rounded
                      bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      ${isMobile ? 'py-3 text-base' : 'py-2 text-sm'}
                    `}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                  />
                </div>
              </div>
            )}

            {/* Items List - Scrollable with momentum on mobile */}
            {/* touch-auto allows normal scrolling within the list without triggering sheet drag */}
            <div
              className="overflow-y-auto flex-1 overscroll-contain touch-auto"
              style={{ WebkitOverflowScrolling: 'touch' }}
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              {/* Root/None Option */}
              {allowClear && (
                <button
                  type="button"
                  onClick={() => handleSelect(undefined)}
                  className={`
                    w-full text-left hover:bg-gray-100 dark:hover:bg-gray-700
                    active:bg-gray-200 dark:active:bg-gray-600
                    text-gray-800 dark:text-gray-100
                    transition-colors touch-manipulation
                    ${isMobile ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm'}
                  `}
                  role="option"
                  aria-selected={value === undefined}
                >
                  {rootLabel}
                </button>
              )}

              {/* Hierarchical Items */}
              {filteredHierarchy.length > 0 ? (
                filteredHierarchy.map((item, index) => {
                  const isLast =
                    index === filteredHierarchy.length - 1 ||
                    ((filteredHierarchy[index + 1]?.level ?? 0) <= item.level);
                  const isSelected = value === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={`
                        w-full text-left hover:bg-gray-100 dark:hover:bg-gray-700
                        active:bg-gray-200 dark:active:bg-gray-600
                        transition-colors touch-manipulation
                        ${isMobile ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm'}
                        ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/20 font-semibold'
                            : 'text-gray-800 dark:text-gray-100'
                        }
                      `}
                      role="option"
                      aria-selected={isSelected}
                    >
                      {renderCustomItem ? (
                        renderCustomItem(item as unknown as T, item.level)
                      ) : (
                        <div className="flex items-center">
                          {showIcons && getIcon(item)}
                          <span className="flex-1 truncate">
                            {showTreeLines
                              ? getTreePrefix(item.level, isLast)
                              : '\u00A0'.repeat(item.level * indentSize)}
                            {item.name}
                          </span>
                          {isSelected && (
                            <svg
                              className="w-5 h-5 ml-2 flex-shrink-0 text-blue-600 dark:text-blue-400"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })
              ) : (
                <div
                  className={`
                    text-center text-gray-500 dark:text-gray-400
                    ${isMobile ? 'px-4 py-12 text-base' : 'px-3 py-8 text-sm'}
                  `}
                >
                  {searchTerm ? 'No matches found' : 'No items available'}
                </div>
              )}

              {/* Mobile Safe Area Bottom Padding */}
              {isMobile && <div className="h-8" />}
            </div>
          </motion.div>
        </>
      )}

      {/* Custom CSS for mobile slide-up animation */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
