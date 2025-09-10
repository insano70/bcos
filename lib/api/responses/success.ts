export interface SuccessResponse<T = any> {
  success: true
  data: T
  message?: string
  meta?: {
    pagination?: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
    timestamp: string
  }
}

export function createSuccessResponse<T>(
  data: T,
  message?: string,
  meta?: Partial<SuccessResponse<T>['meta']>
): Response {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    message,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  }
  
  return Response.json(response)
}

export function createPaginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number }
): Response {
  return createSuccessResponse(data, undefined, {
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit)
    }
  })
}
