/**
 * Request/Response Size and Timing Metrics
 * Comprehensive performance monitoring for API endpoints
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAppLogger } from './winston-logger'

const metricsLogger = createAppLogger('metrics')

interface RequestMetrics {
  requestId: string
  method: string
  path: string
  startTime: number
  requestSize: number
  userAgent?: string
  ipAddress?: string
  userId?: string
}

interface ResponseMetrics extends RequestMetrics {
  statusCode: number
  responseSize: number
  duration: number
  errorType?: string
}

/**
 * Request metrics collector
 */
export class RequestMetricsCollector {
  private activeRequests = new Map<string, RequestMetrics>()

  /**
   * Start tracking a request
   */
  startRequest(request: NextRequest, userId?: string): string {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const url = new URL(request.url)
    
    const metrics: RequestMetrics = {
      requestId,
      method: request.method,
      path: url.pathname,
      startTime: Date.now(),
      requestSize: this.getRequestSize(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
      ipAddress: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown',
      userId: userId ?? undefined
    }

    this.activeRequests.set(requestId, metrics)
    
    metricsLogger.debug('Request tracking started', {
      requestId,
      method: metrics.method,
      path: metrics.path,
      requestSize: metrics.requestSize,
      userId: metrics.userId
    })

    return requestId
  }

  /**
   * Complete request tracking
   */
  completeRequest(
    requestId: string, 
    response: NextResponse | Response, 
    error?: Error
  ): ResponseMetrics | null {
    const requestMetrics = this.activeRequests.get(requestId)
    if (!requestMetrics) {
      metricsLogger.warn('Request metrics not found', { requestId })
      return null
    }

    this.activeRequests.delete(requestId)

    const responseMetrics: ResponseMetrics = {
      ...requestMetrics,
      statusCode: response.status,
      responseSize: this.getResponseSize(response),
      duration: Date.now() - requestMetrics.startTime,
      errorType: error ? error.constructor.name ?? undefined : undefined
    }

    // Log metrics based on performance and status
    this.logResponseMetrics(responseMetrics)
    
    return responseMetrics
  }

  /**
   * Log response metrics with appropriate level
   */
  private logResponseMetrics(metrics: ResponseMetrics): void {
    const level = metrics.statusCode >= 500 ? 'error' :
                  metrics.statusCode >= 400 ? 'warn' :
                  metrics.duration > 2000 ? 'warn' :
                  metrics.duration > 1000 ? 'info' : 'debug'

    const logData = {
      requestId: metrics.requestId,
      method: metrics.method,
      path: metrics.path,
      statusCode: metrics.statusCode,
      duration: metrics.duration,
      requestSize: metrics.requestSize,
      responseSize: metrics.responseSize,
      userId: metrics.userId,
      slow: metrics.duration > 1000,
      errorType: metrics.errorType,
      // Performance classification
      performance: metrics.duration < 100 ? 'excellent' :
                   metrics.duration < 500 ? 'good' :
                   metrics.duration < 1000 ? 'acceptable' :
                   metrics.duration < 2000 ? 'slow' : 'very_slow'
    }

    metricsLogger[level]('Request completed', logData)

    // Log slow requests with additional detail
    if (metrics.duration > 1000) {
      metricsLogger.warn('Slow request detected', {
        ...logData,
        threshold: '1000ms',
        recommendation: metrics.duration > 2000 ? 'investigate_immediately' : 'monitor_closely'
      })
    }

    // Log large requests/responses
    if (metrics.requestSize > 1024 * 1024) { // 1MB
      metricsLogger.info('Large request detected', {
        requestId: metrics.requestId,
        path: metrics.path,
        requestSize: metrics.requestSize,
        sizeMB: Math.round(metrics.requestSize / 1024 / 1024)
      })
    }

    if (metrics.responseSize > 1024 * 1024) { // 1MB
      metricsLogger.info('Large response detected', {
        requestId: metrics.requestId,
        path: metrics.path,
        responseSize: metrics.responseSize,
        sizeMB: Math.round(metrics.responseSize / 1024 / 1024)
      })
    }
  }

  /**
   * Get request size in bytes
   */
  private getRequestSize(request: NextRequest): number {
    const contentLength = request.headers.get('content-length')
    return contentLength ? parseInt(contentLength, 10) : 0
  }

  /**
   * Get response size in bytes
   */
  private getResponseSize(response: NextResponse | Response): number {
    const contentLength = response.headers.get('content-length')
    if (contentLength) {
      return parseInt(contentLength, 10)
    }

    // Estimate size from response body if available
    if ('body' in response && response.body) {
      try {
        const text = response.body.toString()
        return new Blob([text]).size
      } catch {
        return 0
      }
    }

    return 0
  }

  /**
   * Get active requests count
   */
  getActiveRequestsCount(): number {
    return this.activeRequests.size
  }

  /**
   * Get active requests summary
   */
  getActiveRequestsSummary(): Array<{
    requestId: string
    method: string
    path: string
    duration: number
    userId?: string
  }> {
    const now = Date.now()
    return Array.from(this.activeRequests.values()).map(req => ({
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      duration: now - req.startTime,
      userId: req.userId
    }))
  }

  /**
   * Clean up stale requests (older than 30 seconds)
   */
  cleanupStaleRequests(): void {
    const now = Date.now()
    const staleThreshold = 30 * 1000 // 30 seconds

    for (const [requestId, metrics] of Array.from(this.activeRequests.entries())) {
      if (now - metrics.startTime > staleThreshold) {
        metricsLogger.warn('Stale request detected and cleaned up', {
          requestId,
          method: metrics.method,
          path: metrics.path,
          duration: now - metrics.startTime,
          userId: metrics.userId
        })
        
        this.activeRequests.delete(requestId)
      }
    }
  }
}

// Singleton instance
const requestMetrics = new RequestMetricsCollector()

// Cleanup stale requests every minute
setInterval(() => {
  requestMetrics.cleanupStaleRequests()
}, 60 * 1000)

/**
 * Middleware for automatic request/response metrics
 */
export function withRequestMetrics<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const requestId = requestMetrics.startRequest(request)
    
