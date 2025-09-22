"use strict";
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rbacRoute = rbacRoute;
exports.publicRoute = publicRoute;
exports.legacySecureRoute = legacySecureRoute;
exports.secureRoute = legacySecureRoute;
exports.migrateToRBAC = migrateToRBAC;
exports.webhookRoute = webhookRoute;
var rate_limit_1 = require("./middleware/rate-limit");
var global_auth_1 = require("./middleware/global-auth");
var error_1 = require("./responses/error");
var middleware_1 = require("@/lib/rbac/middleware");
var logger_1 = require("@/lib/logger");
var api_features_1 = require("@/lib/logger/api-features");
var phase2_migration_flags_1 = require("@/lib/logger/phase2-migration-flags");
/**
 * Secure route with RBAC permission checking
 */
function rbacRoute(handler, options) {
    var _this = this;
    return (0, logger_1.withCorrelation)(function (request) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return __awaiter(_this, void 0, void 0, function () {
            var startTime, apiLogger, url, logger, rateLimitStart, session, authStart, handlerStart, response, totalDuration, userContext, rbacStart, rbacMiddleware, rbacResult, rbacDuration, handlerStart, response, totalDuration, error_2, totalDuration;
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
            return __generator(this, function (_p) {
                switch (_p.label) {
                    case 0:
                        startTime = Date.now();
                        apiLogger = (0, api_features_1.createAPILogger)(request, 'rbac-enforcement');
                        url = new URL(request.url);
                        logger = apiLogger.getLogger();
                        // Enhanced RBAC route initiation logging
                        if ((0, phase2_migration_flags_1.isPhase2MigrationEnabled)('enableEnhancedRBACRouteHandler')) {
                            apiLogger.logRequest({
                                authType: 'session'
                            });
                            apiLogger.logSecurity('rbac_enforcement_initiated', 'low', {
                                action: 'permission_check_started',
                                requiredPermissions: Array.isArray(options.permission) ? options.permission : [options.permission],
                                requireAllPermissions: options.requireAllPermissions || false
                            });
                        }
                        else {
                            // Legacy logging fallback
                            logger.info('RBAC route initiated', {
                                endpoint: url.pathname,
                                method: request.method,
                                requiredPermissions: Array.isArray(options.permission) ? options.permission : [options.permission],
                                requireAllPermissions: options.requireAllPermissions || false
                            });
                        }
                        _p.label = 1;
                    case 1:
                        _p.trys.push([1, 13, , 14]);
                        if (!options.rateLimit) return [3 /*break*/, 3];
                        rateLimitStart = Date.now();
                        return [4 /*yield*/, (0, rate_limit_1.applyRateLimit)(request, options.rateLimit)];
                    case 2:
                        _p.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'rate_limit_check', Date.now() - rateLimitStart, {
                            limitType: options.rateLimit
                        });
                        _p.label = 3;
                    case 3:
                        session = null;
                        if (!(options.requireAuth !== false)) return [3 /*break*/, 5];
                        authStart = Date.now();
                        return [4 /*yield*/, (0, global_auth_1.applyGlobalAuth)(request)];
                    case 4:
                        session = _p.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'global_auth_check', Date.now() - authStart);
                        logger.debug('Global authentication completed', {
                            hasSession: !!session,
                            hasUser: !!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id)
                        });
                        return [3 /*break*/, 6];
                    case 5:
                        if (options.publicReason) {
                            (0, global_auth_1.markAsPublicRoute)(options.publicReason);
                            logger.debug('Route marked as public', {
                                reason: options.publicReason
                            });
                        }
                        _p.label = 6;
                    case 6:
                        // 3. Get user context for RBAC
                        // Skip authentication check for public routes
                        if (options.requireAuth !== false && !((_b = session === null || session === void 0 ? void 0 : session.user) === null || _b === void 0 ? void 0 : _b.id)) {
                            logger.warn('RBAC authentication failed - no user session', {
                                hasSession: !!session,
                                sessionKeys: session ? Object.keys(session) : []
                            });
                            (0, logger_1.logSecurityEvent)(logger, 'rbac_auth_failed', 'medium', {
                                reason: 'no_user_session',
                                endpoint: url.pathname
                            });
                            (0, logger_1.logAPIAuth)(logger, 'rbac_check', false, undefined, 'no_user_session');
                            return [2 /*return*/, (0, error_1.createErrorResponse)('Authentication required', 401, request)];
                        }
                        if (!(options.requireAuth === false)) return [3 /*break*/, 8];
                        logger.debug('Public route - skipping user context and RBAC checks', {
                            endpoint: url.pathname,
                            publicReason: options.publicReason
                        });
                        handlerStart = Date.now();
                        return [4 /*yield*/, handler.apply(void 0, __spreadArray([request, {}], args, false))];
                    case 7:
                        response = _p.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'handler_execution', Date.now() - handlerStart, {
                            statusCode: response.status,
                            isPublic: true
                        });
                        totalDuration = Date.now() - startTime;
                        logger.info('Public route completed successfully', {
                            endpoint: url.pathname,
                            statusCode: response.status,
                            totalDuration: totalDuration
                        });
                        return [2 /*return*/, response];
                    case 8:
                        userContext = session === null || session === void 0 ? void 0 : session.userContext;
                        if (!userContext) {
                            // Enhanced RBAC context failure logging
                            if ((0, phase2_migration_flags_1.isPhase2MigrationEnabled)('enableEnhancedRBACRouteHandler')) {
                                apiLogger.warn('RBAC context load failed', {
                                    action: 'context_load_failure',
                                    userId: (_c = session === null || session === void 0 ? void 0 : session.user) === null || _c === void 0 ? void 0 : _c.id,
                                    threat: 'authorization_bypass_attempt',
                                    blocked: true
                                });
                            }
                            else {
                                // Legacy logging
                                logger.error('Failed to load user context for RBAC', {
                                    userId: (_d = session === null || session === void 0 ? void 0 : session.user) === null || _d === void 0 ? void 0 : _d.id,
                                    sessionEmail: (_e = session === null || session === void 0 ? void 0 : session.user) === null || _e === void 0 ? void 0 : _e.email
                                });
                                (0, logger_1.logSecurityEvent)(logger, 'rbac_context_failed', 'high', {
                                    userId: (_f = session === null || session === void 0 ? void 0 : session.user) === null || _f === void 0 ? void 0 : _f.id,
                                    reason: 'context_load_failure'
                                });
                                (0, logger_1.logAPIAuth)(logger, 'rbac_check', false, (_g = session === null || session === void 0 ? void 0 : session.user) === null || _g === void 0 ? void 0 : _g.id, 'context_load_failure');
                            }
                            return [2 /*return*/, (0, error_1.createErrorResponse)('Failed to load user context', 500, request)];
                        }
                        logger.debug('User context loaded successfully', {
                            userId: userContext.user_id,
                            organizationId: userContext.current_organization_id,
                            roleCount: ((_h = userContext.roles) === null || _h === void 0 ? void 0 : _h.length) || 0,
                            permissionCount: ((_j = userContext.all_permissions) === null || _j === void 0 ? void 0 : _j.length) || 0,
                            isSuperAdmin: userContext.is_super_admin
                        });
                        rbacStart = Date.now();
                        rbacMiddleware = (0, middleware_1.createRBACMiddleware)(options.permission, {
                            requireAll: options.requireAllPermissions,
                            extractResourceId: options.extractResourceId,
                            extractOrganizationId: options.extractOrganizationId
                        });
                        return [4 /*yield*/, rbacMiddleware(request, userContext)];
                    case 9:
                        rbacResult = _p.sent();
                        rbacDuration = Date.now() - rbacStart;
                        (0, logger_1.logPerformanceMetric)(logger, 'rbac_permission_check', rbacDuration, {
                            userId: userContext.user_id,
                            permissions: Array.isArray(options.permission) ? options.permission : [options.permission],
                            requireAll: options.requireAllPermissions || false
                        });
                        if (!('success' in rbacResult && rbacResult.success)) return [3 /*break*/, 11];
                        // Enhanced RBAC permission success logging
                        if ((0, phase2_migration_flags_1.isPhase2MigrationEnabled)('enableEnhancedRBACRouteHandler')) {
                            apiLogger.info('RBAC permission granted', {
                                action: 'permission_check_passed',
                                userId: userContext.user_id,
                                threat: 'none',
                                requiredPermissions: Array.isArray(options.permission) ? options.permission : [options.permission],
                                userRoles: ((_k = userContext.roles) === null || _k === void 0 ? void 0 : _k.map(function (r) { return r.name; })) || []
                            });
                            // Business intelligence for access patterns
                            apiLogger.debug('Access control analytics', {
                                resourceAccess: 'granted',
                                permissionEvaluation: 'successful',
                                organizationId: userContext.current_organization_id,
                                userRole: ((_m = (_l = userContext.roles) === null || _l === void 0 ? void 0 : _l[0]) === null || _m === void 0 ? void 0 : _m.name) || 'no_role',
                                evaluationTime: rbacDuration
                            });
                        }
                        else {
                            // Legacy logging
                            logger.info('RBAC permission check passed', {
                                userId: userContext.user_id,
                                permissions: Array.isArray(options.permission) ? options.permission : [options.permission],
                                rbacDuration: rbacDuration
                            });
                        }
                        (0, logger_1.logAPIAuth)(logger, 'rbac_check', true, userContext.user_id);
                        handlerStart = Date.now();
                        return [4 /*yield*/, handler.apply(void 0, __spreadArray([request, rbacResult.userContext], args, false))];
                    case 10:
                        response = _p.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'handler_execution', Date.now() - handlerStart, {
                            userId: userContext.user_id,
                            statusCode: response.status
                        });
                        totalDuration = Date.now() - startTime;
                        logger.info('RBAC route completed successfully', {
                            userId: userContext.user_id,
                            statusCode: response.status,
                            totalDuration: totalDuration
                        });
                        return [2 /*return*/, response];
                    case 11:
                        // Permission denied - return RBAC response
                        logger.warn('RBAC permission denied', {
                            userId: userContext.user_id,
                            requiredPermissions: Array.isArray(options.permission) ? options.permission : [options.permission],
                            userPermissions: ((_o = userContext.all_permissions) === null || _o === void 0 ? void 0 : _o.map(function (p) { return p.name; })) || [],
                            rbacDuration: rbacDuration
                        });
                        (0, logger_1.logSecurityEvent)(logger, 'rbac_permission_denied', 'medium', {
                            userId: userContext.user_id,
                            requiredPermissions: Array.isArray(options.permission) ? options.permission : [options.permission],
                            endpoint: url.pathname
                        });
                        (0, logger_1.logAPIAuth)(logger, 'rbac_check', false, userContext.user_id, 'permission_denied');
                        return [2 /*return*/, rbacResult];
                    case 12: return [3 /*break*/, 14];
                    case 13:
                        error_2 = _p.sent();
                        totalDuration = Date.now() - startTime;
                        logger.error('RBAC route error', error_2, {
                            endpoint: url.pathname,
                            method: request.method,
                            totalDuration: totalDuration,
                            errorType: error_2 && typeof error_2 === 'object' && 'constructor' in error_2 && error_2.constructor && 'name' in error_2.constructor ? String(error_2.constructor.name) : typeof error_2
                        });
                        (0, logger_1.logPerformanceMetric)(logger, 'rbac_route_duration', totalDuration, {
                            success: false,
                            errorType: error_2 && typeof error_2 === 'object' && 'name' in error_2 ? String(error_2.name) : 'unknown'
                        });
                        return [2 /*return*/, (0, error_1.createErrorResponse)(error_2 && typeof error_2 === 'object' && 'message' in error_2 ? String(error_2.message) : 'Unknown error', 500, request)];
                    case 14: return [2 /*return*/];
                }
            });
        });
    });
}
/**
 * Public route (no authentication or RBAC required)
 */
