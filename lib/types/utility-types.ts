/**
 * Utility Types
 *
 * Reusable utility types for common patterns across the application.
 * These types help maintain consistency and reduce code duplication.
 */

// =============================================================================
// Nullable Types for Database Values
// =============================================================================

/**
 * Database nullable type - represents a value that can be null in the database
 * Use this for fields that allow NULL in the database schema
 *
 * @example
 * interface User {
 *   id: string;
 *   email: string;
 *   phone: DBNullable<string>; // Can be null in DB
 * }
 */
export type DBNullable<T> = T | null;

/**
 * Optional database value - can be null or undefined
 * Use for values that may not be present in partial updates
 *
 * @example
 * interface UpdateUserInput {
 *   name?: DBOptional<string>;
 *   phone?: DBOptional<string>; // Can explicitly set to null
 * }
 */
export type DBOptional<T> = T | null | undefined;

/**
 * Non-null database value - explicitly marks a field as NOT NULL
 * Use for documentation purposes in database type definitions
 */
export type DBNotNull<T> = NonNullable<T>;

/**
 * Make all properties of T database nullable
 *
 * @example
 * type PartialUser = AllDBNullable<User>;
 */
export type AllDBNullable<T> = {
  [P in keyof T]: DBNullable<T[P]>;
};

/**
 * Make specific properties of T database nullable
 *
 * @example
 * type UserWithOptionalPhone = SomeDBNullable<User, 'phone' | 'address'>;
 */
export type SomeDBNullable<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: DBNullable<T[P]>;
};

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  success: true;
}

/**
 * Standard API error response
 */
export interface ApiError {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: Record<string, string>;
  };
}

/**
 * API response that can be success or error
 */
export type ApiResult<T> = ApiResponse<T> | ApiError;

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * List response with optional metadata
 */
