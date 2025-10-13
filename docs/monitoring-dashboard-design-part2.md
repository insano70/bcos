# Monitoring Dashboard Design - Part 2: Dashboard Views & Components

## Dashboard Views Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  HEADER: Admin Command Center                    [🔄 Auto-refresh: 30s]│
│  [System Health: ●● 94%]  [Active Users: 142]    [⚙️ Settings] [Profile]│
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  FILTERS & CONTROLS                                                      │
│  Time Range: [Last 1hr ▼] [Last 6hr] [Last 24hr] [Last 7d] [Custom]   │
│  Auto-refresh: [●ON  ○OFF]  Interval: [30s ▼]                          │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  ROW 1: CRITICAL METRICS AT A GLANCE (KPI CARDS)                     │
├────────────┬────────────┬────────────┬────────────┬──────────────────┤
│ ●● SYSTEM  │  ACTIVE    │  ERROR     │  RESPONSE  │  SECURITY        │
│ HEALTH     │  USERS     │  RATE      │  TIME      │  STATUS          │
│            │            │            │            │                  │
│   94%      │   142      │  0.3%      │  234ms     │    ✓ OK          │
│ ▲ Healthy  │ ▲ +12      │ ▼ -0.1%    │ ▼ -50ms    │  0 Threats       │
└────────────┴────────────┴────────────┴────────────┴──────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  ROW 2: PERFORMANCE METRICS (CHARTS)                                  │
├─────────────────────────────────────┬─────────────────────────────────┤
│  API RESPONSE TIMES (Line Chart)     │  ERROR RATE (Line Chart)        │
│  [Chart.js with brand colors]        │  [Chart.js with error styling]  │
│  Shows p50, p95, p99 over time       │  Shows errors/min trending      │
└─────────────────────────────────────┴─────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  ROW 3: CACHE & DATABASE PERFORMANCE                                   │
├─────────────────────────────────────┬─────────────────────────────────┤
│  REDIS CACHE STATS                   │  SLOW QUERIES (Table)           │
│  ┌─────────────────────────────┐    │  ┌───────────────────────────┐ │
│  │ Hit Rate: 89.4% ▲            │    │  │ Query  │ Table │ Duration│ │
│  │ Memory: 245MB / 512MB       │    │  │────────┼───────┼─────────│ │
│  │ Keys: 4,231                 │    │  │ SELECT │ users │  847ms  │ │
│  │ Ops/sec: 156                │    │  │ SELECT │ pract │  692ms  │ │
│  │                              │    │  └───────────────────────────┘ │
│  │ [View Details] [Purge Cache]│    │  [View All Slow Queries →]      │
│  └─────────────────────────────┘    │                                 │
└─────────────────────────────────────┴─────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  ROW 4: SECURITY & AT-RISK USERS                                       │
├─────────────────────────────────────┬─────────────────────────────────┤
│  SECURITY EVENTS (Live Feed)         │  AT-RISK USERS (Table)          │
│  ┌─────────────────────────────┐    │  ┌───────────────────────────┐ │
│  │ 🔴 14:32 Rate limit: 203...  │    │  │ User  │ Fails │ Status  │ │
│  │ 🟡 14:30 Failed login: jdoe  │    │  │───────┼───────┼─────────│ │
│  │ 🟢 14:28 Successful MFA      │    │  │ j.doe │  5    │ 🔒Locked│ │
│  │ 🔴 14:25 CSRF blocked        │    │  │ smith │  3    │ ⚠️ Risk │ │
│  │                              │    │  └───────────────────────────┘ │
│  │ [View All Events →]          │    │  [Review Users] [Export]        │
│  └─────────────────────────────┘    │                                 │
└─────────────────────────────────────┴─────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  ROW 5: REDIS CACHE MANAGEMENT TOOLS                                   │
│  [TAB: Overview] [TAB: Keys] [TAB: Admin Tools]                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Search Keys: [bcos:prod:*___________] [Search]                 │  │
│  │                                                                  │  │
│  │  Key Patterns:                                                   │  │
│  │  ○ bcos:prod:chart:data:* (1,234 keys, 45MB)                   │  │
│  │  ○ bcos:prod:ratelimit:* (892 keys, 2MB)                       │  │
│  │  ○ bcos:prod:session:* (142 keys, 5MB)                         │  │
│  │                                                                  │  │
│  │  Quick Actions:                                                  │  │
│  │  [Purge by Pattern] [Clear All Cache] [Export Keys]            │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  ROW 6: SYSTEM RESOURCES & INFRASTRUCTURE                              │
├─────────────────────────────────────┬─────────────────────────────────┤
│  SERVER RESOURCES                    │  EXTERNAL SERVICES STATUS       │
│  ┌─────────────────────────────┐    │  ┌───────────────────────────┐ │
│  │ CPU: ██████░░░░ 60%         │    │  │ ✓ Database (Main)         │ │
│  │ Memory: ████░░░░░ 45%       │    │  │ ✓ Database (Analytics)    │ │
│  │ Disk: ███░░░░░░░ 32%        │    │  │ ✓ Redis/Valkey            │ │
│  │ Network: ↑ 12MB/s ↓ 8MB/s   │    │  │ ✓ Email Service           │ │
│  │                              │    │  │ ✓ CloudWatch              │ │
│  └─────────────────────────────┘    │  └───────────────────────────┘ │
└─────────────────────────────────────┴─────────────────────────────────┘
```

---

## Component Specifications

### 1. System Health KPI Card

**Component:** `SystemHealthKPI.tsx`

**Data Source:** 
```typescript
GET /api/admin/monitoring/metrics
{
  systemHealth: {
    status: 'healthy' | 'degraded' | 'unhealthy',
    score: 94,  // 0-100
    factors: {
      uptime: 'healthy',
      errorRate: 'healthy',
      responseTime: 'healthy',
      cachePerformance: 'healthy',
      databaseLatency: 'healthy'
    }
  }
}
```

**Visual Design:**
```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
  <div className="flex items-center justify-between">
    <div>
      <div className="text-sm text-gray-500 dark:text-gray-400">System Health</div>
      <div className="flex items-center gap-2 mt-1">
        <div className="text-4xl font-bold text-gray-900 dark:text-gray-100">
          {score}%
        </div>
        <StatusIndicator status={status} />
      </div>
      <div className="text-sm text-green-600 mt-1">
        ▲ Healthy
      </div>
    </div>
    <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
      <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
    </div>
  </div>
  
  {/* Expandable details */}
  <details className="mt-4">
    <summary className="cursor-pointer text-sm text-violet-600 hover:text-violet-700">
      View health factors
    </summary>
    <div className="mt-2 space-y-1 text-sm">
      <HealthFactor name="Uptime" status={factors.uptime} />
      <HealthFactor name="Error Rate" status={factors.errorRate} />
      <HealthFactor name="Response Time" status={factors.responseTime} />
      <HealthFactor name="Cache Performance" status={factors.cachePerformance} />
      <HealthFactor name="Database Latency" status={factors.databaseLatency} />
    </div>
  </details>
