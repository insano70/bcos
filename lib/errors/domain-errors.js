"use strict";
/**
 * Domain Error Classes
 *
 * Typed error classes for domain-specific errors.
 * Provides better error handling and type safety compared to generic Error.
 */
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
exports.ServiceUnavailableError = exports.ExternalServiceError = exports.DatabaseError = exports.InternalError = exports.RateLimitExceededError = exports.ResourceLockedError = exports.ConflictError = exports.NotFoundError = exports.ValidationError = exports.ForbiddenError = exports.PermissionDeniedError = exports.TokenInvalidError = exports.TokenExpiredError = exports.InvalidCredentialsError = exports.AuthenticationRequiredError = exports.DomainError = void 0;
exports.isDomainError = isDomainError;
exports.isAuthError = isAuthError;
exports.isAuthorizationError = isAuthorizationError;
exports.isValidationError = isValidationError;
exports.isNotFoundError = isNotFoundError;
exports.wrapError = wrapError;
exports.assertExists = assertExists;
exports.assertPermission = assertPermission;
// =============================================================================
// Base Error Class
// =============================================================================
/**
 * Base error class for all domain errors
 * Extends Error with additional typed properties
 */
var DomainError = /** @class */ (function (_super) {
    __extends(DomainError, _super);
    function DomainError(message, details) {
        var _this = _super.call(this, message) || this;
        _this.details = details;
        /** Whether this error should be logged at error level */
        _this.shouldLog = true;
        _this.name = _this.constructor.name;
        Error.captureStackTrace(_this, _this.constructor);
        return _this;
    }
    /**
     * Convert error to JSON-serializable object
     */
    DomainError.prototype.toJSON = function () {
        return __assign({ name: this.name, message: this.message, code: this.code, statusCode: this.statusCode }, (this.details && { details: this.details }));
    };
    return DomainError;
}(Error));
exports.DomainError = DomainError;
// =============================================================================
// Authentication Errors (401)
// =============================================================================
/**
 * Authentication required error
 */
var AuthenticationRequiredError = /** @class */ (function (_super) {
    __extends(AuthenticationRequiredError, _super);
    function AuthenticationRequiredError(message, details) {
        if (message === void 0) { message = 'Authentication required'; }
        var _this = _super.call(this, message, details) || this;
        _this.statusCode = 401;
        _this.code = 'AUTHENTICATION_REQUIRED';
        return _this;
    }
    return AuthenticationRequiredError;
}(DomainError));
exports.AuthenticationRequiredError = AuthenticationRequiredError;
/**
 * Invalid credentials error
 */
var InvalidCredentialsError = /** @class */ (function (_super) {
    __extends(InvalidCredentialsError, _super);
    function InvalidCredentialsError(message, details) {
        if (message === void 0) { message = 'Invalid credentials'; }
        var _this = _super.call(this, message, details) || this;
        _this.statusCode = 401;
        _this.code = 'INVALID_CREDENTIALS';
        _this.shouldLog = false; // Don't log failed login attempts at error level
        return _this;
    }
    return InvalidCredentialsError;
}(DomainError));
exports.InvalidCredentialsError = InvalidCredentialsError;
/**
 * Token expired error
 */
var TokenExpiredError = /** @class */ (function (_super) {
    __extends(TokenExpiredError, _super);
    function TokenExpiredError(message, details) {
        if (message === void 0) { message = 'Token has expired'; }
        var _this = _super.call(this, message, details) || this;
        _this.statusCode = 401;
        _this.code = 'TOKEN_EXPIRED';
        _this.shouldLog = false;
        return _this;
    }
    return TokenExpiredError;
}(DomainError));
exports.TokenExpiredError = TokenExpiredError;
/**
 * Invalid token error
 */
var TokenInvalidError = /** @class */ (function (_super) {
    __extends(TokenInvalidError, _super);
    function TokenInvalidError(message, details) {
        if (message === void 0) { message = 'Token is invalid'; }
        var _this = _super.call(this, message, details) || this;
        _this.statusCode = 401;
        _this.code = 'TOKEN_INVALID';
        return _this;
    }
    return TokenInvalidError;
}(DomainError));
exports.TokenInvalidError = TokenInvalidError;
// =============================================================================
// Authorization Errors (403)
// =============================================================================
/**
 * Permission denied error
 */
var PermissionDeniedError = /** @class */ (function (_super) {
    __extends(PermissionDeniedError, _super);
    function PermissionDeniedError(message, requiredPermission, details) {
        if (message === void 0) { message = 'Insufficient permissions'; }
        var _this = _super.call(this, message, __assign(__assign({}, details), { requiredPermission: requiredPermission })) || this;
        _this.requiredPermission = requiredPermission;
        _this.statusCode = 403;
        _this.code = 'INSUFFICIENT_PERMISSIONS';
        return _this;
    }
    return PermissionDeniedError;
}(DomainError));
exports.PermissionDeniedError = PermissionDeniedError;
/**
 * Forbidden resource error
 */
