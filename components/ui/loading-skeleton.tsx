'use client';

import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

// Basic skeleton component
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} style={style} />
  );
}

// Chart skeleton
export function ChartSkeleton({ width = 800, height = 400 }: { width?: number; height?: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4" style={{ width, height }}>
      <div className="space-y-4">
        {/* Chart title skeleton */}
        <Skeleton className="h-6 w-48" />
        
        {/* Chart area skeleton */}
        <div className="relative" style={{ height: height - 80 }}>
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between py-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-3 w-12" />
            ))}
          </div>
          
          {/* Chart area */}
          <div className="ml-16 h-full bg-gray-100 dark:bg-gray-700 rounded relative">
            {/* Bars or data points */}
            <div className="absolute bottom-0 left-0 right-0 flex items-end justify-around px-4 pb-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton 
                  key={i} 
                  className="w-8" 
                  style={{ height: `${Math.random() * 60 + 20}%` }}
                />
              ))}
            </div>
          </div>
          
          {/* X-axis labels */}
          <div className="ml-16 mt-2 flex justify-around">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Table skeleton
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {[...Array(columns)].map((_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
      </div>
      
      {/* Rows */}
      {[...Array(rows)].map((_, rowIndex) => (
        <div key={rowIndex} className="border-b border-gray-200 dark:border-gray-700 p-4">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {[...Array(columns)].map((_, colIndex) => (
              <Skeleton key={colIndex} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Card skeleton
export function CardSkeleton() {
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

// Form skeleton
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {[...Array(fields)].map((_, i) => (
        <div key={i} className="space-y-2">
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

// Dashboard grid skeleton
export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(6)].map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

// Loading spinner with text
export function LoadingSpinner({ 
  text = 'Loading...', 
  size = 'md',
  className = '' 
}: { 
  text?: string; 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`animate-spin rounded-full border-b-2 border-violet-500 ${sizeClasses[size]}`}></div>
      <span className="ml-3 text-gray-600 dark:text-gray-400">{text}</span>
    </div>
  );
}

// Full page loading overlay
export function LoadingOverlay({ text = 'Loading...', isVisible = true }: { text?: string; isVisible?: boolean }) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
        <LoadingSpinner text={text} size="lg" />
      </div>
    </div>
  );
}