    try {
      const response = await handler(request, ...args)
      requestMetrics.completeRequest(requestId, response)
      
      // Add request ID to response headers for tracing
      response.headers.set('x-request-id', requestId)
      
      return response
    } catch (error) {
      // Create error response and log metrics
      const errorResponse = new NextResponse(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      )
      
      requestMetrics.completeRequest(requestId, errorResponse, error as Error)
      
      throw error
    }
  }
}

/**
 * Performance metrics aggregation
 */
export class PerformanceAggregator {
  private metrics: ResponseMetrics[] = []
  private readonly maxMetrics = 1000 // Keep last 1000 requests

  addMetrics(metrics: ResponseMetrics): void {
    this.metrics.push(metrics)
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics)
    }
  }

  getAggregatedMetrics(timeWindowMs: number = 5 * 60 * 1000): {
    totalRequests: number
    averageResponseTime: number
    p95ResponseTime: number
    p99ResponseTime: number
    errorRate: number
    slowRequestRate: number
    averageRequestSize: number
    averageResponseSize: number
  } {
    const now = Date.now()
    const recentMetrics = this.metrics.filter(m => 
      now - m.startTime <= timeWindowMs
    )

    if (recentMetrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        slowRequestRate: 0,
        averageRequestSize: 0,
        averageResponseSize: 0
      }
    }

    const sortedDurations = recentMetrics
      .map(m => m.duration)
      .sort((a, b) => a - b)

    const errors = recentMetrics.filter(m => m.statusCode >= 400).length
    const slowRequests = recentMetrics.filter(m => m.duration > 1000).length

    return {
      totalRequests: recentMetrics.length,
      averageResponseTime: Math.round(
        recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
      ),
      p95ResponseTime: sortedDurations[Math.floor(sortedDurations.length * 0.95)] || 0,
      p99ResponseTime: sortedDurations[Math.floor(sortedDurations.length * 0.99)] || 0,
      errorRate: errors / recentMetrics.length,
      slowRequestRate: slowRequests / recentMetrics.length,
      averageRequestSize: Math.round(
        recentMetrics.reduce((sum, m) => sum + m.requestSize, 0) / recentMetrics.length
      ),
      averageResponseSize: Math.round(
        recentMetrics.reduce((sum, m) => sum + m.responseSize, 0) / recentMetrics.length
      )
    }
  }
}

export const performanceAggregator = new PerformanceAggregator()
export { requestMetrics }
export default RequestMetricsCollector
