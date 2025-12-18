"use strict";
/**
 * API Response Types
 *
 * Discriminated union types for API responses.
 * Provides type-safe response handling with exhaustive pattern matching.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSuccessResponse = isSuccessResponse;
exports.isErrorResponse = isErrorResponse;
exports.createSuccessPayload = createSuccessPayload;
exports.createErrorPayload = createErrorPayload;
exports.assertSuccess = assertSuccess;
exports.unwrapResponse = unwrapResponse;
exports.mapResponse = mapResponse;
/**
 * Type guard to check if response is successful
 */
function isSuccessResponse(response) {
    return response.success === true;
}
/**
 * Type guard to check if response is an error
 */
function isErrorResponse(response) {
    return response.success === false;
}
// =============================================================================
// Response Builder Helpers
// =============================================================================
/**
 * Create a success response payload
 */
function createSuccessPayload(data, options) {
    return __assign(__assign({ success: true, data: data }, ((options === null || options === void 0 ? void 0 : options.message) && { message: options.message })), { meta: __assign(__assign({ timestamp: new Date().toISOString() }, ((options === null || options === void 0 ? void 0 : options.requestId) && { requestId: options.requestId })), ((options === null || options === void 0 ? void 0 : options.pagination) && { pagination: options.pagination })) });
}
/**
 * Create an error response payload
 */
function createErrorPayload(message, code, options) {
    return {
        success: false,
        error: __assign({ message: message, code: code }, ((options === null || options === void 0 ? void 0 : options.details) && { details: options.details })),
        meta: __assign(__assign({ timestamp: new Date().toISOString() }, ((options === null || options === void 0 ? void 0 : options.path) && { path: options.path })), ((options === null || options === void 0 ? void 0 : options.requestId) && { requestId: options.requestId })),
    };
}
// =============================================================================
// Response Assertion Helpers
// =============================================================================
/**
 * Assert response is successful and return data
 * Throws if response is an error
 */
function assertSuccess(response) {
    if (!isSuccessResponse(response)) {
        throw new Error(response.error.message);
    }
    return response.data;
}
/**
 * Unwrap response data, returning undefined on error
 */
function unwrapResponse(response) {
    return isSuccessResponse(response) ? response.data : undefined;
}
/**
 * Map success response data
 */
function mapResponse(response, mapper) {
    if (isSuccessResponse(response)) {
        return __assign(__assign({}, response), { data: mapper(response.data) });
    }
    return response;
}
