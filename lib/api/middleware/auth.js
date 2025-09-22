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
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
exports.requireAdmin = requireAdmin;
exports.requirePracticeOwner = requirePracticeOwner;
exports.requireOwnership = requireOwnership;
exports.requirePracticeAccess = requirePracticeAccess;
exports.requireFreshAuth = requireFreshAuth;
var token_manager_1 = require("@/lib/auth/token-manager");
var error_1 = require("../responses/error");
var db_1 = require("@/lib/db");
var drizzle_orm_1 = require("drizzle-orm");
var user_context_1 = require("@/lib/rbac/user-context");
var debug_1 = require("@/lib/utils/debug");
var factory_1 = require("@/lib/logger/factory");
var phase2_migration_flags_1 = require("@/lib/logger/phase2-migration-flags");
// Universal logger for authentication middleware
var authMiddlewareLogger = (0, factory_1.createAppLogger)('auth-middleware', {
    component: 'security',
    feature: 'authentication-pipeline'
});
function requireAuth(request) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, authHeader, accessToken, cookieHeader, cookies, accessTokenCookie, tokenValidationStart, payload, tokenValidationDuration, userId, user, userContext, userRoles, primaryRole, duration;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    startTime = Date.now();
                    // Enhanced authentication middleware logging
                    if ((0, phase2_migration_flags_1.isPhase2MigrationEnabled)('enableEnhancedAuthMiddleware')) {
                        authMiddlewareLogger.info('Authentication middleware initiated', {
                            url: request.url,
                            method: request.method,
                            hasAuthHeader: !!request.headers.get('Authorization'),
                            hasCookieHeader: !!request.headers.get('Cookie')
                        });
                    }
                    authHeader = request.headers.get('Authorization');
                    accessToken = null;
                    if (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) {
                        // Use Authorization header if present (for API clients)
                        accessToken = authHeader.slice(7);
                    }
                    else {
                        cookieHeader = request.headers.get('Cookie');
                        if (cookieHeader) {
                            cookies = cookieHeader.split(';');
                            accessTokenCookie = (_a = cookies
                                .find(function (cookie) { return cookie.trim().startsWith('access-token='); })) === null || _a === void 0 ? void 0 : _a.split('=')[1];
                            if (accessTokenCookie) {
                                accessToken = accessTokenCookie;
                                debug_1.debugLog.auth('Using access token from httpOnly cookie');
                            }
                        }
                    }
                    if (!accessToken) {
                        // Enhanced missing token logging
                        if ((0, phase2_migration_flags_1.isPhase2MigrationEnabled)('enableEnhancedAuthMiddleware')) {
                            authMiddlewareLogger.security('authentication_failed', 'medium', {
                                action: 'token_missing',
                                threat: 'unauthorized_access',
                                blocked: true,
                                reason: 'no_access_token'
                            });
                        }
                        throw (0, error_1.AuthenticationError)('Access token required');
                    }
                    tokenValidationStart = Date.now();
                    return [4 /*yield*/, token_manager_1.TokenManager.validateAccessToken(accessToken)];
                case 1:
                    payload = _e.sent();
                    tokenValidationDuration = Date.now() - tokenValidationStart;
                    if (!payload) {
                        // Enhanced token validation failure logging
                        if ((0, phase2_migration_flags_1.isPhase2MigrationEnabled)('enableEnhancedAuthMiddleware')) {
                            authMiddlewareLogger.security('token_validation_failed', 'high', {
                                action: 'invalid_token',
                                threat: 'credential_attack',
                                blocked: true,
                                tokenValidationTime: tokenValidationDuration
                            });
                            authMiddlewareLogger.auth('token_validation', false, {
                                reason: 'invalid_or_expired_token',
                                validationDuration: tokenValidationDuration
                            });
                        }
                        throw (0, error_1.AuthenticationError)('Invalid or expired access token');
                    }
                    // Log successful token validation
                    if ((0, phase2_migration_flags_1.isPhase2MigrationEnabled)('enableEnhancedAuthMiddleware')) {
                        authMiddlewareLogger.auth('token_validation', true, {
                            userId: payload.sub,
                            sessionId: payload.session_id,
                            validationDuration: tokenValidationDuration
                        });
                    }
                    userId = payload.sub;
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(db_1.users)
                            .where((0, drizzle_orm_1.eq)(db_1.users.user_id, userId))
                            .limit(1)];
                case 2:
                    user = (_e.sent())[0];
                    if (!user || !user.is_active) {
                        throw (0, error_1.AuthenticationError)('User account is inactive');
                    }
                    return [4 /*yield*/, (0, user_context_1.getUserContextSafe)(user.user_id)
                        // Get the user's actual assigned roles
                    ];
                case 3:
                    userContext = _e.sent();
                    userRoles = ((_b = userContext === null || userContext === void 0 ? void 0 : userContext.roles) === null || _b === void 0 ? void 0 : _b.map(function (r) { return r.name; })) || [];
                    primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';
                    // Enhanced authentication success logging
                    if ((0, phase2_migration_flags_1.isPhase2MigrationEnabled)('enableEnhancedAuthMiddleware')) {
                        duration = Date.now() - startTime;
                        // Authentication pipeline completion
                        authMiddlewareLogger.info('Authentication pipeline completed', {
                            userId: user.user_id,
                            sessionId: payload.session_id,
                            roleCount: userRoles.length,
                            permissionCount: ((_c = userContext === null || userContext === void 0 ? void 0 : userContext.all_permissions) === null || _c === void 0 ? void 0 : _c.length) || 0,
                            isSuperAdmin: (userContext === null || userContext === void 0 ? void 0 : userContext.is_super_admin) || false,
                            duration: duration
                        });
                        // Security success event
                        authMiddlewareLogger.security('authentication_successful', 'low', {
                            action: 'middleware_auth_success',
                            userId: user.user_id,
                            sessionValidated: true,
                            rbacContextLoaded: !!userContext
                        });
                        // Performance monitoring
                        authMiddlewareLogger.timing('Authentication middleware completed', startTime, {
                            tokenValidationTime: tokenValidationDuration,
                            rbacLoadTime: duration - tokenValidationDuration,
                            userActive: user.is_active
                        });
                    }
                    // Return session-like object with actual RBAC information
                    return [2 /*return*/, {
                            user: {
                                id: user.user_id,
                                email: user.email,
                                name: "".concat(user.first_name, " ").concat(user.last_name),
                                firstName: user.first_name,
                                lastName: user.last_name,
                                role: primaryRole, // First assigned role, or 'user' if none
                                emailVerified: user.email_verified,
                                practiceId: userContext === null || userContext === void 0 ? void 0 : userContext.current_organization_id,
                                roles: userRoles, // All explicitly assigned roles
                                permissions: ((_d = userContext === null || userContext === void 0 ? void 0 : userContext.all_permissions) === null || _d === void 0 ? void 0 : _d.map(function (p) { return p.name; })) || [],
                                isSuperAdmin: (userContext === null || userContext === void 0 ? void 0 : userContext.is_super_admin) || false,
                                organizationAdminFor: (userContext === null || userContext === void 0 ? void 0 : userContext.organization_admin_for) || []
                            },
                            accessToken: accessToken,
                            sessionId: payload.session_id,
                            userContext: userContext // Include full RBAC context for middleware
                        }];
            }
        });
    });
}
function requireRole(request, allowedRoles) {
    return __awaiter(this, void 0, void 0, function () {
        var session, hasRequiredRole;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, requireAuth(request)
                    // For super_admin, always allow (special case)
                ];
                case 1:
                    session = _a.sent();
                    // For super_admin, always allow (special case)
                    if (session.user.isSuperAdmin) {
                        return [2 /*return*/, session];
                    }
                    hasRequiredRole = allowedRoles.some(function (role) { var _a; return (_a = session.user.roles) === null || _a === void 0 ? void 0 : _a.includes(role); });
                    if (!hasRequiredRole) {
                        throw (0, error_1.AuthorizationError)("Access denied. Required role: ".concat(allowedRoles.join(' or ')));
                    }
                    return [2 /*return*/, session];
            }
        });
    });
}
// Note: This is legacy - prefer using permission-based checks instead
// Super admins get special case handling (full access)
// Other users should be checked via specific permissions
function requireAdmin(request) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, requireRole(request, ['admin', 'super_admin'])];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function requirePracticeOwner(request) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, requireRole(request, ['admin', 'practice_owner', 'super_admin'])];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function requireOwnership(request, resourceUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var session, hasOwnership;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, requireAuth(request)];
                case 1:
                    session = _b.sent();
                    hasOwnership = session.user.id === resourceUserId ||
                        session.user.isSuperAdmin ||
                        ((_a = session.user.organizationAdminFor) === null || _a === void 0 ? void 0 : _a.length) > 0;
                    if (!hasOwnership) {
                        throw (0, error_1.AuthorizationError)('You can only access your own resources');
                    }
                    return [2 /*return*/, session];
            }
        });
    });
}
function requirePracticeAccess(request, practiceId) {
    return __awaiter(this, void 0, void 0, function () {
        var session;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, requireAuth(request)
                    // Super admins can access any practice
                ];
                case 1:
                    session = _b.sent();
                    // Super admins can access any practice
                    if (session.user.isSuperAdmin) {
                        return [2 /*return*/, session];
                    }
                    // Organization admins can access practices in their organizations
                    if ((_a = session.user.organizationAdminFor) === null || _a === void 0 ? void 0 : _a.includes(practiceId)) {
                        return [2 /*return*/, session];
                    }
                    // Practice owners can access their own practice
                    if (session.user.role === 'practice_owner' && session.user.practiceId === practiceId) {
                        return [2 /*return*/, session];
                    }
                    throw (0, error_1.AuthorizationError)('You do not have access to this practice');
            }
        });
    });
}
/**
 * Require fresh authentication for sensitive operations
 */