</div>
```

**Health Score Calculation:**
```typescript
function calculateHealthScore(metrics: Metrics): number {
  let score = 100;
  
  // Error rate (25 points max deduction)
  if (metrics.errorRate > 5) score -= 25;
  else if (metrics.errorRate > 2) score -= 15;
  else if (metrics.errorRate > 1) score -= 10;
  else if (metrics.errorRate > 0.5) score -= 5;
  
  // Response time (25 points max deduction)
  if (metrics.responseTimeP95 > 2000) score -= 25;
  else if (metrics.responseTimeP95 > 1000) score -= 15;
  else if (metrics.responseTimeP95 > 500) score -= 10;
  else if (metrics.responseTimeP95 > 300) score -= 5;
  
  // Cache hit rate (20 points max deduction)
  if (metrics.cacheHitRate < 70) score -= 20;
  else if (metrics.cacheHitRate < 80) score -= 10;
  else if (metrics.cacheHitRate < 90) score -= 5;
  
  // Database latency (15 points max deduction)
  if (metrics.dbLatencyP95 > 1000) score -= 15;
  else if (metrics.dbLatencyP95 > 500) score -= 10;
  else if (metrics.dbLatencyP95 > 300) score -= 5;
  
  // Security incidents (15 points max deduction)
  if (metrics.securityIncidents > 10) score -= 15;
  else if (metrics.securityIncidents > 5) score -= 10;
  else if (metrics.securityIncidents > 0) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}
