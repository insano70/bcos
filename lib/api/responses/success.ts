export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    timestamp: string;
  };
}

export function createSuccessResponse<T>(
  data: T,
  message?: string,
  meta?: Partial<SuccessResponse<T>['meta']>,
  status = 200
): Response {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };

  return Response.json(response, { status });
}

export function createPaginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number }
): Response {
  return createSuccessResponse(data, undefined, {
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  });
}