var ForbiddenError = /** @class */ (function (_super) {
    __extends(ForbiddenError, _super);
    function ForbiddenError(message, details) {
        if (message === void 0) { message = 'Access forbidden'; }
        var _this = _super.call(this, message, details) || this;
        _this.statusCode = 403;
        _this.code = 'FORBIDDEN';
        return _this;
    }
    return ForbiddenError;
}(DomainError));
exports.ForbiddenError = ForbiddenError;
/**
 * Validation error
 */
var ValidationError = /** @class */ (function (_super) {
    __extends(ValidationError, _super);
    function ValidationError(message, fieldErrors, details) {
        if (message === void 0) { message = 'Validation failed'; }
        if (fieldErrors === void 0) { fieldErrors = []; }
        var _this = _super.call(this, message, __assign(__assign({}, details), { fieldErrors: fieldErrors })) || this;
        _this.fieldErrors = fieldErrors;
        _this.statusCode = 400;
        _this.code = 'VALIDATION_ERROR';
        return _this;
    }
    /**
     * Create from a single field error
     */
    ValidationError.forField = function (field, message, code) {
        return new ValidationError('Validation failed', [{ field: field, message: message, code: code }]);
    };
    /**
     * Create from Zod validation result
     */
    ValidationError.fromZodError = function (zodError) {
        var fieldErrors = zodError.errors.map(function (e) { return ({
            field: e.path.join('.'),
            message: e.message,
        }); });
        return new ValidationError('Validation failed', fieldErrors);
    };
    return ValidationError;
}(DomainError));
exports.ValidationError = ValidationError;
// =============================================================================
// Not Found Errors (404)
// =============================================================================
/**
 * Resource not found error
 */
var NotFoundError = /** @class */ (function (_super) {
    __extends(NotFoundError, _super);
    function NotFoundError(resourceType, resourceId, details) {
        var _this = this;
        var message = resourceId
            ? "".concat(resourceType, " with ID '").concat(resourceId, "' not found")
            : "".concat(resourceType, " not found");
        _this = _super.call(this, message, __assign(__assign({}, details), { resourceType: resourceType, resourceId: resourceId })) || this;
        _this.resourceType = resourceType;
        _this.resourceId = resourceId;
        _this.statusCode = 404;
        _this.code = 'RESOURCE_NOT_FOUND';
        return _this;
    }
    return NotFoundError;
}(DomainError));
exports.NotFoundError = NotFoundError;
// =============================================================================
// Conflict Errors (409)
// =============================================================================
/**
 * Resource conflict error (duplicate, etc.)
 */
var ConflictError = /** @class */ (function (_super) {
    __extends(ConflictError, _super);
    function ConflictError(message, conflictType, details) {
        if (message === void 0) { message = 'Resource conflict'; }
        var _this = _super.call(this, message, __assign(__assign({}, details), { conflictType: conflictType })) || this;
        _this.conflictType = conflictType;
        _this.statusCode = 409;
        _this.code = 'RESOURCE_CONFLICT';
        return _this;
    }
    /**
     * Create for duplicate resource
     */
    ConflictError.duplicate = function (resourceType, field, value) {
        return new ConflictError("".concat(resourceType, " with ").concat(field, " '").concat(value, "' already exists"), 'duplicate', { resourceType: resourceType, field: field, value: value });
    };
    return ConflictError;
}(DomainError));
exports.ConflictError = ConflictError;
/**
 * Resource locked error
 */
var ResourceLockedError = /** @class */ (function (_super) {
    __extends(ResourceLockedError, _super);
    function ResourceLockedError(resourceType, resourceId, lockedBy, details) {
        var _this = _super.call(this, "".concat(resourceType, " is locked"), __assign(__assign({}, details), { resourceType: resourceType, resourceId: resourceId, lockedBy: lockedBy })) || this;
        _this.resourceType = resourceType;
        _this.resourceId = resourceId;
        _this.lockedBy = lockedBy;
        _this.statusCode = 409;
        _this.code = 'RESOURCE_LOCKED';
        return _this;
    }
    return ResourceLockedError;
}(DomainError));
exports.ResourceLockedError = ResourceLockedError;
// =============================================================================
// Rate Limit Errors (429)
// =============================================================================
/**
 * Rate limit exceeded error
 */
