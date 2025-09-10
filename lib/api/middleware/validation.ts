import { z } from 'zod'
import { ValidationError } from '../responses/error'

export async function validateRequest<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await request.json()
    const validatedData = schema.parse(body)
    return validatedData
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw ValidationError(error.errors)
    }
    throw ValidationError(null, 'Invalid request body')
  }
}

export function validateQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): T {
  try {
    const queryObject = Object.fromEntries(searchParams.entries())
    return schema.parse(queryObject)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw ValidationError(error.errors)
    }
    throw ValidationError(null, 'Invalid query parameters')
  }
}

export function validateParams<T>(
  params: Record<string, string>,
  schema: z.ZodSchema<T>
): T {
  try {
    return schema.parse(params)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw ValidationError(error.errors)
    }
    throw ValidationError(null, 'Invalid route parameters')
  }
}
