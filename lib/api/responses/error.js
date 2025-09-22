"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.RateLimitError = exports.ConflictError = exports.NotFoundError = exports.ValidationError = exports.AuthorizationError = exports.AuthenticationError = exports.APIError = void 0;
exports.createErrorResponse = createErrorResponse;
var APIError = /** @class */ (function (_super) {
    __extends(APIError, _super);
    function APIError(message, statusCode, code, details) {
        if (statusCode === void 0) { statusCode = 500; }
        var _this = _super.call(this, message) || this;
        _this.message = message;
        _this.statusCode = statusCode;
        _this.code = code;
        _this.details = details;
        _this.name = 'APIError';
        return _this;
    }
    return APIError;
}(Error));
exports.APIError = APIError;
function createErrorResponse(error, statusCode, request) {
    if (statusCode === void 0) { statusCode = 500; }
    var errorMessage;
    var errorCode;
    var errorDetails;
    var finalStatusCode = statusCode;
    if (error && typeof error === 'object' && 'name' in error && error.name === 'APIError') {
        var apiError = error;
        errorMessage = apiError.message;
        finalStatusCode = apiError.statusCode;
        errorCode = apiError.code;
        errorDetails = apiError.details;
    }
    else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
    }
    else if (typeof error === 'string') {
        errorMessage = error;
    }
    else {
        errorMessage = 'Unknown error';
    }
    var response = {
        success: false,
        error: errorMessage,
        code: errorCode || 'INTERNAL_ERROR',
        details: errorDetails,
        meta: __assign({ timestamp: new Date().toISOString() }, ((request === null || request === void 0 ? void 0 : request.url) && { path: request.url }))
    };
    return Response.json(response, { status: finalStatusCode });
}
// Predefined error types for common scenarios
var AuthenticationError = function (message) {
    if (message === void 0) { message = 'Authentication required'; }
    return new APIError(message, 401, 'AUTHENTICATION_REQUIRED');
};
exports.AuthenticationError = AuthenticationError;
var AuthorizationError = function (message) {
    if (message === void 0) { message = 'Insufficient permissions'; }
    return new APIError(message, 403, 'INSUFFICIENT_PERMISSIONS');
};
exports.AuthorizationError = AuthorizationError;
var ValidationError = function (details, message) {
    if (message === void 0) { message = 'Validation failed'; }
    return new APIError(message, 400, 'VALIDATION_ERROR', details);
};
exports.ValidationError = ValidationError;
var NotFoundError = function (resource) {
    if (resource === void 0) { resource = 'Resource'; }
    return new APIError("".concat(resource, " not found"), 404, 'RESOURCE_NOT_FOUND');
};
exports.NotFoundError = NotFoundError;
var ConflictError = function (message) {
    if (message === void 0) { message = 'Resource already exists'; }
    return new APIError(message, 409, 'RESOURCE_CONFLICT');
};
exports.ConflictError = ConflictError;
var RateLimitError = function (resetTime) {
    return new APIError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED', { resetTime: resetTime });
};
exports.RateLimitError = RateLimitError;