var RateLimitExceededError = /** @class */ (function (_super) {
    __extends(RateLimitExceededError, _super);
    function RateLimitExceededError(retryAfterSeconds, details) {
        var _this = _super.call(this, 'Too many requests', __assign(__assign({}, details), { retryAfterSeconds: retryAfterSeconds })) || this;
        _this.retryAfterSeconds = retryAfterSeconds;
        _this.statusCode = 429;
        _this.code = 'RATE_LIMIT_EXCEEDED';
        _this.shouldLog = false;
        return _this;
    }
    return RateLimitExceededError;
}(DomainError));
exports.RateLimitExceededError = RateLimitExceededError;
// =============================================================================
// Server Errors (5xx)
// =============================================================================
/**
 * Internal server error
 */
var InternalError = /** @class */ (function (_super) {
    __extends(InternalError, _super);
    function InternalError(message, originalError, details) {
        if (message === void 0) { message = 'An internal error occurred'; }
        var _this = _super.call(this, message, details) || this;
        _this.originalError = originalError;
        _this.statusCode = 500;
        _this.code = 'INTERNAL_ERROR';
        if (originalError === null || originalError === void 0 ? void 0 : originalError.stack) {
            _this.stack = originalError.stack;
        }
        return _this;
    }
    return InternalError;
}(DomainError));
exports.InternalError = InternalError;
/**
 * Database error
 */
var DatabaseError = /** @class */ (function (_super) {
    __extends(DatabaseError, _super);
    function DatabaseError(message, operation, details) {
        if (message === void 0) { message = 'Database operation failed'; }
        var _this = _super.call(this, message, __assign(__assign({}, details), { operation: operation })) || this;
        _this.operation = operation;
        _this.statusCode = 500;
        _this.code = 'DATABASE_ERROR';
        return _this;
    }
    return DatabaseError;
}(DomainError));
exports.DatabaseError = DatabaseError;
/**
 * External service error
 */
var ExternalServiceError = /** @class */ (function (_super) {
    __extends(ExternalServiceError, _super);
    function ExternalServiceError(serviceName, message, details) {
        var _this = _super.call(this, message || "".concat(serviceName, " service error"), __assign(__assign({}, details), { serviceName: serviceName })) || this;
        _this.serviceName = serviceName;
        _this.statusCode = 502;
        _this.code = 'EXTERNAL_SERVICE_ERROR';
        return _this;
    }
    return ExternalServiceError;
}(DomainError));
exports.ExternalServiceError = ExternalServiceError;
/**
 * Service unavailable error
 */
var ServiceUnavailableError = /** @class */ (function (_super) {
    __extends(ServiceUnavailableError, _super);
    function ServiceUnavailableError(message, retryAfterSeconds, details) {
        if (message === void 0) { message = 'Service temporarily unavailable'; }
        var _this = _super.call(this, message, __assign(__assign({}, details), { retryAfterSeconds: retryAfterSeconds })) || this;
        _this.retryAfterSeconds = retryAfterSeconds;
        _this.statusCode = 503;
        _this.code = 'SERVICE_UNAVAILABLE';
        return _this;
    }
    return ServiceUnavailableError;
}(DomainError));
exports.ServiceUnavailableError = ServiceUnavailableError;
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Check if error is a DomainError
 */
function isDomainError(error) {
    return error instanceof DomainError;
}
/**
 * Check if error is an authentication error
 */
function isAuthError(error) {
    return (error instanceof AuthenticationRequiredError ||
        error instanceof InvalidCredentialsError ||
        error instanceof TokenExpiredError ||
        error instanceof TokenInvalidError);
}
/**
 * Check if error is an authorization error
 */
function isAuthorizationError(error) {
    return error instanceof PermissionDeniedError || error instanceof ForbiddenError;
}
/**
 * Check if error is a validation error
 */
function isValidationError(error) {
    return error instanceof ValidationError;
}
/**
 * Check if error is a not found error
 */
function isNotFoundError(error) {
    return error instanceof NotFoundError;
}
// =============================================================================
// Error Wrapping Utilities
// =============================================================================
/**
 * Wrap unknown error in a DomainError
 */
function wrapError(error, fallbackMessage) {
    if (fallbackMessage === void 0) { fallbackMessage = 'An error occurred'; }
    if (isDomainError(error)) {
        return error;
    }
    if (error instanceof Error) {
        return new InternalError(error.message, error);
    }
    if (typeof error === 'string') {
        return new InternalError(error);
    }
    return new InternalError(fallbackMessage);
}
/**
 * Assert a condition, throwing NotFoundError if false
 */
function assertExists(value, resourceType, resourceId) {
    if (value === null || value === undefined) {
        throw new NotFoundError(resourceType, resourceId);
    }
}
/**
 * Assert permission, throwing PermissionDeniedError if false
 */
function assertPermission(hasPermission, permission, message) {
    if (!hasPermission) {
        throw new PermissionDeniedError(message, permission);
    }
}