function requireFreshAuth(request_1) {
    return __awaiter(this, arguments, void 0, function (request, maxAgeMinutes) {
        var session, authHeader, accessToken, payload, issuedAt, now, ageMinutes;
        if (maxAgeMinutes === void 0) { maxAgeMinutes = 5; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, requireAuth(request)
                    // Check if we have fresh authentication timestamp in the access token
                ];
                case 1:
                    session = _a.sent();
                    authHeader = request.headers.get('Authorization');
                    accessToken = authHeader === null || authHeader === void 0 ? void 0 : authHeader.slice(7);
                    if (!accessToken) {
                        throw (0, error_1.AuthenticationError)('Fresh authentication required');
                    }
                    return [4 /*yield*/, token_manager_1.TokenManager.validateAccessToken(accessToken)];
                case 2:
                    payload = _a.sent();
                    if (!payload) {
                        throw (0, error_1.AuthenticationError)('Invalid access token');
                    }
                    issuedAt = payload.iat * 1000 // Convert to milliseconds
                    ;
                    now = Date.now();
                    ageMinutes = (now - issuedAt) / (60 * 1000);
                    if (ageMinutes > maxAgeMinutes) {
                        throw (0, error_1.AuthenticationError)('Fresh authentication required for this operation');
                    }
                    return [2 /*return*/, session];
            }
        });
    });
}
