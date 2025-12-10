'use client';

import { memo } from 'react';
import type React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

// Basic skeleton component with shimmer effect
function SkeletonInner({ className = '', style }: SkeletonProps) {
  // Use CSS custom properties for dynamic styling (CSP-compliant)
  const dynamicStyle =
    style && Object.keys(style).length > 0
      ? {
          ...Object.fromEntries(Object.entries(style).map(([key, value]) => [`--${key}`, value])),
          ...style,
        }
      : undefined;

  return (
    <div
      className={`bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer bg-[length:200%_100%] ${className}`}
      style={dynamicStyle}
    />
  );
}

export const Skeleton = memo(SkeletonInner);

// Shimmer card for chart loading - entire card shimmers
function ChartSkeletonInner({ width, height }: { width?: number; height?: number }) {
  // If width/height not specified, fill container with w-full h-full
  const sizeClasses = !width && !height ? 'w-full h-full' : '';
  const inlineStyles =
    width || height
      ? { width: width ? `${width}px` : undefined, height: height ? `${height}px` : undefined }
      : undefined;

  return (
    <div
      className={`bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded-xl animate-shimmer bg-[length:200%_100%] ${sizeClasses}`}
      style={inlineStyles}
    />
  );
}

export const ChartSkeleton = memo(ChartSkeletonInner);

// Table skeleton
function TableSkeletonInner({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div
          className="grid gap-4 skeleton-grid"
          style={{ '--grid-columns': `repeat(${columns}, 1fr)` } as React.CSSProperties}
        >
          {[...Array(columns)].map((_, i) => (
            <Skeleton key={`header-col-${i}`} className="h-4 w-24" />
          ))}
        </div>
      </div>

      {/* Rows */}
      {/* Note: Using index in key for static skeleton array - acceptable as array never changes */}
      {[...Array(rows)].map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} className="border-b border-gray-200 dark:border-gray-700 p-4">
          <div
            className="grid gap-4 skeleton-grid"
            style={{ '--grid-columns': `repeat(${columns}, 1fr)` } as React.CSSProperties}
          >
            {[...Array(columns)].map((_, colIndex) => (
              <Skeleton key={`row-${rowIndex}-col-${colIndex}`} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export const TableSkeleton = memo(TableSkeletonInner);

// Card skeleton
function CardSkeletonInner() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <div className="space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="flex space-x-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </div>
  );
}

export const CardSkeleton = memo(CardSkeletonInner);

// Form skeleton
function FormSkeletonInner({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {/* Note: Using index in key for static skeleton array - acceptable as array never changes */}
      {[...Array(fields)].map((_, i) => (
        <div key={`form-field-${i}`} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex justify-end space-x-2">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}

export const FormSkeleton = memo(FormSkeletonInner);

// Dashboard grid skeleton
function DashboardSkeletonInner() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(6)].map((_, i) => (
        <CardSkeleton key={`dashboard-card-${i}`} />
      ))}
    </div>
  );
}

export const DashboardSkeleton = memo(DashboardSkeletonInner);

// Loading spinner with text
function LoadingSpinnerInner({
  text = 'Loading...',
  size = 'md',
  className = '',
}: {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`animate-spin rounded-full border-b-2 border-violet-500 ${sizeClasses[size]}`}
      ></div>
      <span className="ml-3 text-gray-600 dark:text-gray-400">{text}</span>
    </div>
  );
}

export const LoadingSpinner = memo(LoadingSpinnerInner);

// Full page loading overlay
function LoadingOverlayInner({
  text = 'Loading...',
  isVisible = true,
}: {
  text?: string;
  isVisible?: boolean;
}) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
        <LoadingSpinner text={text} size="lg" />
      </div>
    </div>
  );
}

export const LoadingOverlay = memo(LoadingOverlayInner);