```

---

### 2. Performance Charts Component

**Component:** `PerformanceCharts.tsx`

**Chart Type:** Line Chart (Chart.js)

**Data Structure:**
```typescript
{
  labels: ['14:00', '14:05', '14:10', '14:15', '14:20', '14:25', '14:30'],
  datasets: [
    {
      label: 'p50 (median)',
      data: [180, 195, 210, 198, 205, 189, 201],
      borderColor: '#00AEEF',  // Brand color
      backgroundColor: 'rgba(0, 174, 239, 0.1)',
      borderWidth: 2,
      tension: 0.4,
    },
    {
      label: 'p95',
      data: [450, 480, 520, 495, 510, 475, 498],
      borderColor: '#8B5CF6',  // violet-500
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      borderWidth: 2,
      tension: 0.4,
    },
    {
      label: 'p99',
      data: [890, 920, 1050, 980, 1020, 950, 995],
      borderColor: '#F59E0B',  // amber-500
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      borderWidth: 2,
      tension: 0.4,
    }
  ]
}
```

**Chart Configuration:**
```typescript
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: {
        color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
        font: {
          family: 'Inter, sans-serif',
          size: 12,
          weight: 500,
        },
        usePointStyle: true,
        pointStyle: 'circle',
      },
    },
    tooltip: {
      enabled: true,
      backgroundColor: darkMode ? chartColors.tooltipBgColor.dark : chartColors.tooltipBgColor.light,
      titleColor: darkMode ? chartColors.tooltipTitleColor.dark : chartColors.tooltipTitleColor.light,
      bodyColor: darkMode ? chartColors.tooltipBodyColor.dark : chartColors.tooltipBodyColor.light,
      borderColor: darkMode ? chartColors.tooltipBorderColor.dark : chartColors.tooltipBorderColor.light,
      borderWidth: 1,
      callbacks: {
        label: (context) => {
          return `${context.dataset.label}: ${context.parsed.y}ms`;
        },
      },
    },
  },
  scales: {
    x: {
      grid: {
        color: darkMode ? chartColors.gridColor.dark : chartColors.gridColor.light,
        display: true,
      },
      ticks: {
        color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
      },
    },
    y: {
      beginAtZero: true,
      grid: {
        color: darkMode ? chartColors.gridColor.dark : chartColors.gridColor.light,
      },
      ticks: {
        color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
        callback: (value) => `${value}ms`,
      },
      // Threshold lines
      plugins: {
        annotation: {
          annotations: {
            slowThreshold: {
              type: 'line',
              yMin: 1000,
              yMax: 1000,
              borderColor: '#EF4444',  // red-500
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: 'Slow Threshold (1s)',
                enabled: true,
                position: 'end',
              },
            },
          },
        },
      },
    },
  },
};
```

---

### 3. Redis Cache Stats Panel

**Component:** `RedisCacheStats.tsx`

**Data Source:**
```typescript
GET /api/admin/redis/stats
{
  connected: true,
  memory: {
    used: 245,  // MB
    total: 512, // MB
    percentage: 47.9,
    fragmentation: 1.12,
  },
  keys: {
    total: 4231,
    byPattern: {
      'chart:data:*': 1234,
      'ratelimit:*': 892,
      'session:*': 142,
      'other': 1963,
    },
  },
  stats: {
    hitRate: 89.4,
    totalHits: 45231,
    totalMisses: 5389,
    opsPerSec: 156,
    connectedClients: 3,
    evictedKeys: 0,
    expiredKeys: 234,
  },
  commandStats: {
    GET: 38421,
    SET: 6810,
    DEL: 234,
    INCR: 892,
    EXPIRE: 6810,
  },
}
```

**Visual Design:**
```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
      Redis Cache Statistics
    </h3>
    <button 
      onClick={refreshStats}
      className="text-sm text-violet-600 hover:text-violet-700"
    >
      <RefreshIcon className="h-4 w-4" />
    </button>
  </div>

  {/* Hit Rate - Primary Metric */}
  <div className="mb-6">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-gray-600 dark:text-gray-400">Hit Rate</span>
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {stats.hitRate}%
      </span>
    </div>
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
      <div 
        className="bg-violet-500 h-2 rounded-full transition-all duration-300"
        style={{ width: `${stats.hitRate}%` }}
      />
    </div>
    <div className="flex justify-between mt-1 text-xs text-gray-500">
      <span>{stats.totalHits.toLocaleString()} hits</span>
      <span>{stats.totalMisses.toLocaleString()} misses</span>
    </div>
  </div>

  {/* Memory Usage */}
  <div className="mb-6">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-gray-600 dark:text-gray-400">Memory</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {stats.memory.used}MB / {stats.memory.total}MB
      </span>
    </div>
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
      <div 
        className={`h-2 rounded-full transition-all duration-300 ${
          stats.memory.percentage > 80 ? 'bg-red-500' :
          stats.memory.percentage > 60 ? 'bg-amber-500' :
          'bg-green-500'
        }`}
        style={{ width: `${stats.memory.percentage}%` }}
      />
    </div>
  </div>

  {/* Key Stats Grid */}
  <div className="grid grid-cols-2 gap-4 mb-4">
    <Stat label="Total Keys" value={stats.keys.total.toLocaleString()} />
    <Stat label="Ops/sec" value={stats.opsPerSec} />
    <Stat label="Clients" value={stats.connectedClients} />
    <Stat label="Evicted" value={stats.evictedKeys} />
  </div>

  {/* Actions */}
  <div className="flex gap-2 mt-4">
    <button 
      className="flex-1 px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
      onClick={() => setShowDetails(true)}
    >
      View Details
    </button>
    <button 
      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      onClick={() => setShowAdminTools(true)}
    >
      Admin Tools
    </button>
  </div>
