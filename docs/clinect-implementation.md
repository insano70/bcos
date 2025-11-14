# Clinect Ratings Integration - Implementation Plan

**Status**: Planning  
**Created**: 2025-01-13  
**Target Completion**: TBD  
**Owner**: Engineering Team  

---

## Table of Contents

1. [Overview](#overview)
2. [Technical Requirements](#technical-requirements)
3. [Architecture & Design](#architecture--design)
4. [Database Schema Changes](#database-schema-changes)
5. [API Design](#api-design)
6. [Service Layer](#service-layer)
7. [Static Assets](#static-assets)
8. [UI Components](#ui-components)
9. [Template Integration](#template-integration)
10. [Security Implementation](#security-implementation)
11. [Testing Strategy](#testing-strategy)
12. [Implementation Phases](#implementation-phases)
13. [Acceptance Criteria](#acceptance-criteria)
14. [Rollout Strategy](#rollout-strategy)

---

## Overview

### Purpose

Integrate Clinect's real-time patient ratings and reviews system into BendCare practice website templates, replacing fake/static testimonials with verified patient feedback.

### Goals

- ✅ Display live patient ratings from Clinect API
- ✅ Show verified patient reviews in template carousels
- ✅ Provide practice-level toggle for ratings feed
- ✅ Maintain graceful fallback to local comments on failure
- ✅ Ensure zero security degradation (CSP compliance, XSS prevention)
- ✅ Server-side rendering (SSR) for SEO and performance

### Non-Goals

- ❌ Building our own ratings collection system
- ❌ Editing/moderating Clinect reviews (Clinect handles this)
- ❌ Multi-platform aggregation (only Clinect for v1)
- ❌ Practice-level analytics dashboard (future enhancement)

---

## Technical Requirements

### Clinect Integration Points

**API Base URL**: `https://api2.clinectsurvey.com/stats/`

**Endpoints**:

1. **Aggregate Ratings** (for star display):
   ```
   GET /{groupId}/provider-score-slug/{practiceSlug}
   Returns: [{ provider_id, id_slug, response_count, curated_response_count, score_value }]
   ```

2. **Individual Reviews** (for carousel):
   ```
   GET /{groupId}/curated-response/slug/{practiceSlug}?type=provider&limit={limit}
   Returns: { data: [{ survey_response_id, score_value, score_value_pure_5, approved_comment, patient_name, approved_at_formatted }] }
   ```

**Configuration**:
- `groupId`: "bendcare" (our Clinect organization identifier)
- `practiceSlug`: Unique identifier per practice (e.g., "michelle-wands")
- `responseCountFloor`: Minimum reviews to display (default: 1)
- `responseScoreFloor`: Minimum score threshold 0-100 (default: 65)

### Performance Requirements

- **API Timeout**: 5 seconds maximum
- **Fallback Time**: < 100ms to switch to local comments
- **SSR Cache**: 15 minutes for ratings data
- **Page Load Impact**: < 200ms additional load time

### Browser Support

- Modern evergreen browsers (Chrome, Firefox, Safari, Edge)
- No IE11 support required
- JavaScript progressive enhancement (works without JS via SSR)

---

## Architecture & Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Practice Website (SSR)                    │
├─────────────────────────────────────────────────────────────┤
│  Template Component (e.g., Classic Professional)            │
│    ↓                                                         │
│  ReviewCarousel Component                                    │
│    ↓                                                         │
│  Check: ratings_feed_enabled && practice_slug?              │
│    ├─ Yes → ClinectRatingsWidget                           │
│    │           ↓                                             │
│    │      SSR: Fetch initial data from Clinect API          │
│    │           ↓                                             │
│    │      Client Hydration: Live updates (optional)         │
│    │           ↓                                             │
│    │      Render: Stars + Reviews                           │
│    │                                                          │
│    └─ No → LocalReviewCarousel (existing fallback)          │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌──────────────┐
│ Admin Panel  │
│              │
│ 1. Enable    │
│    Ratings   │
│ 2. Set Slug  │
└──────┬───────┘
       │
       ↓ (Save via API)
┌──────────────────────┐
│ practice_attributes  │
│ ┌──────────────────┐ │
│ │ ratings_enabled  │ │
│ │ practice_slug    │ │
│ └──────────────────┘ │
└──────┬───────────────┘
       │
       ↓ (Read on page render)
┌──────────────────────┐
│ Practice Website     │
│ Page Component       │
└──────┬───────────────┘
       │
       ↓ (If enabled)
┌──────────────────────┐
│ Server-side Fetch    │
│ Clinect API          │
│ (with timeout)       │
└──────┬───────────────┘
       │
       ├─ Success → Render with live data
       │
       └─ Failure → Fallback to local comments
```

### Design Decisions

#### 1. Server-Side Rendering (SSR) Strategy

**Decision**: Hybrid SSR with optional client hydration

**Rationale**:
- SEO: Search engines see actual review content
- Performance: Faster initial paint with cached data
- Reliability: Server can handle failures gracefully
- Progressive Enhancement: Works without JavaScript

**Implementation**:
```typescript
// Server Component (SSR)
async function getInitialRatingsData(practiceSlug: string) {
  try {
    const response = await fetch(clinectApiUrl, {
      next: { revalidate: 900 }, // 15 min cache
      signal: AbortSignal.timeout(5000)
    });
    return await response.json();
  } catch {
    return null; // Fallback handled by component
  }
}

// Pass to client component for hydration
<ClinectRatingsWidget initialData={ratingsData} practiceSlug={slug} />
```

#### 2. Asset Hosting (Option A: Local)

**Decision**: Host all static assets locally in `/public`

**Rationale**:
- ✅ No external CDN dependencies
- ✅ Full CSP compliance (no additional domains)
- ✅ Version control over assets
- ✅ Faster load times (same origin)
- ✅ No CORS complications

**Assets to Host**:
- jQuery 3.7.1 (modern version, not 1.12.4)
- Clinect widget JavaScript (adapted for modern browsers)
- Star sprite images (tiny, small, medium)
- CSS styles (integrated into app styles)

#### 3. jQuery Replacement Strategy

**Decision**: Rewrite Clinect widget without jQuery dependency

**Rationale**:
- Modern React doesn't need jQuery
- Reduces bundle size (~90KB saved)
- Avoids potential conflicts
- Better TypeScript integration
- Cleaner React patterns

**Approach**:
```typescript
// Original jQuery plugin: $('#element').clinectStars(options);
// New React component: <ClinectStars {...options} />
```

#### 4. API Proxy Layer

**Decision**: Create Next.js API proxy for Clinect calls

**Rationale**:
- ✅ Server-side caching (reduce Clinect API load)
- ✅ Rate limiting protection
- ✅ Error logging and monitoring
- ✅ API key/groupId abstraction
- ✅ Consistent error handling
- ✅ CORS not an issue

**Endpoints**:
```
GET /api/clinect/ratings/[practiceSlug]    # Aggregate ratings
GET /api/clinect/reviews/[practiceSlug]    # Individual reviews
```

#### 5. Fallback Strategy

**Decision**: Graceful degradation with multiple fallback layers

**Layers**:
1. **Primary**: Live Clinect data (SSR cached)
2. **Secondary**: Stale cached data (if API down)
3. **Tertiary**: Local practice_comments table
4. **Final**: Static FALLBACK_COMMENTS array

**Transition Logic**:
- If Clinect API fails: Log error, use cached data
- If no cached data: Use local comments
- If no local comments: Use static fallbacks
- Never show blank/empty section

---

## Database Schema Changes

### Schema Updates

**Location**: Create new migration in `lib/db/migrations/`

**Schema File**: `lib/db/schema.ts` (practice_attributes table)

#### New Columns

```typescript
// In practice_attributes table definition
export const practice_attributes = pgTable(
  'practice_attributes',
  {
    // ... existing fields ...

    // Clinect Ratings Integration
    practice_slug: text('practice_slug'),
    ratings_feed_enabled: boolean('ratings_feed_enabled').default(false),

    // ... rest of fields ...
  },
  (table) => ({
    // ... existing indexes ...
    practiceSlugIdx: index('idx_practice_attributes_slug').on(table.practice_slug),
  })
);
```

#### Migration SQL

**File**: `lib/db/migrations/XXXX_add_clinect_ratings_fields.sql`

```sql
-- Add Clinect ratings integration fields to practice_attributes
ALTER TABLE practice_attributes 
ADD COLUMN practice_slug TEXT,
ADD COLUMN ratings_feed_enabled BOOLEAN DEFAULT false;

-- Add index for slug lookups (optional but recommended)
CREATE INDEX idx_practice_attributes_slug ON practice_attributes(practice_slug);

-- Add comment for documentation
COMMENT ON COLUMN practice_attributes.practice_slug IS 
  'Clinect-provided slug for practice ratings lookup (e.g., "michelle-wands")';

COMMENT ON COLUMN practice_attributes.ratings_feed_enabled IS 
  'Enable/disable Clinect live ratings feed display on practice website';
```

### TypeScript Type Updates

**File**: `lib/types/practice.ts`

```typescript
export interface PracticeAttributes {
  practice_attribute_id: string;
  practice_id: string;

  // ... existing fields ...

  // Clinect Ratings Integration
  practice_slug?: string;
  ratings_feed_enabled?: boolean;

  updated_at: string;
}
```

### Validation Schema Updates

**File**: `lib/validations/practice.ts`

```typescript
export const practiceAttributesUpdateSchema = z.object({
  // ... existing fields ...

  // Clinect Ratings Integration
  practice_slug: z
    .string()
    .max(255, 'Practice slug must not exceed 255 characters')
    .regex(
      /^[a-z0-9-]+$/,
      'Practice slug must contain only lowercase letters, numbers, and hyphens'
    )
    .optional(),
  ratings_feed_enabled: z.boolean().optional(),
});
```

### Form Schema Updates

**File**: `app/(default)/configure/practices/[id]/types.ts`

```typescript
export interface PracticeFormData {
  // ... existing fields ...

  // Clinect Ratings Integration
  practice_slug?: string;
  ratings_feed_enabled?: boolean;
}
```

---

## API Design

### Proxy Endpoints

Following project standards for API routes with `rbacRoute`, proper logging, and error handling.

#### 1. Get Practice Ratings

**Endpoint**: `GET /api/clinect/ratings/[practiceSlug]`

**File**: `app/api/clinect/ratings/[practiceSlug]/route.ts`

**Purpose**: Fetch aggregate rating data for a practice

**Response**:
```typescript
interface ClinectRatingResponse {
  provider_id: string;
  id_slug: string;
  response_count: number;
  curated_response_count: number;
  score_value: number; // 0-100
  score_value_stars: number; // 0-5
}
```

**Implementation Pattern**:
```typescript
import { publicRoute } from '@/lib/api/route-handlers';
import { createClinectService } from '@/lib/services/clinect-service';
import { createSuccessResponse, createErrorResponse } from '@/lib/api/responses';
import { log } from '@/lib/logger';

const handler = async (
  request: NextRequest,
  context: { params: Promise<{ practiceSlug: string }> }
) => {
  const startTime = Date.now();
  const { practiceSlug } = await context.params;

  try {
    const clinectService = createClinectService();
    const ratings = await clinectService.getRatings(practiceSlug);
    
    const duration = Date.now() - startTime;
    log.info('Clinect ratings fetched', {
      operation: 'fetch_clinect_ratings',
      practiceSlug,
      responseCount: ratings.response_count,
      scoreValue: ratings.score_value,
      duration,
      component: 'api',
    });

    return createSuccessResponse(ratings);
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Clinect ratings fetch failed', error, {
      operation: 'fetch_clinect_ratings',
      practiceSlug,
      duration,
      component: 'api',
    });

    return createErrorResponse(
      'Failed to fetch ratings data',
      500,
      request
    );
  }
};

export const GET = publicRoute(
  handler,
  'Fetch Clinect ratings for practice website display',
  { rateLimit: 'api' }
);
```

#### 2. Get Practice Reviews

**Endpoint**: `GET /api/clinect/reviews/[practiceSlug]`

**File**: `app/api/clinect/reviews/[practiceSlug]/route.ts`

**Query Parameters**:
- `limit`: Number of reviews (default: 10, max: 50)
- `type`: 'provider' (default)

**Response**:
```typescript
interface ClinectReviewResponse {
  data: Array<{
    survey_response_id: string;
    score_value: number; // 0-100
    score_value_pure_5: number; // 0-5
    approved_comment: string;
    patient_name: string | null;
    approved_at_formatted: string; // e.g., "January 15, 2025"
  }>;
}
```

**Implementation Pattern**:
```typescript
import { publicRoute } from '@/lib/api/route-handlers';
import { createClinectService } from '@/lib/services/clinect-service';
import { createSuccessResponse, createErrorResponse } from '@/lib/api/responses';
import { log } from '@/lib/logger';
import { z } from 'zod';

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10),
  type: z.enum(['provider', 'location']).default('provider'),
});

const handler = async (
  request: NextRequest,
  context: { params: Promise<{ practiceSlug: string }> }
) => {
  const startTime = Date.now();
  const { practiceSlug } = await context.params;
  
  // Parse query parameters
  const url = new URL(request.url);
  const queryParams = querySchema.parse({
    limit: url.searchParams.get('limit'),
    type: url.searchParams.get('type'),
  });

  try {
    const clinectService = createClinectService();
    const reviews = await clinectService.getReviews(
      practiceSlug,
      queryParams.limit,
      queryParams.type
    );
    
    const duration = Date.now() - startTime;
    log.info('Clinect reviews fetched', {
      operation: 'fetch_clinect_reviews',
      practiceSlug,
      reviewCount: reviews.data.length,
      limit: queryParams.limit,
      duration,
      component: 'api',
    });

    return createSuccessResponse(reviews);
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Clinect reviews fetch failed', error, {
      operation: 'fetch_clinect_reviews',
      practiceSlug,
      duration,
      component: 'api',
    });

    return createErrorResponse(
      'Failed to fetch reviews data',
      500,
      request
    );
  }
};

export const GET = publicRoute(
  handler,
  'Fetch Clinect reviews for practice website display',
  { rateLimit: 'api' }
);
```

---

## Service Layer

Following project standards for modular service architecture with proper error handling and caching.

### Clinect Service

**File**: `lib/services/clinect-service.ts`

**Purpose**: Encapsulate all Clinect API interactions with caching, error handling, and retry logic

**Interface**:
```typescript
export interface ClinectServiceInterface {
  getRatings(practiceSlug: string): Promise<ClinectRating>;
  getReviews(practiceSlug: string, limit?: number, type?: 'provider' | 'location'): Promise<ClinectReviews>;
  validateSlug(practiceSlug: string): Promise<boolean>;
}

export interface ClinectRating {
  provider_id: string;
  id_slug: string;
  response_count: number;
  curated_response_count: number;
  score_value: number;
  score_value_stars: number;
}

export interface ClinectReview {
  survey_response_id: string;
  score_value: number;
  score_value_pure_5: number;
  approved_comment: string;
  patient_name: string | null;
  approved_at_formatted: string;
}

export interface ClinectReviews {
  data: ClinectReview[];
}
```

**Implementation**:
```typescript
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { getCachedData, setCachedData } from '@/lib/cache/redis-cache';

const CLINECT_API_BASE = 'https://api2.clinectsurvey.com/stats';
const CLINECT_GROUP_ID = 'bendcare';
const API_TIMEOUT_MS = 5000;
const CACHE_TTL_RATINGS = 900; // 15 minutes
const CACHE_TTL_REVIEWS = 1800; // 30 minutes

// Response count and score thresholds
const MIN_RESPONSE_COUNT = 1;
const MIN_SCORE_VALUE = 65; // 0-100 scale

export function createClinectService(): ClinectServiceInterface {
  return {
    async getRatings(practiceSlug: string): Promise<ClinectRating> {
      const startTime = Date.now();
      const cacheKey = `clinect:ratings:${practiceSlug}`;

      try {
        // Check cache first
        const cached = await getCachedData<ClinectRating>(cacheKey);
        if (cached) {
          log.info('Clinect ratings served from cache', {
            operation: 'get_clinect_ratings',
            practiceSlug,
            source: 'cache',
            duration: Date.now() - startTime,
            component: 'service',
          });
          return cached;
        }

        // Fetch from API
        const url = `${CLINECT_API_BASE}/${CLINECT_GROUP_ID}/provider-score-slug/${practiceSlug}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        });

        if (!response.ok) {
          throw new Error(`Clinect API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('Invalid response format from Clinect API');
        }

        const rating = data[0];

        // Check thresholds
        if (rating.response_count < MIN_RESPONSE_COUNT || rating.score_value < MIN_SCORE_VALUE) {
          log.info('Clinect ratings below threshold', {
            operation: 'get_clinect_ratings',
            practiceSlug,
            responseCount: rating.response_count,
            scoreValue: rating.score_value,
            minResponseCount: MIN_RESPONSE_COUNT,
            minScoreValue: MIN_SCORE_VALUE,
            component: 'service',
          });
          throw new Error('Ratings below display threshold');
        }

        // Add calculated stars (0-5 scale)
        const enrichedRating: ClinectRating = {
          ...rating,
          score_value_stars: (rating.score_value / 100) * 5,
        };

        // Cache result
        await setCachedData(cacheKey, enrichedRating, CACHE_TTL_RATINGS);

        const duration = Date.now() - startTime;
        log.info('Clinect ratings fetched from API', {
          operation: 'get_clinect_ratings',
          practiceSlug,
          responseCount: rating.response_count,
          scoreValue: rating.score_value,
          source: 'api',
          duration,
          slow: duration > SLOW_THRESHOLDS.API_OPERATION,
          component: 'service',
        });

        return enrichedRating;
      } catch (error) {
        const duration = Date.now() - startTime;
        log.error('Failed to fetch Clinect ratings', error, {
          operation: 'get_clinect_ratings',
          practiceSlug,
          duration,
          component: 'service',
        });
        throw error;
      }
    },

    async getReviews(
      practiceSlug: string,
      limit = 10,
      type: 'provider' | 'location' = 'provider'
    ): Promise<ClinectReviews> {
      const startTime = Date.now();
      const cacheKey = `clinect:reviews:${practiceSlug}:${limit}`;

      try {
        // Check cache first
        const cached = await getCachedData<ClinectReviews>(cacheKey);
        if (cached) {
          log.info('Clinect reviews served from cache', {
            operation: 'get_clinect_reviews',
            practiceSlug,
            reviewCount: cached.data.length,
            source: 'cache',
            duration: Date.now() - startTime,
            component: 'service',
          });
          return cached;
        }

        // Fetch from API
        const url = `${CLINECT_API_BASE}/${CLINECT_GROUP_ID}/curated-response/slug/${practiceSlug}?type=${type}&limit=${limit}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        });

        if (!response.ok) {
          throw new Error(`Clinect API error: ${response.status} ${response.statusText}`);
        }

        const reviews = await response.json() as ClinectReviews;

        if (!reviews.data || !Array.isArray(reviews.data)) {
          throw new Error('Invalid response format from Clinect API');
        }

        // Cache result
        await setCachedData(cacheKey, reviews, CACHE_TTL_REVIEWS);

        const duration = Date.now() - startTime;
        log.info('Clinect reviews fetched from API', {
          operation: 'get_clinect_reviews',
          practiceSlug,
          reviewCount: reviews.data.length,
          limit,
          source: 'api',
          duration,
          slow: duration > SLOW_THRESHOLDS.API_OPERATION,
          component: 'service',
        });

        return reviews;
      } catch (error) {
        const duration = Date.now() - startTime;
        log.error('Failed to fetch Clinect reviews', error, {
          operation: 'get_clinect_reviews',
          practiceSlug,
          duration,
          component: 'service',
        });
        throw error;
      }
    },

    async validateSlug(practiceSlug: string): Promise<boolean> {
      try {
        await this.getRatings(practiceSlug);
        return true;
      } catch {
        return false;
      }
    },
  };
}
```

### Cache Strategy

**Cache Keys**:
- `clinect:ratings:{practiceSlug}` - Aggregate ratings (TTL: 15 min)
- `clinect:reviews:{practiceSlug}:{limit}` - Reviews list (TTL: 30 min)

**Cache Invalidation**:
- Automatic TTL expiration
- Manual invalidation not needed (data controlled by Clinect)

**Fallback on Cache Miss**:
- Attempt API fetch with 5-second timeout
- On failure, log error and return null for graceful fallback

---

## Static Assets

### Asset Organization

**Location**: `/public/clinect/`

```
public/
└── clinect/
    ├── sprites/
    │   ├── sprites_stars_tiny.png
    │   ├── sprites_stars_small.png
    │   └── sprites_stars_medium.png
    └── css/
        └── clinect-ratings.css
```

### Star Sprite Images

**Source**: `/bendcare_provider_reviews/images/sprites/`

**Copy to**: `/public/clinect/sprites/`

**Files**:
1. `sprites_stars_tiny.png` - 114x20px, 20px height
2. `sprites_stars_small.png` - 157x28px, 28px height  
3. `sprites_stars_medium.png` - 204x36px, 36px height

**Format**: PNG with transparency, sprite sheet with two states:
- Top half: Empty stars (gray outline)
- Bottom half: Filled stars (yellow/gold)

### CSS Styles

**Source**: `/bendcare_provider_reviews/css/clinect-ratings.css`

**Integration**: Copy and adapt into global styles or component-specific CSS module

**File**: `app/css/clinect-ratings.css` or integrate into `app/css/style.css`

**Key Classes**:
```css
/* Star containers by size */
.clinect-rating-background.tiny
.clinect-rating-background.small
.clinect-rating-background.medium

/* Star overlay (filled portion) */
.clinect-rating-overlay.tiny
.clinect-rating-overlay.small
.clinect-rating-overlay.medium

/* Review count text */
.clinect-rating-qty.tiny
.clinect-rating-qty.small
.clinect-rating-qty.medium
```

**Path Updates**:
```css
/* Original */
background: url(../images/sprites/sprites_stars_medium.png) 0 0;

/* Updated for our structure */
background: url(/clinect/sprites/sprites_stars_medium.png) 0 0;
```

### No External Dependencies

**Decision**: All assets hosted locally, no CDN or external scripts

**Benefits**:
- No CSP domain additions needed
- Full version control
- No external service dependencies
- Faster load times (same origin)
- Offline development support

---

## UI Components

### Admin Configuration UI

#### Ratings Integration Section

**File**: `app/(default)/configure/practices/[id]/sections/ratings-integration-section.tsx`

**Purpose**: Admin UI for configuring Clinect ratings integration per practice

```typescript
'use client';

import { useState } from 'react';
import type { UseFormRegisterReturn, FieldErrors } from 'react-hook-form';
import type { PracticeFormData } from '../types';

interface RatingsIntegrationSectionProps {
  register: (name: keyof PracticeFormData) => UseFormRegisterReturn;
  errors: FieldErrors<PracticeFormData>;
  watch: (name: keyof PracticeFormData) => unknown;
  setValue: (name: keyof PracticeFormData, value: unknown) => void;
  uid: string;
}

export function RatingsIntegrationSection({
  register,
  errors,
  watch,
  setValue,
  uid,
}: RatingsIntegrationSectionProps) {
  const ratingsEnabled = watch('ratings_feed_enabled') as boolean;
  const practiceSlug = watch('practice_slug') as string | undefined;
  const [testingSlug, setTestingSlug] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    data?: { responseCount: number; scoreValue: number };
  } | null>(null);

  const handleTestConnection = async () => {
    if (!practiceSlug) {
      setTestResult({
        success: false,
        message: 'Please enter a practice slug first',
      });
      return;
    }

    setTestingSlug(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/clinect/ratings/${practiceSlug}`);
      
      if (response.ok) {
        const data = await response.json();
        setTestResult({
          success: true,
          message: 'Connection successful! Ratings data found.',
          data: {
            responseCount: data.data.response_count,
            scoreValue: data.data.score_value,
          },
        });
      } else {
        setTestResult({
          success: false,
          message: 'Could not find ratings for this slug. Please verify with Clinect.',
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Connection failed. Please check your network connection.',
      });
    } finally {
      setTestingSlug(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Ratings Integration
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Display live patient ratings and reviews from Clinect on your practice website.
        </p>
      </div>

      {/* Enable Toggle */}
      <div className="mb-6">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            {...register('ratings_feed_enabled')}
            className="w-5 h-5 text-violet-500 border-gray-300 rounded focus:ring-violet-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Enable Clinect Ratings Feed
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Show live ratings and reviews from verified patients
            </p>
          </div>
        </label>
      </div>

      {/* Practice Slug Field (only shown when enabled) */}
      {ratingsEnabled && (
        <div className="space-y-4 border-t pt-6 dark:border-gray-700">
          <div>
            <label
              htmlFor={`practice-slug-${uid}`}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Practice Slug
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              id={`practice-slug-${uid}`}
              {...register('practice_slug')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
              placeholder="e.g., michelle-wands"
            />
            {errors.practice_slug && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.practice_slug.message}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              This slug is provided by Clinect and uniquely identifies your practice in their
              system. Must contain only lowercase letters, numbers, and hyphens.
            </p>
          </div>

          {/* Test Connection Button */}
          <div>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={!practiceSlug || testingSlug}
              className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed dark:disabled:bg-gray-600"
            >
              {testingSlug ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`p-4 rounded-lg ${
                testResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  testResult.success
                    ? 'text-green-800 dark:text-green-300'
                    : 'text-red-800 dark:text-red-300'
                }`}
              >
                {testResult.message}
              </p>
              {testResult.success && testResult.data && (
                <div className="mt-2 text-xs text-green-700 dark:text-green-400">
                  <p>Reviews: {testResult.data.responseCount}</p>
                  <p>Score: {testResult.data.scoreValue}/100</p>
                </div>
              )}
            </div>
          )}

          {/* Warning Message */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-yellow-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Enabling Clinect ratings will replace any local reviews you have configured.
                  Your local reviews will remain in the database and can be restored by
                  disabling this feature.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

#### Integration into Practice Config Form

**File**: `app/(default)/configure/practices/[id]/practice-config-form.tsx`

Add import and section:

```typescript
import { RatingsIntegrationSection } from './sections/ratings-integration-section';

// In the form JSX, add after BrandingSection:
<RatingsIntegrationSection
  register={register}
  errors={errors}
  watch={watch}
  setValue={setValue}
  uid={uid}
/>
```

#### Form Data Mapping

**File**: `app/(default)/configure/practices/[id]/hooks/use-practice-config-form.ts`

Update `mapAttributesToFormData`:

```typescript
function mapAttributesToFormData(
  attributes: PracticeAttributes,
  practice: Practice
): PracticeFormData {
  return {
    // ... existing fields ...

    // Clinect Ratings Integration
    practice_slug: attributes.practice_slug || '',
    ratings_feed_enabled: attributes.ratings_feed_enabled || false,
  };
}
```

---

## Template Integration

### Clinect Ratings Widget Component

**File**: `components/clinect-ratings-widget.tsx`

**Purpose**: Reusable React component that displays Clinect ratings and reviews without jQuery

```typescript
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

export interface ClinectRatingsWidgetProps {
  practiceSlug: string;
  size?: 'tiny' | 'small' | 'medium';
  showReviews?: boolean;
  reviewLimit?: number;
  animate?: boolean;
  initialRatings?: ClinectRating | null;
  initialReviews?: ClinectReview[] | null;
  className?: string;
}

interface ClinectRating {
  response_count: number;
  curated_response_count: number;
  score_value: number;
  score_value_stars: number;
}

interface ClinectReview {
  survey_response_id: string;
  score_value_pure_5: number;
  approved_comment: string;
  patient_name: string | null;
  approved_at_formatted: string;
}

export default function ClinectRatingsWidget({
  practiceSlug,
  size = 'small',
  showReviews = true,
  reviewLimit = 5,
  animate = true,
  initialRatings = null,
  initialReviews = null,
  className = '',
}: ClinectRatingsWidgetProps) {
  const [ratings, setRatings] = useState<ClinectRating | null>(initialRatings);
  const [reviews, setReviews] = useState<ClinectReview[]>(initialReviews || []);
  const [loading, setLoading] = useState(!initialRatings);
  const [error, setError] = useState<string | null>(null);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);

  // Fetch ratings if not provided as initial data
  useEffect(() => {
    if (initialRatings) return;

    const fetchRatings = async () => {
      try {
        const response = await fetch(`/api/clinect/ratings/${practiceSlug}`);
        if (!response.ok) throw new Error('Failed to fetch ratings');
        
        const data = await response.json();
        setRatings(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchRatings();
  }, [practiceSlug, initialRatings]);

  // Fetch reviews if showReviews is enabled and not provided as initial data
  useEffect(() => {
    if (!showReviews || initialReviews) return;

    const fetchReviews = async () => {
      try {
        const response = await fetch(
          `/api/clinect/reviews/${practiceSlug}?limit=${reviewLimit}`
        );
        if (!response.ok) throw new Error('Failed to fetch reviews');
        
        const data = await response.json();
        setReviews(data.data.data || []);
      } catch (err) {
        console.error('Failed to fetch reviews:', err);
      }
    };

    fetchReviews();
  }, [practiceSlug, showReviews, reviewLimit, initialReviews]);

  // Auto-rotate reviews
  useEffect(() => {
    if (!showReviews || reviews.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentReviewIndex((prev) => (prev + 1) % reviews.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [showReviews, reviews.length]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="animate-pulse text-gray-500">Loading ratings...</div>
      </div>
    );
  }

  if (error || !ratings) {
    return null; // Fail silently, fallback handled by parent
  }

  const currentReview = reviews[currentReviewIndex];
  const starPercentage = (ratings.score_value_stars / 5) * 100;

  return (
    <div className={`clinect-ratings ${className}`}>
      {/* Star Rating Display */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <div className="relative inline-block">
          {/* Background stars (empty) */}
          <div className={`clinect-rating-background ${size}`}>
            <Image
              src={`/clinect/sprites/sprites_stars_${size}.png`}
              alt="Star rating"
              width={size === 'tiny' ? 114 : size === 'small' ? 157 : 204}
              height={size === 'tiny' ? 20 : size === 'small' ? 28 : 36}
              style={{ objectPosition: '0 0' }}
            />
          </div>
          {/* Foreground stars (filled) */}
          <div
            className={`clinect-rating-overlay ${size} absolute top-0 left-0 overflow-hidden`}
            style={{
              width: `${starPercentage}%`,
              transition: animate ? 'width 1s ease-in-out' : 'none',
            }}
          >
            <Image
              src={`/clinect/sprites/sprites_stars_${size}.png`}
              alt=""
              width={size === 'tiny' ? 114 : size === 'small' ? 157 : 204}
              height={size === 'tiny' ? 20 : size === 'small' ? 28 : 36}
              style={{ objectPosition: '0 -100%' }}
            />
          </div>
        </div>
        <div className="text-sm text-gray-600">
          <span className="font-semibold">{ratings.score_value_stars.toFixed(1)}</span> out of 5
          stars
        </div>
      </div>

      {/* Review Count */}
      <div className="text-center text-sm text-gray-500 mb-8">
        {ratings.response_count.toLocaleString()} ratings,{' '}
        {ratings.curated_response_count.toLocaleString()} reviews
      </div>

      {/* Review Carousel */}
      {showReviews && reviews.length > 0 && currentReview && (
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-8 md:p-12 text-center min-h-[280px] flex flex-col justify-center">
            {/* Review Stars */}
            <div className="flex justify-center gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <span
                  key={i}
                  className={`text-2xl ${
                    i < Math.round(currentReview.score_value_pure_5)
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                  }`}
                >
                  ★
                </span>
              ))}
            </div>

            {/* Review Comment */}
            <blockquote className="text-xl md:text-2xl text-gray-700 mb-6 leading-relaxed italic">
              "{currentReview.approved_comment}"
            </blockquote>

            {/* Reviewer Info */}
            <div>
              {currentReview.patient_name && (
                <p className="font-semibold text-lg text-gray-900 mb-1">
                  {currentReview.patient_name}
                </p>
              )}
              <p className="text-gray-500 text-sm">{currentReview.approved_at_formatted}</p>
            </div>
          </div>

          {/* Carousel Indicators */}
          {reviews.length > 1 && (
            <div className="flex justify-center mt-8 space-x-2">
              {reviews.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setCurrentReviewIndex(index)}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    index === currentReviewIndex
                      ? 'w-8 bg-practice-primary'
                      : 'bg-slate-300 opacity-50 hover:opacity-75'
                  }`}
                  aria-label={`Go to review ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Server-Side Data Fetching

**File**: `app/practice/[domain]/page.tsx`

Update to fetch Clinect data server-side:

```typescript
// Add after fetching comments
let clinectRatings: ClinectRating | null = null;
let clinectReviews: ClinectReview[] | null = null;

// Fetch Clinect data if enabled
if (attributes.ratings_feed_enabled && attributes.practice_slug) {
  try {
    const clinectService = createClinectService();
    
    // Fetch ratings with timeout
    clinectRatings = await Promise.race([
      clinectService.getRatings(attributes.practice_slug),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    // Fetch reviews with timeout
    if (clinectRatings) {
      clinectReviews = await Promise.race([
        clinectService.getReviews(attributes.practice_slug, 5).then(r => r.data),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
    }
  } catch (error) {
    log.error('Failed to fetch Clinect data for practice website', error, {
      operation: 'fetch_clinect_data_ssr',
      practiceId: practice.practice_id,
      practiceSlug: attributes.practice_slug,
      component: 'server',
    });
  }
}

// Pass to template
return (
  <TemplateComponent
    practice={practice}
    attributes={parsedAttributes}
    staff={parsedStaff}
    comments={comments}
    clinectRatings={clinectRatings}
    clinectReviews={clinectReviews}
    nonce={nonce}
  />
);
```

### Template Props Update

**File**: `lib/types/practice.ts`

```typescript
export interface TemplateProps {
  practice: Practice;
  attributes: PracticeAttributes;
  staff: StaffMember[];
  comments?: PracticeComment[];
  clinectRatings?: ClinectRating | null;
  clinectReviews?: ClinectReview[] | null;
  colorStyles?: ColorStyles; // Deprecated
  nonce?: string;
}
```

### Review Carousel Update

**File**: `templates/classic-professional/components/review-carousel.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import type { PracticeComment } from '@/lib/types/practice';
import ClinectRatingsWidget from '@/components/clinect-ratings-widget';
import type { ClinectRating, ClinectReview } from '@/components/clinect-ratings-widget';

interface ReviewCarouselProps {
  colorStyles?: unknown;
  comments: PracticeComment[];
  // Clinect integration
  ratingsEnabled?: boolean;
  practiceSlug?: string;
  clinectRatings?: ClinectRating | null;
  clinectReviews?: ClinectReview[] | null;
  nonce?: string;
}

// Existing fallback comments...
const FALLBACK_COMMENTS = [ /* ... */ ];

export default function ReviewCarousel({
  colorStyles,
  comments,
  ratingsEnabled,
  practiceSlug,
  clinectRatings,
  clinectReviews,
  nonce,
}: ReviewCarouselProps) {
  // If Clinect is enabled and we have a slug, use Clinect widget
  if (ratingsEnabled && practiceSlug) {
    return (
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              What Our Patients Say
            </h2>
            <div className="w-24 h-1 mx-auto bg-practice-primary" />
          </div>

          <ClinectRatingsWidget
            practiceSlug={practiceSlug}
            size="medium"
            showReviews={true}
            reviewLimit={5}
            animate={true}
            initialRatings={clinectRatings}
            initialReviews={clinectReviews}
          />
        </div>
      </section>
    );
  }

  // Existing local review carousel logic
  const [currentIndex, setCurrentIndex] = useState(0);
  const displayComments = comments && comments.length > 0 ? comments : FALLBACK_COMMENTS;

  // ... rest of existing component code ...
}
```

### Template Index Updates

Update both `classic-professional` and `tidy-professional` templates:

**File**: `templates/classic-professional/index.tsx`

```typescript
export default function ClassicProfessionalTemplate({
  practice,
  attributes,
  staff,
  comments = [],
  clinectRatings = null,
  clinectReviews = null,
  nonce
}: TemplateProps) {
  // ... existing code ...

  return (
    <>
      {/* ... */}
      
      <ReviewCarousel 
        comments={comments}
        ratingsEnabled={attributes.ratings_feed_enabled}
        practiceSlug={attributes.practice_slug}
        clinectRatings={clinectRatings}
        clinectReviews={clinectReviews}
        nonce={nonce}
      />
      
      {/* ... */}
    </>
  );
}
```

---

## Security Implementation

### Content Security Policy (CSP)

**File**: `lib/security/headers.ts`

Add Clinect API domain to `connect-src` directive:

```typescript
export function getEnhancedContentSecurityPolicy(nonces?: CSPNonces): string {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const csp = {
    // ... existing directives ...
    
    'connect-src': [
      "'self'",
      'https://api2.clinectsurvey.com', // Clinect API for ratings data
      // ... existing entries ...
    ],
    
    // ... rest of directives ...
  };

  // ... rest of function ...
}
```

### Input Sanitization

**Practice Slug Validation**:
- Regex: `/^[a-z0-9-]+$/`
- Max length: 255 characters
- No path traversal characters
- Server-side validation in API routes

**API Response Validation**:
- Validate response structure before caching
- Sanitize HTML in review comments
- Cap review text length (max 5000 characters)

**Implementation in Service**:
```typescript
// In clinect-service.ts
import DOMPurify from 'isomorphic-dompurify';

function sanitizeReview(review: ClinectReview): ClinectReview {
  return {
    ...review,
    approved_comment: DOMPurify.sanitize(review.approved_comment, {
      ALLOWED_TAGS: [], // Strip all HTML
      ALLOWED_ATTR: [],
    }).substring(0, 5000), // Cap at 5000 chars
    patient_name: review.patient_name 
      ? DOMPurify.sanitize(review.patient_name, {
          ALLOWED_TAGS: [],
          ALLOWED_ATTR: [],
        }).substring(0, 255)
      : null,
  };
}
```

### Rate Limiting

API routes use standard rate limiting:
- `/api/clinect/*`: 100 req/min (standard `rateLimit: 'api'`)
- Proxy routes are public but rate-limited per IP
- Server-side caching reduces upstream API calls

### Error Information Disclosure

**Development vs Production**:
```typescript
// In API error handlers
const clientErrorMessage =
  process.env.NODE_ENV === 'development' 
    ? errorMessage 
    : 'Failed to fetch ratings data';
```

**Never expose**:
- Clinect API keys (none needed - public API)
- Internal error stack traces
- Database connection details
- Cache keys or internal IDs

### HTTPS Requirements

- All Clinect API calls over HTTPS
- No mixed content warnings
- Certificate validation enforced
- No SSL certificate pinning (managed by Clinect)

---

## Testing Strategy

### Unit Tests

**File**: `tests/unit/services/clinect-service.test.ts`

Test service layer:
- ✅ Successful rating fetch
- ✅ Successful review fetch
- ✅ API timeout handling
- ✅ Invalid response format handling
- ✅ Cache hit scenarios
- ✅ Cache miss scenarios
- ✅ Threshold validation (min response count, min score)
- ✅ Slug validation

**File**: `tests/unit/components/clinect-ratings-widget.test.tsx`

Test React component:
- ✅ Renders with valid data
- ✅ Shows loading state
- ✅ Handles missing data gracefully
- ✅ Review carousel navigation
- ✅ Star rating calculation
- ✅ Responsive layout

### Integration Tests

**File**: `tests/integration/api/clinect-ratings.test.ts`

Test API routes:
- ✅ GET `/api/clinect/ratings/[slug]` success
- ✅ GET `/api/clinect/ratings/[slug]` with invalid slug
- ✅ GET `/api/clinect/ratings/[slug]` with API timeout
- ✅ Rate limiting enforcement
- ✅ Response caching behavior
- ✅ Error response format

**File**: `tests/integration/api/clinect-reviews.test.ts`

Test review endpoint:
- ✅ GET `/api/clinect/reviews/[slug]` success
- ✅ Query parameter validation (limit, type)
- ✅ Empty reviews array handling
- ✅ Review sanitization

### Template Integration Tests

**File**: `tests/integration/templates/clinect-integration.test.tsx`

Test template rendering:
- ✅ Classic Professional with Clinect enabled
- ✅ Classic Professional with Clinect disabled
- ✅ Tidy Professional with Clinect enabled
- ✅ Fallback to local comments on error
- ✅ SSR data hydration

### Security Tests

**File**: `tests/security/clinect-security.test.ts`

Security validation:
- ✅ CSP compliance (no violations)
- ✅ XSS prevention in review comments
- ✅ SQL injection prevention in slug parameter
- ✅ Path traversal prevention
- ✅ Rate limiting effectiveness
- ✅ HTTPS enforcement

### End-to-End Tests

**File**: `tests/e2e/clinect-flow.test.ts`

Full workflow:
1. Admin enables ratings
2. Admin sets practice slug
3. Admin tests connection
4. Admin saves configuration
5. Public website displays ratings
6. Ratings carousel auto-rotates
7. Graceful fallback on API failure

### Test Data Setup

**Mock Clinect Responses**:
```typescript
// tests/mocks/clinect-api.ts
export const mockClinectRating = {
  provider_id: '123',
  id_slug: 'test-practice',
  response_count: 156,
  curated_response_count: 42,
  score_value: 92,
  score_value_stars: 4.6,
};

export const mockClinectReviews = {
  data: [
    {
      survey_response_id: 'rev-1',
      score_value: 95,
      score_value_pure_5: 4.75,
      approved_comment: 'Excellent care and very professional staff.',
      patient_name: 'John D.',
      approved_at_formatted: 'January 10, 2025',
    },
    // ... more reviews
  ],
};
```

### Manual Testing Checklist

**Admin Panel**:
- [ ] Toggle ratings on/off
- [ ] Enter valid slug
- [ ] Enter invalid slug (validation error)
- [ ] Test connection with valid slug (success message)
- [ ] Test connection with invalid slug (error message)
- [ ] Save configuration
- [ ] Verify data persists on page reload

**Practice Website**:
- [ ] Visit practice with ratings enabled
- [ ] Verify stars display correctly
- [ ] Verify review count shows
- [ ] Verify reviews carousel auto-rotates
- [ ] Click carousel navigation dots
- [ ] Visit practice with ratings disabled (shows local comments)
- [ ] Simulate API failure (check fallback)

**Performance**:
- [ ] Measure page load time impact
- [ ] Verify caching reduces API calls
- [ ] Test timeout handling (5s max)
- [ ] Check mobile responsiveness

---

## Implementation Phases

### Phase 1: Database & Foundation (Days 1-2)

**Goal**: Set up database schema and type system

#### Tasks

- [ ] **DB-1**: Create Drizzle migration file
  - File: `lib/db/migrations/XXXX_add_clinect_ratings_fields.sql`
  - Add `practice_slug TEXT` column
  - Add `ratings_feed_enabled BOOLEAN` column
  - Add index on `practice_slug`
  - Add column comments

- [ ] **DB-2**: Update schema definition
  - File: `lib/db/schema.ts`
  - Add fields to `practice_attributes` table
  - Add index definition

- [ ] **DB-3**: Update TypeScript types
  - File: `lib/types/practice.ts`
  - Add fields to `PracticeAttributes` interface
  - Add `ClinectRating` and `ClinectReview` interfaces
  - Update `TemplateProps` interface

- [ ] **DB-4**: Update validation schemas
  - File: `lib/validations/practice.ts`
  - Add `practice_slug` validation (regex, length)
  - Add `ratings_feed_enabled` validation

- [ ] **DB-5**: Update form types
  - File: `app/(default)/configure/practices/[id]/types.ts`
  - Add fields to `PracticeFormData` interface

- [ ] **DB-6**: Run migration
  - Execute: `pnpm db:generate`
  - Execute: `pnpm db:migrate`
  - Verify in database: `pnpm db:psql`

- [ ] **DB-7**: Validate changes
  - Execute: `pnpm tsc`
  - Execute: `pnpm lint`
  - Fix any errors

**Acceptance**: Database has new columns, types compile, validation works

---

### Phase 2: Service Layer (Days 3-4)

**Goal**: Build Clinect API service with caching and error handling

#### Tasks

- [ ] **SVC-1**: Create Clinect service
  - File: `lib/services/clinect-service.ts`
  - Implement `createClinectService()` factory
  - Implement `getRatings()` method
  - Implement `getReviews()` method
  - Implement `validateSlug()` method

- [ ] **SVC-2**: Add caching layer
  - Integrate with existing Redis cache (`lib/cache/redis-cache.ts`)
  - Set TTL: 15 min for ratings, 30 min for reviews
  - Implement cache key strategy

- [ ] **SVC-3**: Add error handling
  - API timeout (5 seconds)
  - Invalid response format handling
  - Threshold validation (min response count, min score)
  - Graceful degradation

- [ ] **SVC-4**: Add logging
  - Use `@/lib/logger` with proper context
  - Log API calls, cache hits/misses, errors
  - Follow performance threshold patterns

- [ ] **SVC-5**: Write unit tests
  - File: `tests/unit/services/clinect-service.test.ts`
  - Mock fetch API calls
  - Test success cases
  - Test error cases
  - Test cache behavior
  - Test threshold validation

- [ ] **SVC-6**: Validate service
  - Execute: `pnpm test:unit`
  - Execute: `pnpm tsc`
  - Execute: `pnpm lint`

**Acceptance**: Service layer complete, tested, type-safe

---

### Phase 3: API Routes (Day 5)

**Goal**: Create Next.js API proxy endpoints

#### Tasks

- [ ] **API-1**: Create ratings endpoint
  - File: `app/api/clinect/ratings/[practiceSlug]/route.ts`
  - Use `publicRoute` wrapper
  - Implement GET handler
  - Use `createClinectService()`
  - Add proper logging
  - Add error handling

- [ ] **API-2**: Create reviews endpoint
  - File: `app/api/clinect/reviews/[practiceSlug]/route.ts`
  - Use `publicRoute` wrapper
  - Implement GET handler with query params
  - Validate `limit` and `type` parameters
  - Use `createClinectService()`
  - Add proper logging

- [ ] **API-3**: Write integration tests
  - File: `tests/integration/api/clinect-ratings.test.ts`
  - File: `tests/integration/api/clinect-reviews.test.ts`
  - Test success scenarios
  - Test error scenarios
  - Test rate limiting
  - Test caching

- [ ] **API-4**: Validate API routes
  - Execute: `pnpm test:integration`
  - Execute: `pnpm tsc`
  - Execute: `pnpm lint`

**Acceptance**: API routes work, tests pass, proper error handling

---

### Phase 4: Static Assets (Day 6)

**Goal**: Copy and integrate Clinect visual assets

#### Tasks

- [ ] **ASSET-1**: Create directory structure
  - Create: `public/clinect/sprites/`
  - Create: `public/clinect/css/`

- [ ] **ASSET-2**: Copy sprite images
  - Copy: `bendcare_provider_reviews/images/sprites/*.png`
  - To: `public/clinect/sprites/`
  - Verify: `sprites_stars_tiny.png`
  - Verify: `sprites_stars_small.png`
  - Verify: `sprites_stars_medium.png`

- [ ] **ASSET-3**: Adapt CSS styles
  - Source: `bendcare_provider_reviews/css/clinect-ratings.css`
  - Update image paths to `/clinect/sprites/`
  - Integrate into: `app/css/clinect-ratings.css` or `app/css/style.css`
  - Test sprite rendering

- [ ] **ASSET-4**: Optimize assets
  - Compress PNG images (if needed)
  - Verify transparent backgrounds
  - Test on retina displays

**Acceptance**: Assets load correctly, stars render properly

---

### Phase 5: React Components (Days 7-8)

**Goal**: Build reusable Clinect widget component

#### Tasks

- [ ] **COMP-1**: Create widget component
  - File: `components/clinect-ratings-widget.tsx`
  - Implement star rating display
  - Implement review carousel
  - Add loading states
  - Add error states
  - Add accessibility attributes

- [ ] **COMP-2**: Add client-side features
  - Auto-rotating carousel (5s interval)
  - Manual navigation dots
  - Smooth animations
  - Responsive design

- [ ] **COMP-3**: Handle SSR hydration
  - Accept `initialRatings` prop
  - Accept `initialReviews` prop
  - Fallback to client fetch if needed
  - No hydration mismatches

- [ ] **COMP-4**: Write component tests
  - File: `tests/unit/components/clinect-ratings-widget.test.tsx`
  - Test rendering with data
  - Test loading state
  - Test error state
  - Test carousel navigation
  - Test responsive behavior

- [ ] **COMP-5**: Validate component
  - Execute: `pnpm test:unit`
  - Visual testing in Storybook (if available)
  - Test accessibility (WCAG 2.1 AA)

**Acceptance**: Component works standalone, fully tested

---

### Phase 6: Admin UI (Days 9-10)

**Goal**: Build practice configuration interface

#### Tasks

- [ ] **UI-1**: Create ratings section component
  - File: `app/(default)/configure/practices/[id]/sections/ratings-integration-section.tsx`
  - Toggle for `ratings_feed_enabled`
  - Input for `practice_slug`
  - Test connection button
  - Validation messages
  - Warning about replacing local reviews

- [ ] **UI-2**: Implement test connection
  - Call `/api/clinect/ratings/[slug]`
  - Show success message with data
  - Show error message on failure
  - Loading state during test

- [ ] **UI-3**: Integrate into practice form
  - File: `app/(default)/configure/practices/[id]/practice-config-form.tsx`
  - Add `<RatingsIntegrationSection>` component
  - Position after BrandingSection

- [ ] **UI-4**: Update form hooks
  - File: `app/(default)/configure/practices/[id]/hooks/use-practice-config-form.ts`
  - Add fields to `mapAttributesToFormData()`
  - Ensure defaults: slug='', enabled=false

- [ ] **UI-5**: Update service layer
  - File: `lib/services/rbac-practice-attributes-service.ts`
  - Ensure new fields are saved/loaded correctly
  - No special transformation needed (text + boolean)

- [ ] **UI-6**: Manual testing
  - Enable ratings toggle
  - Enter valid slug
  - Test connection (success)
  - Save configuration
  - Reload page, verify persistence
  - Test invalid slug validation

**Acceptance**: Admin can configure ratings, changes persist

---

### Phase 7: Template Integration (Days 11-12)

**Goal**: Integrate widget into practice templates

#### Tasks

- [ ] **TMPL-1**: Update practice page SSR
  - File: `app/practice/[domain]/page.tsx`
  - Add Clinect data fetching
  - Use `createClinectService()`
  - Implement timeout (5s)
  - Pass data to template as props

- [ ] **TMPL-2**: Update Classic Professional template
  - File: `templates/classic-professional/components/review-carousel.tsx`
  - Add conditional rendering
  - If `ratingsEnabled && practiceSlug`: use `<ClinectRatingsWidget>`
  - Else: use existing local carousel
  - Pass SSR data as initial props

- [ ] **TMPL-3**: Update Classic Professional index
  - File: `templates/classic-professional/index.tsx`
  - Accept new props: `clinectRatings`, `clinectReviews`
  - Pass to `<ReviewCarousel>` component

- [ ] **TMPL-4**: Update Tidy Professional template
  - File: `templates/tidy-professional/components/review-carousel.tsx`
  - Same changes as Classic Professional
  - Adapt styling to Tidy template aesthetic

- [ ] **TMPL-5**: Update Tidy Professional index
  - File: `templates/tidy-professional/index.tsx`
  - Same prop changes as Classic Professional

- [ ] **TMPL-6**: Write integration tests
  - File: `tests/integration/templates/clinect-integration.test.tsx`
  - Test Classic Professional with Clinect
  - Test Tidy Professional with Clinect
  - Test fallback behavior
  - Test SSR hydration

- [ ] **TMPL-7**: Manual testing
  - Create test practice with ratings enabled
  - Visit practice website
  - Verify stars display
  - Verify reviews carousel
  - Test auto-rotation
  - Test fallback (disable ratings)

**Acceptance**: Templates display Clinect data correctly, fallback works

---

### Phase 8: Security & CSP (Day 13)

**Goal**: Ensure security compliance

#### Tasks

- [ ] **SEC-1**: Update CSP configuration
  - File: `lib/security/headers.ts`
  - Add `https://api2.clinectsurvey.com` to `connect-src`
  - Document why domain is whitelisted

- [ ] **SEC-2**: Add input sanitization
  - Install: `isomorphic-dompurify`
  - Sanitize review comments (strip HTML)
  - Sanitize patient names
  - Cap text lengths

- [ ] **SEC-3**: Validate API responses
  - Check response structure before caching
  - Validate data types
  - Handle malformed responses gracefully

- [ ] **SEC-4**: Security testing
  - File: `tests/security/clinect-security.test.ts`
  - Test XSS prevention
  - Test SQL injection prevention
  - Test path traversal prevention
  - Test CSP compliance (no violations)

- [ ] **SEC-5**: Manual security review
  - Check CSP in browser console
  - Test with malicious slug inputs
  - Verify HTTPS enforcement
  - Review error messages (no info disclosure)

**Acceptance**: Security posture maintained, CSP compliant, no vulnerabilities

---

### Phase 9: Testing & QA (Days 14-15)

**Goal**: Comprehensive testing and bug fixes

#### Tasks

- [ ] **TEST-1**: Run full test suite
  - Execute: `pnpm test:run`
  - Fix any failing tests
  - Achieve >80% code coverage for new code

- [ ] **TEST-2**: Cross-browser testing
  - Chrome (latest)
  - Firefox (latest)
  - Safari (latest)
  - Edge (latest)
  - Mobile Safari (iOS)
  - Mobile Chrome (Android)

- [ ] **TEST-3**: Performance testing
  - Measure page load impact (<200ms)
  - Verify caching reduces API calls
  - Test timeout handling
  - Check memory usage

- [ ] **TEST-4**: Accessibility testing
  - Screen reader compatibility
  - Keyboard navigation
  - Color contrast (WCAG AA)
  - ARIA labels

- [ ] **TEST-5**: Load testing
  - Simulate high traffic
  - Verify rate limiting works
  - Check cache effectiveness
  - Monitor error rates

- [ ] **TEST-6**: Error scenario testing
  - Clinect API down
  - Clinect API timeout
  - Invalid slug
  - No reviews available
  - Below threshold scores

- [ ] **TEST-7**: Run linting and type checks
  - Execute: `pnpm tsc`
  - Execute: `pnpm lint`
  - Fix all errors and warnings

**Acceptance**: All tests pass, no critical bugs, performance acceptable

---

### Phase 10: Documentation & Deployment (Days 16-17)

**Goal**: Prepare for production rollout

#### Tasks

- [ ] **DOC-1**: Create admin guide
  - File: `docs/admin/clinect-ratings-setup.md`
  - How to enable ratings
  - How to get practice slug from Clinect
  - How to test connection
  - Troubleshooting guide

- [ ] **DOC-2**: Create developer documentation
  - Update: `docs/architecture/integrations.md`
  - Document Clinect service API
  - Document component usage
  - Document caching strategy

- [ ] **DOC-3**: Update API documentation
  - Document new endpoints
  - Request/response formats
  - Error codes
  - Rate limiting

- [ ] **DOC-4**: Create runbook
  - File: `docs/runbooks/clinect-integration.md`
  - How to monitor Clinect API health
  - How to debug rating display issues
  - How to invalidate cache
  - Emergency rollback procedure

- [ ] **DOC-5**: Set up monitoring
  - Add CloudWatch dashboard for Clinect metrics
  - Alert: Clinect API error rate >5%
  - Alert: Clinect API latency >3s
  - Alert: Cache miss rate >20%

- [ ] **DOC-6**: Staging deployment
  - Deploy to staging environment
  - Test with real Clinect API
  - Verify all functionality
  - Performance validation

- [ ] **DOC-7**: Production deployment plan
  - Create deployment checklist
  - Plan rollback procedure
  - Notify stakeholders
  - Schedule maintenance window (if needed)

**Acceptance**: Documentation complete, monitoring in place, ready for production

---

## Acceptance Criteria

### Functional Requirements

✅ **FR-1**: Practice can enable/disable Clinect ratings feed via admin panel

✅ **FR-2**: Practice can enter and validate practice slug

✅ **FR-3**: Practice website displays live Clinect ratings when enabled

✅ **FR-4**: Practice website displays live Clinect reviews in carousel

✅ **FR-5**: System falls back to local comments when Clinect unavailable

✅ **FR-6**: Ratings display only when above minimum thresholds (count & score)

✅ **FR-7**: Review carousel auto-rotates every 5 seconds

✅ **FR-8**: Manual navigation works for review carousel

✅ **FR-9**: Star ratings render correctly with sprite images

✅ **FR-10**: SSR provides initial data for SEO

### Non-Functional Requirements

✅ **NFR-1**: API timeout: 5 seconds maximum

✅ **NFR-2**: Page load impact: <200ms additional

✅ **NFR-3**: Cache TTL: 15 min ratings, 30 min reviews

✅ **NFR-4**: Rate limiting: 100 req/min per IP

✅ **NFR-5**: Zero CSP violations

✅ **NFR-6**: Mobile responsive design

✅ **NFR-7**: Accessibility: WCAG 2.1 AA compliant

✅ **NFR-8**: TypeScript strict mode compliance

✅ **NFR-9**: Test coverage: >80% for new code

✅ **NFR-10**: Zero security regressions

### User Experience

✅ **UX-1**: Admin can test connection before saving

✅ **UX-2**: Clear error messages for invalid slugs

✅ **UX-3**: Warning shown when replacing local reviews

✅ **UX-4**: Loading states during data fetch

✅ **UX-5**: No blank sections on failure (graceful fallback)

✅ **UX-6**: Smooth animations and transitions

✅ **UX-7**: Consistent styling across templates

---

## Rollout Strategy

### Pre-Launch (Week 1)

- [ ] Complete Phases 1-10
- [ ] Deploy to staging
- [ ] Internal QA testing
- [ ] Security audit
- [ ] Performance validation
- [ ] Documentation review

### Soft Launch (Week 2)

- [ ] Deploy to production (feature off by default)
- [ ] Enable for 2-3 pilot practices
- [ ] Monitor for 7 days:
  - API success rate
  - Page load times
  - Error rates
  - Cache effectiveness
- [ ] Collect feedback from pilot practices
- [ ] Fix any issues found

### Gradual Rollout (Weeks 3-4)

- [ ] Announce feature to all practices via email
- [ ] Provide setup documentation
- [ ] Enable for practices upon request
- [ ] Monitor adoption rate
- [ ] Support team training
- [ ] Continue monitoring metrics

### Full Availability (Week 5+)

- [ ] Feature generally available
- [ ] Proactive outreach to practices
- [ ] Monthly metrics review:
  - Adoption rate
  - API reliability
  - User satisfaction
- [ ] Plan future enhancements

### Rollback Plan

**Triggers**:
- Clinect API reliability <95%
- Page load increase >500ms
- Critical security issue
- User complaints >10% of enabled practices

**Procedure**:
1. Set global kill switch: `CLINECT_ENABLED=false` env var
2. Deploy config change (no code revert needed)
3. Verify all practices fall back to local comments
4. Investigate root cause
5. Fix and re-deploy when stable

---

## Risk Mitigation

### High-Impact Risks

**Risk 1: Clinect API Downtime**
- **Probability**: Medium
- **Impact**: High
- **Mitigation**: 
  - Aggressive caching (15-30 min TTL)
  - Graceful fallback to local comments
  - Monitoring and alerts
  - Stale-while-revalidate pattern

**Risk 2: Performance Degradation**
- **Probability**: Medium
- **Impact**: High
- **Mitigation**:
  - 5-second timeout
  - Server-side caching
  - SSR with cached data
  - CDN for static assets

**Risk 3: Security Vulnerability**
- **Probability**: Low
- **Impact**: Critical
- **Mitigation**:
  - Input sanitization (DOMPurify)
  - CSP enforcement
  - Regular security audits
  - No eval() or innerHTML

### Medium-Impact Risks

**Risk 4: Bad Reviews Displayed**
- **Probability**: Low
- **Impact**: Medium
- **Mitigation**:
  - Clinect handles review moderation
  - Minimum score threshold (65/100)
  - Practice can disable anytime
  - Warning message in admin UI

**Risk 5: Incorrect Practice Slug**
- **Probability**: Medium
- **Impact**: Low
- **Mitigation**:
  - Test connection button
  - Clear validation messages
  - Fallback to local comments
  - Admin can update anytime

---

## Future Enhancements

### Phase 2 (Post-MVP)

- [ ] **Admin Analytics Dashboard**
  - View rating trends over time
  - Compare to other practices
  - Export review data

- [ ] **Multi-Platform Aggregation**
  - Combine Clinect + Google Reviews
  - Unified average rating
  - Cross-platform review display

- [ ] **Advanced Configuration**
  - Per-template display options
  - Custom star colors
  - Review filtering (min rating)

- [ ] **Automated Slug Discovery**
  - Lookup slug by practice name
  - Bulk import for multiple practices
  - Auto-suggest from Clinect API

- [ ] **Review Response Integration**
  - Practice can reply to reviews
  - Display responses in carousel
  - Integration with Clinect response API

- [ ] **Rich Snippets / Schema.org**
  - Add structured data markup
  - Improve SEO with review rich snippets
  - AggregateRating schema

---

## Dependencies

### External Dependencies

- Clinect API: `https://api2.clinectsurvey.com/stats/`
- Group ID: `bendcare`
- Practice slugs provided by Clinect

### Internal Dependencies

- Existing cache system: `lib/cache/redis-cache.ts`
- Existing logging: `lib/logger/index.ts`
- Existing API wrappers: `lib/api/route-handlers`
- Existing practice attributes system

### Required npm Packages

```json
{
  "dependencies": {
    "isomorphic-dompurify": "^2.13.0"
  }
}
```

All other functionality uses existing dependencies (Next.js, React, etc.)

---

## Success Metrics

### Adoption Metrics

- **Target**: 30% of practices enable ratings within 3 months
- **Measurement**: Count of `ratings_feed_enabled=true` practices

### Performance Metrics

- **API Success Rate**: >99%
- **API Latency**: p95 <2 seconds
- **Cache Hit Rate**: >80%
- **Page Load Impact**: <200ms average

### User Satisfaction

- **Support Tickets**: <5 per month
- **Feature Requests**: Track enhancement ideas
- **Net Promoter Score**: Survey practices quarterly

### Business Impact

- **SEO Improvement**: Track organic traffic to practice pages
- **Conversion Rate**: Monitor appointment requests
- **Trust Signals**: Measure time-on-page and bounce rate

---

## Contact & Support

**Engineering Lead**: TBD  
**Product Owner**: TBD  
**Clinect Contact**: TBD  

**Support Channels**:
- Internal: `#clinect-integration` Slack channel
- External: `support@bendcare.com`
- Documentation: `/docs/admin/clinect-ratings-setup.md`

---

## Document History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-01-13 | 1.0 | Claude | Initial implementation plan |

---

**End of Document**

