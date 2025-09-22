"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPublicApiRoute = isPublicApiRoute;
exports.applyGlobalAuth = applyGlobalAuth;
exports.markAsPublicRoute = markAsPublicRoute;
exports.requireAdminAuth = requireAdminAuth;
exports.getAuthenticatedUser = getAuthenticatedUser;
var auth_1 = require("./auth");
var headers_1 = require("next/headers");
var logger_1 = require("@/lib/logger");
/**
 * Global API Authentication Middleware
 * Protects ALL API routes by default unless explicitly marked as public
 */
// Public API routes that don't require authentication
var PUBLIC_API_ROUTES = new Set([
    '/api/health',
    '/api/health/db',
    '/api/health/services',
    '/api/auth/login', // ✅ Needs CSRF protection despite being public
    '/api/auth/logout', // ✅ Logout needs to be accessible even when not authenticated
    '/api/auth/refresh', // ✅ Token refresh needs cookie-based auth
    '/api/csrf', // ✅ Public endpoint for token generation
    '/api/webhooks/stripe', // ✅ Webhooks don't need CSRF (external)
    '/api/webhooks/resend', // ✅ Webhooks don't need CSRF (external)
    // Practice website API (public facing)
    '/api/practices/by-domain', // If this exists for public practice sites
]);
// Routes that require public access patterns
var PUBLIC_ROUTE_PATTERNS = [
    /^\/api\/webhooks\//, // Webhook endpoints
    /^\/api\/auth\//, // Authentication endpoints  
    /^\/api\/health/, // Health check endpoints
];
/**
 * Check if an API route should be public (no auth required)
 */
function isPublicApiRoute(pathname) {
    // Check exact matches
    if (PUBLIC_API_ROUTES.has(pathname)) {
        return true;
    }
    // Check pattern matches
    return PUBLIC_ROUTE_PATTERNS.some(function (pattern) { return pattern.test(pathname); });
}
/**
 * Check if refresh token cookie exists (for debugging purposes only)
 */
function _checkRefreshTokenCookie() {
    return __awaiter(this, void 0, void 0, function () {
        var cookieStore_1, refreshToken, _error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, headers_1.cookies)()];
                case 1:
                    cookieStore_1 = _b.sent();
                    refreshToken = (_a = cookieStore_1.get('refresh-token')) === null || _a === void 0 ? void 0 : _a.value;
                    return [2 /*return*/, !!refreshToken];
                case 2:
                    _error_1 = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function applyGlobalAuth(request) {
    return __awaiter(this, void 0, void 0, function () {
        var pathname, logger, authHeader, cookieHeader, hasAuth, authMethod, startTime, authResult, duration, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    pathname = new URL(request.url).pathname;
                    logger = logger_1.loggers.auth.child({ path: pathname, method: request.method });
                    logger.debug('API auth check initiated', { pathname: pathname });
                    // Skip auth for public routes
                    if (isPublicApiRoute(pathname)) {
                        logger.debug('Public API route detected, no auth required', { pathname: pathname });
                        return [2 /*return*/, null]; // No auth required
                    }
                    authHeader = request.headers.get('authorization');
                    cookieHeader = request.headers.get('cookie');
                    hasAuth = false;
                    authMethod = '';
                    if (authHeader) {
                        hasAuth = true;
                        authMethod = 'authorization_header';
                        logger.debug('Using Authorization header for authentication', { pathname: pathname });
                    }
                    else if (cookieHeader === null || cookieHeader === void 0 ? void 0 : cookieHeader.includes('access-token=')) {
                        hasAuth = true;
                        authMethod = 'httponly_cookie';
                        logger.debug('Using httpOnly cookie for authentication', { pathname: pathname });
                    }
                    if (!hasAuth) {
                        logger.warn('API authentication failed - no valid auth method', {
                            pathname: pathname,
                            hasAuthHeader: !!authHeader,
                            hasCookieHeader: !!cookieHeader,
                            cookieContainsToken: (cookieHeader === null || cookieHeader === void 0 ? void 0 : cookieHeader.includes('access-token=')) || false
                        });
                        throw new Error("Authentication required for ".concat(pathname, ": Access token required"));
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    startTime = Date.now();
                    return [4 /*yield*/, (0, auth_1.requireAuth)(request)];
                case 2:
                    authResult = _b.sent();
                    duration = Date.now() - startTime;
                    logger.info('API authentication successful', {
                        pathname: pathname,
                        userId: authResult.user.id,
                        userEmail: (_a = authResult.user.email) === null || _a === void 0 ? void 0 : _a.replace(/(.{2}).*@/, '$1***@'), // Mask email
                        authMethod: authMethod,
                        duration: duration
                    });
                    return [2 /*return*/, authResult];
                case 3:
                    error_1 = _b.sent();
                    logger.error('API authentication failed', error_1, {
                        pathname: pathname,
                        authMethod: authMethod,
                        errorType: error_1 instanceof Error ? error_1.constructor.name : typeof error_1
                    });
                    throw new Error("Authentication required for ".concat(pathname, ": ").concat(error_1 instanceof Error ? error_1.message : 'Unknown error'));
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Mark a route as public (for explicit documentation)
 * This is a no-op function for clarity in route handlers
 */
function markAsPublicRoute(_reason) {
    // This function exists for documentation purposes
    // Usage: markAsPublicRoute('Health check endpoint')
}
/**
 * Require admin role for sensitive operations
 */
function requireAdminAuth(request) {
    return __awaiter(this, void 0, void 0, function () {
        var requireAdmin;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./auth'); })];
                case 1:
                    requireAdmin = (_a.sent()).requireAdmin;
                    return [4 /*yield*/, requireAdmin(request)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Get authenticated user from request (convenience function)
 */
function getAuthenticatedUser(request) {
    return __awaiter(this, void 0, void 0, function () {
        var session;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, applyGlobalAuth(request)];
                case 1:
                    session = _a.sent();
                    return [2 /*return*/, (session === null || session === void 0 ? void 0 : session.user) || null];
            }
        });
    });
}
