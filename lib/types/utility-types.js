"use strict";
/**
 * Utility Types
 *
 * Reusable utility types for common patterns across the application.
 * These types help maintain consistency and reduce code duplication.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUUID = isUUID;
exports.isEmail = isEmail;
exports.isISODateString = isISODateString;
exports.isPositiveInt = isPositiveInt;
exports.isNonEmptyString = isNonEmptyString;
exports.isURLString = isURLString;
exports.toUUID = toUUID;
exports.toEmail = toEmail;
exports.toISODateString = toISODateString;
exports.toPositiveInt = toPositiveInt;
exports.tryUUID = tryUUID;
exports.tryEmail = tryEmail;
exports.tryISODateString = tryISODateString;
// =============================================================================
// Branded Type Validators and Factories
// =============================================================================
/** UUID v4 regex pattern */
var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Email regex pattern (RFC 5322 simplified) */
var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** ISO 8601 date string pattern */
var ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;
/**
 * Type guard to check if a string is a valid UUID
 */
function isUUID(value) {
    return typeof value === 'string' && UUID_REGEX.test(value);
}
/**
 * Type guard to check if a string is a valid email
 */
function isEmail(value) {
    return typeof value === 'string' && EMAIL_REGEX.test(value);
}
/**
 * Type guard to check if a string is a valid ISO date string
 */
function isISODateString(value) {
    if (typeof value !== 'string')
        return false;
    if (!ISO_DATE_REGEX.test(value))
        return false;
    var date = new Date(value);
    return !Number.isNaN(date.getTime());
}
/**
 * Type guard to check if a number is a positive integer
 */
function isPositiveInt(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
/**
 * Type guard to check if a string is non-empty
 */
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
/**
 * Type guard to check if a string is a valid URL
 */
function isURLString(value) {
    if (typeof value !== 'string')
        return false;
    try {
        new URL(value);
        return true;
    }
    catch (_a) {
        return false;
    }
}
/**
 * Create a UUID from a string (throws if invalid)
 */
function toUUID(value) {
    if (!isUUID(value)) {
        throw new Error("Invalid UUID: ".concat(value));
    }
    return value;
}
/**
 * Create an Email from a string (throws if invalid)
 */
function toEmail(value) {
    if (!isEmail(value)) {
        throw new Error("Invalid email: ".concat(value));
    }
    return value;
}
/**
 * Create an ISODateString from a string or Date (throws if invalid)
 */
function toISODateString(value) {
    var str = value instanceof Date ? value.toISOString() : value;
    if (!isISODateString(str)) {
        throw new Error("Invalid ISO date string: ".concat(value));
    }
    return str;
}
/**
 * Create a PositiveInt from a number (throws if invalid)
 */
function toPositiveInt(value) {
    if (!isPositiveInt(value)) {
        throw new Error("Invalid positive integer: ".concat(value));
    }
    return value;
}
/**
 * Try to create a UUID, returning undefined if invalid
 */
function tryUUID(value) {
    return isUUID(value) ? value : undefined;
}
/**
 * Try to create an Email, returning undefined if invalid
 */
function tryEmail(value) {
    return isEmail(value) ? value : undefined;
}
/**
 * Try to create an ISODateString, returning undefined if invalid
 */
function tryISODateString(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return isISODateString(value) ? value : undefined;
}