function publicRoute(handler, reason, options) {
    var _this = this;
    if (options === void 0) { options = {}; }
    return rbacRoute(
    // Wrap handler to match expected signature
    function (request, _userContext) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, handler.apply(void 0, __spreadArray([request], args, false))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    }, __assign(__assign({}, options), { requireAuth: false, publicReason: reason, permission: [] // No permissions required for public routes
     }));
}
// Deprecated route wrappers removed - use rbacRoute with extractors from @/lib/api/utils/rbac-extractors
/**
 * Backward compatibility wrapper for existing secureRoute usage
 * Provides a migration path from basic auth to RBAC
 */
function legacySecureRoute(handler, options) {
    var _this = this;
    if (options === void 0) { options = {}; }
    return (0, logger_1.withCorrelation)(function (request) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return __awaiter(_this, void 0, void 0, function () {
            var startTime, logger, url, rateLimitStart, session, authStart, handlerStart, response, totalDuration, error_3, totalDuration;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        startTime = Date.now();
                        logger = (0, api_features_1.createAPILogger)(request);
                        url = new URL(request.url);
                        logger.info('Legacy secure route initiated', {
                            endpoint: url.pathname,
                            method: request.method,
                            requireAuth: options.requireAuth !== false
                        });
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 8, , 9]);
                        if (!options.rateLimit) return [3 /*break*/, 3];
                        rateLimitStart = Date.now();
                        return [4 /*yield*/, (0, rate_limit_1.applyRateLimit)(request, options.rateLimit)];
                    case 2:
                        _e.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'rate_limit_check', Date.now() - rateLimitStart, {
                            limitType: options.rateLimit
                        });
                        _e.label = 3;
                    case 3:
                        session = null;
                        if (!(options.requireAuth !== false)) return [3 /*break*/, 5];
                        authStart = Date.now();
                        return [4 /*yield*/, (0, global_auth_1.applyGlobalAuth)(request)];
                    case 4:
                        session = _e.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'legacy_auth_check', Date.now() - authStart);
                        logger.debug('Legacy authentication completed', {
                            hasSession: !!session,
                            hasUser: !!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id)
                        });
                        if ((_b = session === null || session === void 0 ? void 0 : session.user) === null || _b === void 0 ? void 0 : _b.id) {
                            (0, logger_1.logAPIAuth)(logger, 'legacy_auth', true, session.user.id);
                        }
                        else {
                            (0, logger_1.logAPIAuth)(logger, 'legacy_auth', false, undefined, 'no_session');
                        }
                        return [3 /*break*/, 6];
                    case 5:
                        if (options.publicReason) {
                            (0, global_auth_1.markAsPublicRoute)(options.publicReason);
                            logger.debug('Legacy route marked as public', {
                                reason: options.publicReason
                            });
                        }
                        _e.label = 6;
                    case 6:
                        handlerStart = Date.now();
                        return [4 /*yield*/, handler.apply(void 0, __spreadArray([request, session || undefined], args, false))];
                    case 7:
                        response = _e.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'legacy_handler_execution', Date.now() - handlerStart, {
                            userId: (_c = session === null || session === void 0 ? void 0 : session.user) === null || _c === void 0 ? void 0 : _c.id,
                            statusCode: response.status
                        });
                        totalDuration = Date.now() - startTime;
                        logger.info('Legacy secure route completed', {
                            userId: (_d = session === null || session === void 0 ? void 0 : session.user) === null || _d === void 0 ? void 0 : _d.id,
                            statusCode: response.status,
                            totalDuration: totalDuration
                        });
                        return [2 /*return*/, response];
                    case 8:
                        error_3 = _e.sent();
                        totalDuration = Date.now() - startTime;
                        logger.error('Legacy secure route error', error_3, {
                            endpoint: url.pathname,
                            method: request.method,
                            totalDuration: totalDuration,
                            errorType: error_3 && typeof error_3 === 'object' && 'constructor' in error_3 && error_3.constructor && 'name' in error_3.constructor ? String(error_3.constructor.name) : typeof error_3
                        });
                        (0, logger_1.logPerformanceMetric)(logger, 'legacy_route_duration', totalDuration, {
                            success: false,
                            errorType: error_3 && typeof error_3 === 'object' && 'name' in error_3 ? String(error_3.name) : 'unknown'
                        });
                        return [2 /*return*/, (0, error_1.createErrorResponse)(error_3 && typeof error_3 === 'object' && 'message' in error_3 ? String(error_3.message) : 'Unknown error', 500, request)];
                    case 9: return [2 /*return*/];
                }
            });
        });
    });
}
/**
 * Migration helper to gradually move from basic auth to RBAC
 * This allows existing routes to work while adding RBAC incrementally
 */
