# Phase 4: Performance Visualization & Slow Query Tracking - Implementation Plan

**Status:** Ready for Implementation  
**Created:** 2025-10-14  
**Duration:** 1 week (estimated)  
**Dependencies:** Phases 1 ✅, 2 ✅, 3 ✅ Complete  

---

## Table of Contents

1. [Overview](#overview)
2. [Data Sources](#data-sources)
3. [Chart Specifications](#chart-specifications)
4. [API Endpoints](#api-endpoints)
5. [UI Components](#ui-components)
6. [Implementation Tasks](#implementation-tasks)
7. [Testing Strategy](#testing-strategy)

---

## Overview

### Goals

Phase 4 adds performance visualization and slow query tracking:
- **Performance Charts** - Real-time trending of response times (p50/p95/p99)
- **Error Rate Charts** - Error rate trending over time
- **Slow Query Tracking** - Database queries exceeding thresholds
- **Error Log Panel** - Recent errors grouped by endpoint
- **Endpoint Comparison** - Compare all endpoints by performance
- **Interactive Charts** - Zoom, pan, and filter capabilities

### What's Currently Working

**Metrics Being Tracked:**
- ✅ API response times per endpoint
- ✅ Error counts per endpoint and type
- ✅ Database query durations
- ✅ Slow operation detection (>1000ms API, >500ms DB)

**What's Missing:**
- ❌ Visualization of metrics over time (charts)
- ❌ Slow query aggregation and display
- ❌ Error trending and grouping
- ❌ Endpoint performance comparison

---

## Data Sources

### 1. In-Memory Metrics (MetricsCollector)

**Current Implementation:**
- 5-minute rolling window
- Request counts, durations, errors
- p50/p95/p99 calculations
- Separated standard vs analytics

**For Phase 4:**
- Track time-series data (snapshots every minute)
- Store last hour of snapshots for charting
- Export to PerformanceHistory service

### 2. CloudWatch Logs Insights

**Slow Queries Query:**
```sql
fields @timestamp, operation, table, duration, recordCount, filters, userId, correlationId
| filter component = "database"
| filter duration > 500
| filter @timestamp > ago(1h)
| sort duration desc
| limit 100
```

**Error Logs Query:**
```sql
fields @timestamp, level, message, operation, endpoint, statusCode, error.name, error.message, correlationId
| filter level = "ERROR"
| filter component = "api"
| filter @timestamp > ago(1h)
| stats count(*) as error_count by operation, error.name
| sort error_count desc
```

**Response Time Trending Query:**
```sql
fields operation, duration
| filter component = "api"
| filter @timestamp > ago(1h)
| stats 
    avg(duration) as avg_ms,
    pct(duration, 50) as p50,
    pct(duration, 95) as p95,
    pct(duration, 99) as p99,
    count() as requests
  by bin(5m), operation
| sort bin(5m) desc
```

---

## Chart Specifications

### 1. Performance Trending Chart

**Type:** Line Chart (Chart.js)

**Data Structure:**
```typescript
{
  labels: ['14:00', '14:05', '14:10', '14:15', '14:20', '14:25', '14:30'],
  datasets: [
    {
      label: 'p50 (median)',
      data: [145, 152, 148, 155, 149, 147, 151],
      borderColor: '#00AEEF',  // Brand color (violet-500)
      backgroundColor: 'rgba(0, 174, 239, 0.1)',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 3,
    },
    {
      label: 'p95',
      data: [234, 245, 238, 250, 242, 236, 241],
      borderColor: '#8B5CF6',  // violet-500
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 3,
    },
    {
      label: 'p99',
      data: [456, 478, 465, 489, 472, 461, 469],
      borderColor: '#F59E0B',  // amber-500
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 3,
    }
  ]
}
```

**Chart Options:**
```typescript
{
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  scales: {
    y: {
      beginAtZero: true,
      title: {
        display: true,
        text: 'Response Time (ms)',
      },
      grid: {
        color: darkMode ? chartColors.gridColor.dark : chartColors.gridColor.light,
      },
      // Threshold line at 1000ms
      plugins: {
        annotation: {
          annotations: {
            slowThreshold: {
              type: 'line',
              yMin: 1000,
              yMax: 1000,
              borderColor: '#EF4444',
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: 'Slow Threshold',
                enabled: true,
              },
            },
          },
        },
      },
    },
    x: {
      type: 'time',
      time: {
        unit: 'minute',
        displayFormats: {
          minute: 'HH:mm',
        },
      },
      grid: {
        display: false,
      },
    },
  },
  plugins: {
    legend: {
      display: true,
      position: 'top',
    },
    tooltip: {
      backgroundColor: darkMode ? chartColors.tooltipBgColor.dark : chartColors.tooltipBgColor.light,
      titleColor: darkMode ? chartColors.tooltipTitleColor.dark : chartColors.tooltipTitleColor.light,
      bodyColor: darkMode ? chartColors.tooltipBodyColor.dark : chartColors.tooltipBodyColor.light,
      borderColor: darkMode ? chartColors.tooltipBorderColor.dark : chartColors.tooltipBorderColor.light,
    },
  },
}
```

### 2. Error Rate Trending Chart

**Type:** Line Chart with dual axis

**Primary Y-Axis:** Error count
**Secondary Y-Axis:** Error rate percentage

**Color Coding:**
- Green: < 1% error rate
- Yellow: 1-5% error rate
- Red: > 5% error rate

---

## API Endpoints

### 1. Slow Queries API

**Endpoint:** `GET /api/admin/monitoring/slow-queries`

**Query Parameters:**
```typescript
{
  limit?: number,        // Default: 50, Max: 500
  timeRange?: string,    // '1h', '6h', '24h', '7d' (default: '1h')
  threshold?: number,    // Minimum duration in ms (default: 500)
  table?: string,        // Filter by specific table
}
```

**Response:**
```typescript
{
  queries: [
    {
      timestamp: string,
      operation: string,        // 'SELECT', 'INSERT', 'UPDATE', 'DELETE'
      table: string,
      duration: number,         // milliseconds
      recordCount: number,
      filters?: Record<string, unknown>,
      correlationId?: string,
      userId?: string,
    }
  ],
  totalCount: number,
  avgDuration: number,
  slowThreshold: number,
  summary: {
    byTable: Record<string, { count: number; avgDuration: number }>,
    byOperation: Record<string, number>,
  },
}
```

### 2. Errors API

**Endpoint:** `GET /api/admin/monitoring/errors`

**Query Parameters:**
```typescript
{
  limit?: number,
  timeRange?: string,
  endpoint?: string,     // Filter by endpoint
  errorType?: string,    // Filter by error type
}
```

**Response:**
```typescript
{
  errors: [
    {
      timestamp: string,
      level: string,
      message: string,
      operation: string,
      endpoint: string,
      statusCode: number,
      errorType: string,
      correlationId?: string,
      userId?: string,
      stack?: string,
      count: number,        // Number of occurrences
      firstSeen: string,
      lastSeen: string,
    }
  ],
  totalCount: number,
  summary: {
    byEndpoint: Record<string, number>,
    byType: Record<string, number>,
    byStatusCode: Record<number, number>,
  },
}
```

### 3. Performance History API

**Endpoint:** `GET /api/admin/monitoring/performance-history`

**Query Parameters:**
```typescript
{
  timeRange?: string,    // '1h', '6h', '24h'
  interval?: string,     // '1m', '5m', '15m'
  category?: string,     // 'standard', 'analytics'
}
```

**Response:**
```typescript
{
  dataPoints: [
    {
      timestamp: string,
      responseTime: {
        p50: number,
        p95: number,
        p99: number,
        avg: number,
      },
      requestCount: number,
      errorCount: number,
      errorRate: number,
    }
  ],
  interval: string,
  category: string,
}
```

---

## UI Components

### 1. PerformanceChart Component

**Purpose:** Visualize response time trends

**Features:**
- Three lines: p50, p95, p99
- Time-based x-axis (last hour by default)
- Threshold line at 1000ms
- Hover tooltips with exact values
- Theme-aware colors
- Auto-refresh support

**Usage:**
```tsx
<PerformanceChart
  category="standard"  // or 'analytics'
  timeRange="1h"
  autoRefresh={true}
  refreshInterval={30000}
/>
```

### 2. ErrorRateChart Component

**Purpose:** Visualize error rate over time

**Features:**
- Dual axis (count + percentage)
- Color-coded by severity
- Stacked area for error types
- Threshold annotations
- Interactive legend

### 3. SlowQueriesPanel Component

**Purpose:** Display slow database queries

**Features:**
- Sortable table (duration, table, timestamp)
- Filter by table, operation
- Click to view in CloudWatch (correlation ID)
- Highlight queries > 1000ms
- Show query filters/params

**Columns:**
- Timestamp
- Table
- Operation (SELECT/INSERT/UPDATE/DELETE)
- Duration (ms)
- Record Count
- Actions (View in CloudWatch)

### 4. ErrorLogPanel Component

**Purpose:** Display recent errors with grouping

**Features:**
- Group similar errors
- Show occurrence count
- Expandable stack traces
- Filter by endpoint, error type
- Link to CloudWatch for full context

---

## Implementation Tasks (20 Tasks)

### Group 1: Backend APIs (Tasks 1-4)

**Task 1: Slow Queries API**
- Query CloudWatch Logs Insights
- Filter by duration threshold
- Group by table and operation
- Calculate averages

**Task 2: Errors API**
- Query CloudWatch for error logs
- Group similar errors (deduplication)
- Extract error types and stack traces
- Provide summary by endpoint

**Task 3: Performance History Tracker**
- Service to track metrics snapshots over time
- Store last hour of data points
- Provide time-series data for charts
- Integration with MetricsCollector

**Task 4: Type Definitions**
- SlowQueriesResponse
- ErrorsResponse
- PerformanceHistory
- ChartDataPoint

### Group 2: Chart Components (Tasks 5-9)

**Task 5: PerformanceChart**
- Line chart using existing Chart.js config
- Three datasets (p50, p95, p99)
- Theme support (dark mode)
- Time-based x-axis
- Threshold annotations

**Task 6: ErrorRateChart**
- Line chart with dual axis
- Error count + percentage
- Color-coded severity
- Auto-refresh

**Task 7: SlowQueriesPanel**
- Sortable table component
- Filter controls
- CloudWatch link integration
- Highlight critical queries

**Task 8: ErrorLogPanel**
- Grouped error display
- Expandable details
- Filter by endpoint/type
- Deduplication logic

**Task 9: EndpointPerformanceTable**
- Comparison table for all endpoints
- Sort by p95, error rate, request count
- Color-coded performance indicators

### Group 3: Dashboard Integration (Tasks 10-14)

**Task 10: Update Row 2**
- Replace placeholders with PerformanceChart and ErrorRateChart
- Wire up time range selector
- Add loading states

**Task 11: Update Row 3**
- Replace slow queries placeholder with SlowQueriesPanel
- Keep Redis stats in left column

**Task 12: Time Range Selector**
- Global time range control
- Options: 1h, 6h, 24h, 7d
- Apply to all charts
- Persist selection

**Task 13: Chart Zoom/Pan**
- Integrate chartjs-plugin-zoom
- Mouse wheel zoom
- Click-drag pan
- Reset zoom button

**Task 14: Endpoint Filtering**
- Filter dropdown for specific endpoints
- Apply to charts and tables
- Show/hide endpoint series

### Group 4: Advanced Features (Tasks 15-18)

**Task 15: Chart Configuration Utility**
- Shared Chart.js config
- Theme integration
- Brand color application
- Reusable options

**Task 16: Error Grouping**
- Deduplicate similar errors
- Group by error message pattern
- Show occurrence count
- Collapse/expand groups

**Task 17: Correlation ID Linking**
- Generate CloudWatch Logs Insights URL
- Open in new tab
- Pre-filled query for correlation ID
- One-click trace viewing

**Task 18: Performance Alerts**
- Visual indicators on charts when thresholds exceeded
- Color-coded zones (green/yellow/red)
- Annotation lines for thresholds

### Group 5: Testing & QA (Tasks 19-20)

**Task 19: Test Charts**
- Verify Chart.js rendering
- Test data updates
- Theme switching
- Zoom/pan functionality

**Task 20: Quality Checks**
- pnpm tsc --noEmit
- pnpm lint
- Fix all errors

---

## Chart.js Integration

### Using Existing Configuration

**File:** `components/charts/chartjs-config.tsx`

**Existing Patterns:**
```typescript
import { chartColors } from '@/components/charts/chartjs-config';
import { useTheme } from 'next-themes';

// Apply theme
const { theme } = useTheme();
const darkMode = theme === 'dark';

// Use existing colors
const {
  textColor,
  gridColor,
  tooltipTitleColor,
  tooltipBodyColor,
  tooltipBgColor,
  tooltipBorderColor,
} = chartColors;
```

**Brand Color:**
```typescript
const brandColor = '#00AEEF';  // violet-500 in Tailwind

datasets: [{
  borderColor: brandColor,
  backgroundColor: `${brandColor}20`,  // 20% opacity
  // ...
}]
```

---

## Performance History Tracker

**File:** `lib/monitoring/performance-history.ts`

**Purpose:** Store time-series metrics for charting

```typescript
export interface PerformanceDataPoint {
  timestamp: string;
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  requestCount: number;
  errorCount: number;
  errorRate: number;
}

export class PerformanceHistoryTracker {
  private dataPoints: PerformanceDataPoint[] = [];
  private maxDataPoints = 60; // Last hour (1 point per minute)
  
  /**
   * Add a new data point from MetricsCollector snapshot
   */
  addDataPoint(snapshot: MetricsSnapshot): void {
    const dataPoint: PerformanceDataPoint = {
      timestamp: snapshot.timestamp,
      responseTime: {
        p50: snapshot.responseTime.p50,
        p95: snapshot.responseTime.p95,
        p99: snapshot.responseTime.p99,
        avg: snapshot.responseTime.avg,
      },
      requestCount: snapshot.requests.total,
      errorCount: snapshot.errors.total,
      errorRate: snapshot.errors.rate,
    };
    
    this.dataPoints.push(dataPoint);
    
    // Keep only last N data points
    if (this.dataPoints.length > this.maxDataPoints) {
      this.dataPoints.shift();
    }
  }
  
  /**
   * Get data points for charting
   */
  getDataPoints(timeRange: string = '1h'): PerformanceDataPoint[] {
    const now = Date.now();
    const ranges: Record<string, number> = {
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
    };
    
    const cutoff = now - (ranges[timeRange] || ranges['1h']);
    
    return this.dataPoints.filter(point => 
      new Date(point.timestamp).getTime() > cutoff
    );
  }
}

// Singleton instance
export const performanceHistory = new PerformanceHistoryTracker();

// Integration with MetricsCollector
// Call every minute to build history
setInterval(() => {
  const snapshot = metricsCollector.getSnapshot();
  performanceHistory.addDataPoint(snapshot);
}, 60000);
```

---

## Component Specifications

### PerformanceChart Component

**File:** `app/(default)/admin/command-center/components/performance-chart.tsx`

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Chart } from 'chart.js';
import { chartColors } from '@/components/charts/chartjs-config';
import { apiClient } from '@/lib/api/client';

interface PerformanceChartProps {
  category: 'standard' | 'analytics';
  timeRange: string;
  height?: number;
}

export default function PerformanceChart({ 
  category, 
  timeRange, 
  height = 300 
}: PerformanceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [chart, setChart] = useState<Chart | null>(null);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  
  // Fetch performance history
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await apiClient.get(
          `/api/admin/monitoring/performance-history?timeRange=${timeRange}&category=${category}`
        );
        
        // Transform to Chart.js format
        const chartData = transformToChartData(response);
        
        // Create or update chart
        if (chart) {
          chart.data = chartData;
          chart.update();
        } else {
          createChart(chartData);
        }
      } catch (error) {
        console.error('Failed to fetch performance data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [timeRange, category]);
  
  // ... chart creation and update logic
}
```

---

## Estimated Timeline

**Day 1: Backend APIs (6 hours)**
- Slow queries API (2 hours)
- Errors API (2 hours)
- Performance history tracker (2 hours)

**Day 2: Chart Components (6 hours)**
- PerformanceChart (2 hours)
- ErrorRateChart (2 hours)
- Chart configuration utility (2 hours)

**Day 3: Data Panels (5 hours)**
- SlowQueriesPanel (2 hours)
- ErrorLogPanel (2 hours)
- EndpointPerformanceTable (1 hour)

**Day 4: Dashboard Integration (4 hours)**
- Update Row 2 with charts (1 hour)
- Update Row 3 with slow queries (1 hour)
- Time range selector (1 hour)
- Filtering controls (1 hour)

**Day 5: Polish & Testing (3 hours)**
- Chart zoom/pan (1 hour)
- Error grouping (1 hour)
- Testing and QA (1 hour)

**Total: 24 hours (5 days)**

---

## Success Criteria

### Functional Requirements
- ✅ Performance charts show p50/p95/p99 trending
- ✅ Error rate charts show trending over time
- ✅ Slow queries display with table, operation, duration
- ✅ Errors grouped and deduplicated
- ✅ Time range selector works across all charts
- ✅ Charts responsive to theme changes
- ✅ Zoom and pan work smoothly
- ✅ CloudWatch correlation links work

### Performance Requirements
- ✅ Charts render in < 500ms
- ✅ Data fetching in < 2 seconds
- ✅ Smooth animations (60fps)
- ✅ Memory efficient (< 10MB per chart)

### UX Requirements
- ✅ Charts use brand colors (#00AEEF)
- ✅ Dark mode support
- ✅ Responsive design
- ✅ Loading states
- ✅ Empty states
- ✅ Error states

---

## Dependencies

### NPM Packages

**Possibly Needed:**
```bash
# If not already installed
pnpm add chartjs-plugin-annotation
pnpm add chartjs-plugin-zoom
pnpm add chartjs-adapter-moment
```

**Already Available:**
- chart.js (existing)
- moment (existing)
- chartjs-config.tsx (existing)

---

## Risk Mitigation

**Risk 1: CloudWatch query performance**
- *Mitigation:* Cache results for 30 seconds
- *Mitigation:* Limit time ranges
- *Fallback:* Use in-memory data if CloudWatch slow

**Risk 2: Chart.js memory usage**
- *Mitigation:* Destroy charts on unmount
- *Mitigation:* Limit data points (max 60 for 1 hour)
- *Mitigation:* Throttle updates

**Risk 3: Too many slow queries**
- *Mitigation:* Paginate results
- *Mitigation:* Default to last 50 queries
- *Mitigation:* Group by table

---

## Integration Points

### With Existing Systems

**1. MetricsCollector Integration:**
```typescript
// Called every minute
setInterval(() => {
  const snapshot = metricsCollector.getSnapshot();
  performanceHistory.addDataPoint(snapshot);
}, 60000);
```

**2. Chart.js Theme Integration:**
```typescript
import { chartColors } from '@/components/charts/chartjs-config';

// Use existing color scheme
chart.options.scales.x.ticks.color = darkMode 
  ? chartColors.textColor.dark 
  : chartColors.textColor.light;
```

**3. CloudWatch Integration:**
```typescript
import { queryCloudWatchLogs, buildSlowQueriesQuery } from '@/lib/monitoring/cloudwatch-queries';

const query = buildSlowQueriesQuery('1h', 500);
const results = await queryCloudWatchLogs(query, '1h');
```

---

## Next Steps

1. **Review Phase 4 plan**
2. **Begin implementation** when approved
3. **After Phase 4:** Full Admin Command Center complete!

---

**Phase 4 will complete the performance monitoring capabilities with visual trending and slow query tracking.**