</div>
```

---

### 4. At-Risk Users Panel

**Component:** `AtRiskUsersPanel.tsx`

**Data Source:**
```typescript
GET /api/admin/monitoring/at-risk-users
{
  users: [
    {
      userId: 'uuid-1',
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      failedAttempts: 5,
      lastFailedAttempt: '2025-10-13T14:32:00Z',
      lockedUntil: '2025-10-13T15:32:00Z',
      suspiciousActivity: true,
      lockoutReason: 'too_many_attempts',
      riskScore: 85,  // 0-100
      riskFactors: [
        'Multiple failed login attempts',
        'Unusual IP addresses (3 different IPs in 1 hour)',
        'Account currently locked'
      ],
      recentAttempts24h: 8,
      uniqueIPs7d: 5,
    },
    // ... more users
  ],
  totalCount: 23,
  summary: {
    locked: 5,
    suspicious: 12,
    failedAttempts: 6,
  }
}
```

**Risk Score Calculation:**
```typescript
function calculateRiskScore(user: AtRiskUser): number {
  let score = 0;
  
  // Failed attempts (30 points max)
  if (user.failedAttempts >= 10) score += 30;
  else if (user.failedAttempts >= 5) score += 20;
  else if (user.failedAttempts >= 3) score += 10;
  
  // Account locked (25 points)
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    score += 25;
  }
  
  // Suspicious activity flag (20 points)
  if (user.suspiciousActivity) score += 20;
  
  // Multiple IPs (15 points max)
  if (user.uniqueIPs7d >= 10) score += 15;
  else if (user.uniqueIPs7d >= 5) score += 10;
  else if (user.uniqueIPs7d >= 3) score += 5;
  
  // Recent attempt frequency (10 points max)
  if (user.recentAttempts24h >= 20) score += 10;
  else if (user.recentAttempts24h >= 10) score += 7;
  else if (user.recentAttempts24h >= 5) score += 5;
  
  return Math.min(100, score);
}
```

**Visual Design:**
```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
      At-Risk Users
    </h3>
    <div className="flex gap-2">
      <Badge variant="red">{summary.locked} Locked</Badge>
      <Badge variant="amber">{summary.suspicious} Suspicious</Badge>
    </div>
  </div>

  {/* Summary Cards */}
  <div className="grid grid-cols-3 gap-4 mb-6">
    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
        {summary.locked}
      </div>
      <div className="text-xs text-red-600 dark:text-red-400">Locked</div>
    </div>
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
      <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
        {summary.suspicious}
      </div>
      <div className="text-xs text-amber-600 dark:text-amber-400">Suspicious</div>
    </div>
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
      <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
        {summary.failedAttempts}
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-400">Failed Logins</div>
    </div>
  </div>

  {/* Users Table */}
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead className="bg-gray-50 dark:bg-gray-900/50">
        <tr>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            User
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Risk
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Failed Attempts
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Status
          </th>
          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Actions
          </th>
        </tr>
      </thead>
      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
        {users.map((user) => (
          <tr key={user.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
            <td className="px-4 py-3">
              <div className="flex items-center">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {user.firstName} {user.lastName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {user.email}
                  </div>
                </div>
              </div>
            </td>
            <td className="px-4 py-3">
              <RiskBadge score={user.riskScore} />
            </td>
            <td className="px-4 py-3">
              <div className="text-sm text-gray-900 dark:text-gray-100">
                {user.failedAttempts}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {user.recentAttempts24h} in 24h
              </div>
            </td>
            <td className="px-4 py-3">
              {user.lockedUntil && new Date(user.lockedUntil) > new Date() ? (
                <Badge variant="red" icon="lock">Locked</Badge>
              ) : user.suspiciousActivity ? (
                <Badge variant="amber" icon="alert">Suspicious</Badge>
              ) : (
                <Badge variant="gray">Monitoring</Badge>
              )}
            </td>
            <td className="px-4 py-3 text-right">
              <button 
                className="text-sm text-violet-600 hover:text-violet-700"
                onClick={() => viewUserDetails(user)}
              >
                Review
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {/* View All Link */}
  <div className="mt-4 text-center">
    <Link 
      href="/admin/security/at-risk-users"
      className="text-sm text-violet-600 hover:text-violet-700 font-medium"
    >
      View all {totalCount} at-risk users →
    </Link>
  </div>
</div>
```

---

### 5. Security Events Feed

**Component:** `SecurityEventsFeed.tsx`

**Data Source:**
```typescript
GET /api/admin/monitoring/security-events?limit=20
{
  events: [
    {
      id: 'evt_1',
      timestamp: '2025-10-13T14:32:15Z',
      event: 'rate_limit_exceeded',
      severity: 'high',
      action: 'rate_limit_block',
      threat: 'dos_attempt',
      blocked: true,
      details: {
        type: 'auth',
        identifier: '203.0.113.42',
        current: 25,
        limit: 20,
      },
      message: 'Rate limit exceeded for auth attempts',
    },
    {
      id: 'evt_2',
      timestamp: '2025-10-13T14:30:42Z',
      event: 'login_failed',
      severity: 'medium',
      action: 'login_attempt',
      details: {
        email: 'john.doe@example.com',
        failureReason: 'invalid_password',
        ipAddress: '198.51.100.23',
      },
      message: 'Failed login attempt',
    },
    {
      id: 'evt_3',
      timestamp: '2025-10-13T14:28:12Z',
      event: 'mfa_verification_success',
      severity: 'low',
      action: 'mfa_verify',
      details: {
        userId: 'uuid-1',
        method: 'totp',
      },
      message: 'Successful MFA verification',
    },
    {
      id: 'evt_4',
      timestamp: '2025-10-13T14:25:31Z',
      event: 'csrf_validation_failed',
      severity: 'high',
      action: 'csrf_block',
      threat: 'csrf_attack',
      blocked: true,
      details: {
        pathname: '/api/users/123',
        ipAddress: '192.0.2.100',
        reason: 'missing_token',
      },
      message: 'CSRF validation failed',
    },
  ],
  totalCount: 127,
}
```

**Visual Design:**
```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
      Security Events
    </h3>
    <button 
      onClick={refreshEvents}
      className="text-sm text-violet-600 hover:text-violet-700"
    >
      <RefreshIcon className="h-4 w-4" />
    </button>
  </div>

  {/* Live feed */}
  <div className="space-y-3 max-h-96 overflow-y-auto">
    {events.map((event) => (
      <div 
        key={event.id}
        className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <SeverityIcon severity={event.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {event.message}
            </span>
            {event.blocked && (
              <Badge variant="red" size="sm">Blocked</Badge>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatTimestamp(event.timestamp)}
            {event.details.ipAddress && ` • ${event.details.ipAddress}`}
          </div>
        </div>
        <button 
          className="text-xs text-violet-600 hover:text-violet-700 flex-shrink-0"
          onClick={() => viewEventDetails(event)}
        >
          Details
        </button>
      </div>
    ))}
  </div>

  {/* View All Link */}
  <div className="mt-4 text-center">
    <Link 
      href="/admin/security/events"
      className="text-sm text-violet-600 hover:text-violet-700 font-medium"
    >
      View all {totalCount} security events →
    </Link>
  </div>
</div>

// Helper component
function SeverityIcon({ severity }: { severity: string }) {
  const config = {
    critical: { color: 'text-red-500', icon: '🔴' },
    high: { color: 'text-red-500', icon: '🔴' },
    medium: { color: 'text-amber-500', icon: '🟡' },
    low: { color: 'text-green-500', icon: '🟢' },
  }[severity] || { color: 'text-gray-500', icon: '⚪' };

  return (
    <div className={`text-lg ${config.color}`}>
      {config.icon}
    </div>
  );
}
```

---

(Continued in Part 3 with Redis Admin Tools, API Endpoints, and Implementation Plan...)