function migrateToRBAC(legacyHandler, permission, options) {
    var _this = this;
    if (options === void 0) { options = {}; }
    return rbacRoute(
    // Convert legacy handler to RBAC handler
    function (request, userContext) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        return __awaiter(_this, void 0, void 0, function () {
            var logger, legacySession, handlerStart, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger = (0, api_features_1.createAPILogger)(request).withUser(userContext.user_id, userContext.current_organization_id);
                        logger.debug('Legacy handler migration', {
                            userId: userContext.user_id,
                            migratedPermissions: Array.isArray(permission) ? permission : [permission],
                            legacyRole: userContext.is_super_admin ? 'super_admin' : 'user'
                        });
                        legacySession = {
                            user: {
                                id: userContext.user_id,
                                email: userContext.email,
                                name: "".concat(userContext.first_name, " ").concat(userContext.last_name),
                                firstName: userContext.first_name,
                                lastName: userContext.last_name,
                                role: userContext.is_super_admin ? 'super_admin' : 'user',
                                emailVerified: userContext.email_verified,
                                practiceId: userContext.current_organization_id || null,
                                roles: userContext.roles.map(function (role) { return role.name; }),
                                permissions: userContext.all_permissions.map(function (permission) { return permission.name; }),
                                isSuperAdmin: userContext.is_super_admin,
                                organizationAdminFor: userContext.organization_admin_for
                            },
                            accessToken: '', // Legacy compatibility - not used
                            sessionId: '', // Legacy compatibility - not used
                            userContext: userContext // Full RBAC context
                        };
                        handlerStart = Date.now();
                        return [4 /*yield*/, legacyHandler.apply(void 0, __spreadArray([request, legacySession], args, false))];
                    case 1:
                        response = _a.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'legacy_handler_execution', Date.now() - handlerStart, {
                            userId: userContext.user_id,
                            statusCode: response.status
                        });
                        return [2 /*return*/, response];
                }
            });
        });
    }, __assign(__assign({}, options), { permission: permission, requireAuth: true }));
}
function webhookRoute(handler, options) {
    var _this = this;
    return (0, logger_1.withCorrelation)(function (request) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return __awaiter(_this, void 0, void 0, function () {
            var startTime, logger, url, rateLimitStart, bodyStart, rawBody, signatureStart, isValid, parsedBody, handlerStart, response, totalDuration, error_4, totalDuration;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        logger = (0, api_features_1.createAPILogger)(request);
                        url = new URL(request.url);
                        logger.info('Webhook request initiated', {
                            endpoint: url.pathname,
                            method: request.method,
                            source: options.source
                        });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        if (!options.rateLimit) return [3 /*break*/, 3];
                        rateLimitStart = Date.now();
                        return [4 /*yield*/, (0, rate_limit_1.applyRateLimit)(request, options.rateLimit)];
                    case 2:
                        _a.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'webhook_rate_limit_check', Date.now() - rateLimitStart, {
                            source: options.source
                        });
                        _a.label = 3;
                    case 3:
                        bodyStart = Date.now();
                        return [4 /*yield*/, request.text()];
                    case 4:
                        rawBody = _a.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'webhook_body_reading', Date.now() - bodyStart, {
                            bodySize: rawBody.length,
                            source: options.source
                        });
                        signatureStart = Date.now();
                        return [4 /*yield*/, options.verifySignature(request, rawBody)];
                    case 5:
                        isValid = _a.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'webhook_signature_verification', Date.now() - signatureStart, {
                            source: options.source,
                            valid: isValid
                        });
                        if (!isValid) {
                            logger.warn('Webhook signature verification failed', {
                                source: options.source,
                                endpoint: url.pathname
                            });
                            (0, logger_1.logSecurityEvent)(logger, 'webhook_signature_invalid', 'high', {
                                source: options.source,
                                endpoint: url.pathname
                            });
                            return [2 /*return*/, (0, error_1.createErrorResponse)('Invalid webhook signature', 401, request)];
                        }
                        logger.debug('Webhook signature verified successfully', {
                            source: options.source
                        });
                        parsedBody = void 0;
                        try {
                            parsedBody = JSON.parse(rawBody);
                        }
                        catch (parseError) {
                            logger.error('Webhook body parse error', parseError, {
                                source: options.source,
                                bodyPreview: rawBody.substring(0, 100)
                            });
                            return [2 /*return*/, (0, error_1.createErrorResponse)('Invalid webhook body', 400, request)];
                        }
                        handlerStart = Date.now();
                        return [4 /*yield*/, handler(request, parsedBody, rawBody)];
                    case 6:
                        response = _a.sent();
                        (0, logger_1.logPerformanceMetric)(logger, 'webhook_handler_execution', Date.now() - handlerStart, {
                            source: options.source,
                            statusCode: response.status
                        });
                        totalDuration = Date.now() - startTime;
                        logger.info('Webhook processed successfully', {
                            source: options.source,
                            statusCode: response.status,
                            totalDuration: totalDuration
                        });
                        (0, logger_1.logPerformanceMetric)(logger, 'webhook_total_duration', totalDuration, {
                            source: options.source,
                            success: response.status < 400
                        });
                        return [2 /*return*/, response];
                    case 7:
                        error_4 = _a.sent();
                        totalDuration = Date.now() - startTime;
                        logger.error('Webhook processing error', error_4, {
                            source: options.source,
                            endpoint: url.pathname,
                            method: request.method,
                            totalDuration: totalDuration,
                            errorType: error_4 && typeof error_4 === 'object' && 'constructor' in error_4 && error_4.constructor && 'name' in error_4.constructor ? String(error_4.constructor.name) : typeof error_4
                        });
                        (0, logger_1.logSecurityEvent)(logger, 'webhook_processing_error', 'high', {
                            source: options.source,
                            endpoint: url.pathname,
                            error: error_4 && typeof error_4 === 'object' && 'message' in error_4 ? String(error_4.message) : 'Unknown error'
                        });
                        (0, logger_1.logPerformanceMetric)(logger, 'webhook_total_duration', totalDuration, {
                            source: options.source,
                            success: false,
                            errorType: error_4 && typeof error_4 === 'object' && 'name' in error_4 ? String(error_4.name) : 'unknown'
                        });
                        return [2 /*return*/, (0, error_1.createErrorResponse)(error_4 && typeof error_4 === 'object' && 'message' in error_4 ? String(error_4.message) : 'Unknown error', 500, request)];
                    case 8: return [2 /*return*/];
                }
            });
        });
    });
}
// adminRoute removed - use rbacRoute with rbacConfigs.superAdmin
