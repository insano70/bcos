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
export const authRateLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 20)    // 20 req/15min (increased for refresh tokens)
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
) {
  const rateLimitKey = getRateLimitKey(request, type)
  let limiter = apiRateLimiter
  
  switch (type) {
    case 'auth':
      limiter = authRateLimiter
      break
    case 'upload':
      limiter = new InMemoryRateLimiter(60 * 1000, 10) // 10 uploads per minute
      break
  }
  
  const result = limiter.checkLimit(rateLimitKey)
  
  if (!result.success) {
    throw RateLimitError(result.resetTime)
  }
  
  return result
}

export function addRateLimitHeaders(response: Response, result: { remaining: number; resetTime: number }): void {
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString())
}