export interface ListResponse<T> {
  items: T[];
  total: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Object Manipulation Types
// =============================================================================

/**
 * Make all properties of T required and non-nullable
 */
export type Complete<T> = {
  [P in keyof T]-?: NonNullable<T[P]>;
};

/**
 * Make specific properties of T required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific properties of T optional
 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Pick properties of T that are assignable to U
 */
export type PickByType<T, U> = {
  [P in keyof T as T[P] extends U ? P : never]: T[P];
};

/**
 * Omit properties of T that are assignable to U
 */
export type OmitByType<T, U> = {
  [P in keyof T as T[P] extends U ? never : P]: T[P];
};

/**
 * Make all nested properties of T partial
 */
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * Make all nested properties of T required
 */
export type DeepRequired<T> = T extends object
  ? {
      [P in keyof T]-?: DeepRequired<T[P]>;
    }
  : T;

/**
 * Make all nested properties of T readonly
 */
export type DeepReadonly<T> = T extends object
  ? {
      readonly [P in keyof T]: DeepReadonly<T[P]>;
    }
  : T;

// =============================================================================
// Function Types
// =============================================================================

/**
 * Extract the first parameter type of a function
 */
export type FirstParam<T extends (...args: never[]) => unknown> = T extends (
  first: infer P,
  ...rest: never[]
) => unknown
  ? P
  : never;

/**
 * Extract all parameter types of a function as a tuple
 */
export type Params<T extends (...args: never[]) => unknown> = T extends (...args: infer P) => unknown
  ? P
  : never;

/**
 * Make a function async (wrap return type in Promise)
 */
export type Async<T extends (...args: never[]) => unknown> = (
  ...args: Parameters<T>
) => Promise<ReturnType<T>>;

// =============================================================================
// String Types
// =============================================================================

/**
 * Branded string type for type-safe string IDs
 * Use to create distinct types for different ID formats
 *
 * @example
 * type UserId = Brand<string, 'UserId'>;
 * type OrganizationId = Brand<string, 'OrganizationId'>;
 *
 * function getUser(id: UserId) { ... }
 * getUser('abc'); // Error: string is not assignable to UserId
 * getUser('abc' as UserId); // OK
 */
export type Brand<T, B> = T & { __brand: B };

/**
 * UUID branded type
 */
export type UUID = Brand<string, 'UUID'>;

/**
 * Email branded type
 */
export type Email = Brand<string, 'Email'>;

/**
 * ISO date string branded type
 */
export type ISODateString = Brand<string, 'ISODateString'>;

/**
 * Positive integer branded type (for database IDs)
 */
export type PositiveInt = Brand<number, 'PositiveInt'>;

/**
 * Non-empty string branded type
 */
export type NonEmptyString = Brand<string, 'NonEmptyString'>;

/**
 * URL branded type
 */
export type URLString = Brand<string, 'URLString'>;

// =============================================================================
// Branded Type Validators and Factories
// =============================================================================

/** UUID v4 regex pattern */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Email regex pattern (RFC 5322 simplified) */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ISO 8601 date string pattern */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Type guard to check if a string is a valid UUID
 */
export function isUUID(value: unknown): value is UUID {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Type guard to check if a string is a valid email
 */
export function isEmail(value: unknown): value is Email {
  return typeof value === 'string' && EMAIL_REGEX.test(value);
}

/**
 * Type guard to check if a string is a valid ISO date string
 */
export function isISODateString(value: unknown): value is ISODateString {
  if (typeof value !== 'string') return false;
  if (!ISO_DATE_REGEX.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

/**
 * Type guard to check if a number is a positive integer
 */
export function isPositiveInt(value: unknown): value is PositiveInt {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Type guard to check if a string is non-empty
 */
export function isNonEmptyString(value: unknown): value is NonEmptyString {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Type guard to check if a string is a valid URL
 */
export function isURLString(value: unknown): value is URLString {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a UUID from a string (throws if invalid)
 */
export function toUUID(value: string): UUID {
  if (!isUUID(value)) {
    throw new Error(`Invalid UUID: ${value}`);
  }
  return value;
}

/**
 * Create an Email from a string (throws if invalid)
 */
export function toEmail(value: string): Email {
  if (!isEmail(value)) {
    throw new Error(`Invalid email: ${value}`);
  }
  return value;
}

/**
 * Create an ISODateString from a string or Date (throws if invalid)
 */
export function toISODateString(value: string | Date): ISODateString {
  const str = value instanceof Date ? value.toISOString() : value;
  if (!isISODateString(str)) {
    throw new Error(`Invalid ISO date string: ${value}`);
  }
  return str;
}

/**
 * Create a PositiveInt from a number (throws if invalid)
 */
export function toPositiveInt(value: number): PositiveInt {
  if (!isPositiveInt(value)) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return value;
}

/**
 * Try to create a UUID, returning undefined if invalid
 */
export function tryUUID(value: unknown): UUID | undefined {
  return isUUID(value) ? value : undefined;
}

/**
 * Try to create an Email, returning undefined if invalid
 */
export function tryEmail(value: unknown): Email | undefined {
  return isEmail(value) ? value : undefined;
}

/**
 * Try to create an ISODateString, returning undefined if invalid
 */
export function tryISODateString(value: unknown): ISODateString | undefined {
  if (value instanceof Date) {
    return value.toISOString() as ISODateString;
  }
  return isISODateString(value) ? value : undefined;
}

// =============================================================================
// Discriminated Union Helpers
// =============================================================================

/**
 * Extract union member by discriminant property
 *
 * @example
 * type Shape = { type: 'circle'; radius: number } | { type: 'square'; side: number };
 * type Circle = ExtractByType<Shape, 'type', 'circle'>; // { type: 'circle'; radius: number }
 */
export type ExtractByType<T, K extends keyof T, V extends T[K]> = T extends { [P in K]: V }
  ? T
  : never;

// =============================================================================
// Record/Object Types
// =============================================================================

/**
 * Strictly typed Object.keys
 */
export type KeysOf<T> = Array<keyof T>;

/**
 * Strictly typed Object.entries
 */
export type EntriesOf<T> = Array<[keyof T, T[keyof T]]>;

/**
 * Record with at least one property
 */
export type NonEmptyRecord<K extends string | number | symbol, V> = Record<K, V> & { [key: string]: V };

/**
 * Object with string keys and specific value type
 */
export type Dictionary<T> = Record<string, T>;

/**
 * Object that can have any string keys with unknown values
 * Safer alternative to `any` for dynamic objects
 */
export type AnyObject = Record<string, unknown>;

// =============================================================================
// Array Types
// =============================================================================

/**
 * Array with at least one element
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Array element type extractor
 */
export type ArrayElement<T> = T extends readonly (infer E)[] ? E : never;

/**
 * Tuple of exactly N elements of type T
 */
export type Tuple<T, N extends number, R extends T[] = []> = R['length'] extends N
  ? R
  : Tuple<T, N, [...R, T]>;

// =============================================================================
// Conditional Types
// =============================================================================

/**
 * If T is never, return U, otherwise return T
 */
export type IfNever<T, U> = [T] extends [never] ? U : T;

/**
 * If T is unknown, return U, otherwise return T
 */
export type IfUnknown<T, U> = unknown extends T ? U : T;

/**
 * If T is any, return U, otherwise return T
 */
export type IfAny<T, U> = 0 extends 1 & T ? U : T;

// =============================================================================
// JSON Types
// =============================================================================

/**
 * JSON-serializable primitive types
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON-serializable array type
 */
export type JsonArray = JsonValue[];

/**
 * JSON-serializable object type
 */
export type JsonObject = { [key: string]: JsonValue };

/**
 * Any JSON-serializable value
 */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

