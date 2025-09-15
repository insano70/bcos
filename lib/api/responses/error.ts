export interface ErrorResponse {
  success: false
  error: string
  code?: string
  details?: unknown
  meta: {
    timestamp: string
    path?: string
  }
}

export class APIError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'APIError'
  }
}

export function createErrorResponse(
  error: string | Error | APIError,
  statusCode: number = 500,
  request?: Request
): Response {
  let errorMessage: string
  let errorCode: string | undefined
  let errorDetails: unknown
  let finalStatusCode = statusCode

  if (error && typeof error === 'object' && 'name' in error && error.name === 'APIError') {
    const apiError = error as APIError;
    errorMessage = apiError.message
    finalStatusCode = apiError.statusCode
    errorCode = apiError.code
    errorDetails = apiError.details
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = String(error.message)
  } else if (typeof error === 'string') {
    errorMessage = error
  } else {
    errorMessage = 'Unknown error'
  }

  const response: ErrorResponse = {
    success: false,
    error: errorMessage,
    code: errorCode || 'INTERNAL_ERROR',
    details: errorDetails,
    meta: {
      timestamp: new Date().toISOString(),
      ...(request?.url && { path: request.url })
    }
  }

  return Response.json(response, { status: finalStatusCode })
}

// Predefined error types for common scenarios
export const AuthenticationError = (message = 'Authentication required') => 
  new APIError(message, 401, 'AUTHENTICATION_REQUIRED')

export const AuthorizationError = (message = 'Insufficient permissions') => 
  new APIError(message, 403, 'INSUFFICIENT_PERMISSIONS')

export const ValidationError = (details: unknown, message = 'Validation failed') => 
  new APIError(message, 400, 'VALIDATION_ERROR', details)

export const NotFoundError = (resource = 'Resource') => 
  new APIError(`${resource} not found`, 404, 'RESOURCE_NOT_FOUND')

export const ConflictError = (message = 'Resource already exists') => 
  new APIError(message, 409, 'RESOURCE_CONFLICT')

export const RateLimitError = (resetTime?: number) => 
  new APIError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED', { resetTime })
