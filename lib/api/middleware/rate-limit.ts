import { RateLimitError } from '../responses/error'

interface RateLimitEntry {
  count: number
  resetTime: number
}

class InMemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>()
  private windowMs: number
  private maxRequests: number
  
  constructor(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
    
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }
  
  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of Array.from(this.store.entries())) {
      if (now > entry.resetTime) {
        this.store.delete(key)
      }
    }
  }
  
  checkLimit(identifier: string): { success: boolean; remaining: number; resetTime: number } {
    const now = Date.now()
    const resetTime = now + this.windowMs
    const existing = this.store.get(identifier)
    
    if (!existing || now > existing.resetTime) {
      this.store.set(identifier, { count: 1, resetTime })
      return { success: true, remaining: this.maxRequests - 1, resetTime }
    }
    
    existing.count++
    const remaining = Math.max(0, this.maxRequests - existing.count)
    
    return {
      success: existing.count <= this.maxRequests,
      remaining,
      resetTime: existing.resetTime
    }
  }
}

// Rate limiter instances
export const globalRateLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 100) // 100 req/15min
export const authRateLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 5)     // 5 req/15min
export const apiRateLimiter = new InMemoryRateLimiter(60 * 1000, 30)          // 30 req/min

export function getRateLimitKey(request: Request, prefix = ''): string {
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'anonymous'
  return prefix ? `${prefix}:${ip}` : ip
}

export async function applyRateLimit(
  request: Request,
  type: 'auth' | 'api' | 'upload' = 'api'
): Promise<{ success: boolean; remaining: number; resetTime: number; limit: number; windowMs: number }> {
  const rateLimitKey = getRateLimitKey(request, type)
  let limiter = apiRateLimiter
  let limit = 30
  let windowMs = 60 * 1000
  
  switch (type) {
    case 'auth':
      limiter = authRateLimiter
      limit = 5
      windowMs = 15 * 60 * 1000
      break
    case 'upload':
      limiter = new InMemoryRateLimiter(60 * 1000, 10) // 10 uploads per minute
      limit = 10
      windowMs = 60 * 1000
      break
    case 'api':
      limit = 30
      windowMs = 60 * 1000
      break
  }
  
  const result = limiter.checkLimit(rateLimitKey)
  
  if (!result.success) {
    const error = RateLimitError(result.resetTime)
    // Add additional context to the error
    error.details = {
      limit,
      windowMs,
      resetTime: result.resetTime,
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      type
    }
    throw error
  }
  
  return {
    ...result,
    limit,
    windowMs
  }
}

export function addRateLimitHeaders(
  response: Response, 
  result: { remaining: number; resetTime: number; limit?: number; windowMs?: number }
): void {
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString())
  
  if (result.limit !== undefined) {
    response.headers.set('X-RateLimit-Limit', result.limit.toString())
  }
  
  if (result.windowMs !== undefined) {
    response.headers.set('X-RateLimit-Window', Math.ceil(result.windowMs / 1000).toString())
  }
  
  response.headers.set('X-RateLimit-Policy', 'sliding-window')
  
  // Add retry-after header if rate limited
  if (result.remaining === 0) {
    const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000)
    response.headers.set('Retry-After', Math.max(1, retryAfter).toString())
  }
}
