"use strict";
/**
 * Unified CSRF Protection
 * Edge Runtime compatible with full feature parity
 * Combines EdgeCSRFProtection and CSRFProtection functionality
 */
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
exports.UnifiedCSRFProtection = void 0;
var nanoid_1 = require("nanoid");
var headers_1 = require("next/headers");
var csrf_monitoring_1 = require("./csrf-monitoring");
var factory_1 = require("@/lib/logger/factory");
// Enhanced security logger for CSRF protection
var csrfSecurityLogger = (0, factory_1.createAppLogger)('csrf-unified', {
    component: 'security',
    feature: 'csrf-protection',
    module: 'csrf-unified',
    securityLevel: 'critical'
});
/**
 * Unified CSRF Protection class that works in both Edge Runtime and Node.js
 * Implements secure token generation, validation, and management
 */
var UnifiedCSRFProtection = /** @class */ (function () {
    function UnifiedCSRFProtection() {
    }
    /**
     * Get CSRF secret from environment with proper fallback
     * Works in both Edge Runtime and Node.js environments
     */
    UnifiedCSRFProtection.getCSRFSecret = function () {
        var _a, _b;
        var secret = process.env.CSRF_SECRET || ((_b = (_a = globalThis.process) === null || _a === void 0 ? void 0 : _a.env) === null || _b === void 0 ? void 0 : _b.CSRF_SECRET);
        if (!secret) {
            throw new Error('CSRF_SECRET environment variable is required');
        }
        if (secret.length < 32) {
            throw new Error('CSRF_SECRET must be at least 32 characters for security');
        }
        return secret;
    };
    /**
     * Normalize IP address for consistent token validation
     * Handles localhost variations and proxy forwarding
     */
    UnifiedCSRFProtection.normalizeIP = function (rawIP) {
        // Handle localhost variations
        if (rawIP === '::1' || rawIP === '127.0.0.1' || rawIP === 'localhost') {
            return 'localhost';
        }
        // Handle IPv6 mapped IPv4 addresses
        if (rawIP.startsWith('::ffff:')) {
            var ipv4 = rawIP.substring(7);
            if (ipv4 === '127.0.0.1') {
                return 'localhost';
            }
            return ipv4;
        }
        return rawIP;
    };
    /**
     * Extract and normalize IP from request with comprehensive proxy support
     * Prioritizes most reliable headers first
     */
    UnifiedCSRFProtection.getRequestIP = function (request) {
        // Priority order for IP extraction
        var forwardedFor = request.headers.get('x-forwarded-for');
        if (forwardedFor) {
            // Take first IP from comma-separated list (original client)
            var firstIP = forwardedFor.split(',')[0];
            return UnifiedCSRFProtection.normalizeIP((firstIP === null || firstIP === void 0 ? void 0 : firstIP.trim()) || 'unknown');
        }
        var realIP = request.headers.get('x-real-ip');
        if (realIP) {
            return UnifiedCSRFProtection.normalizeIP(realIP);
        }
        // Cloudflare connecting IP
        var cfConnectingIP = request.headers.get('cf-connecting-ip');
        if (cfConnectingIP) {
            return UnifiedCSRFProtection.normalizeIP(cfConnectingIP);
        }
        // Other common proxy headers
        var trueClientIP = request.headers.get('true-client-ip');
        if (trueClientIP) {
            return UnifiedCSRFProtection.normalizeIP(trueClientIP);
        }
        var clientIP = request.headers.get('x-client-ip');
        if (clientIP) {
            return UnifiedCSRFProtection.normalizeIP(clientIP);
        }
        // Fallback to request.ip or unknown
        var requestIP = request.ip;
        return UnifiedCSRFProtection.normalizeIP(requestIP || 'unknown');
    };
    /**
     * Get time window with development flexibility
     * Development: 15-minute windows, Production: 5-minute windows
     */
    UnifiedCSRFProtection.getTimeWindow = function () {
        var _a, _b;
        var isDevelopment = (process.env.NODE_ENV || ((_b = (_a = globalThis.process) === null || _a === void 0 ? void 0 : _a.env) === null || _b === void 0 ? void 0 : _b.NODE_ENV)) === 'development';
        var windowSize = isDevelopment ? 900000 : 300000; // 15min dev, 5min prod
        return Math.floor(Date.now() / windowSize);
    };
    /**
     * Generate anonymous CSRF token using Web Crypto API (Edge compatible)
     * Used for protecting public endpoints like login/register
     */
    UnifiedCSRFProtection.generateAnonymousToken = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var secret, payload, tokenData, encoder, key, signatureArrayBuffer, signature, signedToken;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        secret = UnifiedCSRFProtection.getCSRFSecret();
                        payload = {
                            type: 'anonymous',
                            ip: UnifiedCSRFProtection.getRequestIP(request),
                            userAgent: request.headers.get('user-agent') || 'unknown',
                            timeWindow: UnifiedCSRFProtection.getTimeWindow(),
                            nonce: (0, nanoid_1.nanoid)(8), // Prevent replay attacks
                            timestamp: Date.now() // Additional entropy
                        };
                        tokenData = JSON.stringify(payload);
                        encoder = new TextEncoder();
                        return [4 /*yield*/, globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])];
                    case 1:
                        key = _a.sent();
                        return [4 /*yield*/, globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(tokenData))];
                    case 2:
                        signatureArrayBuffer = _a.sent();
                        signature = Array.from(new Uint8Array(signatureArrayBuffer))
                            .map(function (b) { return b.toString(16).padStart(2, '0'); })
                            .join('');
                        signedToken = "".concat(btoa(tokenData), ".").concat(signature);
                        return [2 /*return*/, signedToken];
                }
            });
        });
    };
    /**
     * Generate authenticated CSRF token for logged-in users
     * More secure with user-specific binding
     */
    UnifiedCSRFProtection.generateAuthenticatedToken = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var secret, payload, tokenData, encoder, key, signatureArrayBuffer, signature, signedToken;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        secret = UnifiedCSRFProtection.getCSRFSecret();
                        payload = {
                            type: 'authenticated',
                            timestamp: Date.now(),
                            nonce: (0, nanoid_1.nanoid)(16), // Longer nonce for authenticated tokens
                            userId: userId || 'session',
                            timeWindow: UnifiedCSRFProtection.getTimeWindow()
                        };
                        tokenData = JSON.stringify(payload);
                        encoder = new TextEncoder();
                        return [4 /*yield*/, globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])];
                    case 1:
                        key = _a.sent();
                        return [4 /*yield*/, globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(tokenData))];
                    case 2:
                        signatureArrayBuffer = _a.sent();
                        signature = Array.from(new Uint8Array(signatureArrayBuffer))
                            .map(function (b) { return b.toString(16).padStart(2, '0'); })
                            .join('');
                        signedToken = "".concat(btoa(tokenData), ".").concat(signature);
                        return [2 /*return*/, signedToken];
                }
            });
        });
    };
    /**
     * Validate anonymous CSRF token using Web Crypto API
     * Verifies request fingerprint and time window
     */
    UnifiedCSRFProtection.validateAnonymousToken = function (request, token) {
        return __awaiter(this, void 0, void 0, function () {
            var isDevelopment, secret, _a, encodedPayload, signature, encoder, key, signatureBytes, isSignatureValid, payload, currentIp, currentUserAgent, currentTimeWindow, timeWindowMatch, isValid, error_1, isDevelopment;
            var _b, _c, _d, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        _g.trys.push([0, 3, , 4]);
                        isDevelopment = (process.env.NODE_ENV || ((_c = (_b = globalThis.process) === null || _b === void 0 ? void 0 : _b.env) === null || _c === void 0 ? void 0 : _c.NODE_ENV)) === 'development';
                        secret = UnifiedCSRFProtection.getCSRFSecret();
                        _a = token.split('.'), encodedPayload = _a[0], signature = _a[1];
                        if (!encodedPayload || !signature) {
                            if (isDevelopment) {
                                console.log('🔍 CSRF Token Parse Failed:', {
                                    tokenLength: token.length,
                                    hasDot: token.includes('.'),
                                    parts: token.split('.').length
                                });
                            }
                            return [2 /*return*/, false];
                        }
                        encoder = new TextEncoder();
                        return [4 /*yield*/, globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])];
                    case 1:
                        key = _g.sent();
                        signatureBytes = new Uint8Array(signature.match(/.{2}/g).map(function (byte) { return parseInt(byte, 16); }));
                        return [4 /*yield*/, globalThis.crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(atob(encodedPayload)))];
                    case 2:
                        isSignatureValid = _g.sent();
                        if (!isSignatureValid) {
                            if (isDevelopment) {
                                console.log('🔍 CSRF Signature Invalid');
                            }
                            return [2 /*return*/, false];
                        }
                        payload = JSON.parse(atob(encodedPayload));
                        if (payload.type !== 'anonymous') {
                            if (isDevelopment) {
                                console.log('🔍 CSRF Token Type Mismatch:', {
                                    expected: 'anonymous',
                                    actual: payload.type
                                });
                            }
                            return [2 /*return*/, false];
                        }
                        currentIp = UnifiedCSRFProtection.getRequestIP(request);
                        currentUserAgent = request.headers.get('user-agent') || 'unknown';
                        currentTimeWindow = UnifiedCSRFProtection.getTimeWindow();
                        timeWindowMatch = isDevelopment
                            ? Math.abs(payload.timeWindow - currentTimeWindow) <= 1
                            : payload.timeWindow === currentTimeWindow;
                        isValid = (payload.ip === currentIp &&
                            payload.userAgent === currentUserAgent &&
                            timeWindowMatch);
                        if (!isValid && isDevelopment) {
                            console.log('🔍 CSRF Anonymous Validation Failed:', {
                                payload: {
                                    ip: payload.ip,
                                    userAgent: ((_d = payload.userAgent) === null || _d === void 0 ? void 0 : _d.substring(0, 30)) + '...',
                                    timeWindow: payload.timeWindow
                                },
                                current: {
                                    ip: currentIp,
                                    userAgent: (currentUserAgent === null || currentUserAgent === void 0 ? void 0 : currentUserAgent.substring(0, 30)) + '...',
                                    timeWindow: currentTimeWindow
                                },
                                matches: {
                                    ip: payload.ip === currentIp,
                                    userAgent: payload.userAgent === currentUserAgent,
                                    timeWindow: timeWindowMatch
                                }
                            });
                        }
                        return [2 /*return*/, isValid];
                    case 3:
                        error_1 = _g.sent();
                        isDevelopment = (process.env.NODE_ENV || ((_f = (_e = globalThis.process) === null || _e === void 0 ? void 0 : _e.env) === null || _f === void 0 ? void 0 : _f.NODE_ENV)) === 'development';
                        if (isDevelopment) {
                            console.log('🔍 CSRF Anonymous Validation Error:', error_1);
                        }
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Validate authenticated CSRF token
     * Verifies signature and token structure
     */
    UnifiedCSRFProtection.validateAuthenticatedToken = function (token) {
        return __awaiter(this, void 0, void 0, function () {
            var secret, _a, encodedPayload, signature, encoder, key, signatureBytes, isSignatureValid, payload, tokenAge, maxAge, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 3, , 4]);
                        secret = UnifiedCSRFProtection.getCSRFSecret();
                        _a = token.split('.'), encodedPayload = _a[0], signature = _a[1];
                        if (!encodedPayload || !signature) {
                            return [2 /*return*/, false];
                        }
                        encoder = new TextEncoder();
                        return [4 /*yield*/, globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])];
                    case 1:
                        key = _b.sent();
                        signatureBytes = new Uint8Array(signature.match(/.{2}/g).map(function (byte) { return parseInt(byte, 16); }));
                        return [4 /*yield*/, globalThis.crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(atob(encodedPayload)))];
                    case 2:
                        isSignatureValid = _b.sent();
                        if (!isSignatureValid) {
                            return [2 /*return*/, false];
                        }
                        payload = JSON.parse(atob(encodedPayload));
                        if (payload.type !== 'authenticated') {
                            return [2 /*return*/, false];
                        }
                        tokenAge = Date.now() - payload.timestamp;
                        maxAge = 24 * 60 * 60 * 1000 // 24 hours
                        ;
                        return [2 /*return*/, tokenAge <= maxAge];
                    case 3:
                        error_2 = _b.sent();
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Set CSRF token in cookie (server-side only)
     * Works in both Edge Runtime and Node.js environments
     */
    UnifiedCSRFProtection.setCSRFToken = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var token, cookieStore_1, error_3, isDevelopment;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0: return [4 /*yield*/, UnifiedCSRFProtection.generateAuthenticatedToken(userId)];
                    case 1:
                        token = _e.sent();
                        _e.label = 2;
                    case 2:
                        _e.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, (0, headers_1.cookies)()];
                    case 3:
                        cookieStore_1 = _e.sent();
                        cookieStore_1.set(UnifiedCSRFProtection.cookieName, token, {
                            httpOnly: false, // Must be readable by JavaScript for header inclusion
                            secure: (process.env.NODE_ENV || ((_b = (_a = globalThis.process) === null || _a === void 0 ? void 0 : _a.env) === null || _b === void 0 ? void 0 : _b.NODE_ENV)) === 'production',
                            sameSite: 'strict',
                            maxAge: 60 * 60 * 24, // 24 hours
                            path: '/',
                        });
                        return [3 /*break*/, 5];
                    case 4:
                        error_3 = _e.sent();
                        isDevelopment = (process.env.NODE_ENV || ((_d = (_c = globalThis.process) === null || _c === void 0 ? void 0 : _c.env) === null || _d === void 0 ? void 0 : _d.NODE_ENV)) === 'development';
                        if (isDevelopment) {
                            console.log('Cookie setting failed (Edge Runtime context):', error_3);
                        }
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/, token];
                }
            });
        });
    };
    /**
     * Get CSRF token from cookies (server-side only)
     */
    UnifiedCSRFProtection.getCSRFToken = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cookieStore_2, error_4;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, headers_1.cookies)()];
                    case 1:
                        cookieStore_2 = _b.sent();
                        return [2 /*return*/, ((_a = cookieStore_2.get(UnifiedCSRFProtection.cookieName)) === null || _a === void 0 ? void 0 : _a.value) || null];
                    case 2:
                        error_4 = _b.sent();
                        // Edge Runtime context might not have cookies() available
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check if an endpoint allows anonymous CSRF tokens
     */
    UnifiedCSRFProtection.isAnonymousEndpoint = function (pathname) {
        return UnifiedCSRFProtection.ANONYMOUS_TOKEN_ALLOWED_ENDPOINTS.some(function (endpoint) { return pathname === endpoint || pathname.startsWith(endpoint + '/'); });
    };
    /**
     * Check if an endpoint allows both anonymous and authenticated CSRF tokens
     */
    UnifiedCSRFProtection.isDualTokenEndpoint = function (pathname) {
        return UnifiedCSRFProtection.DUAL_TOKEN_ALLOWED_ENDPOINTS.some(function (endpoint) { return pathname === endpoint || pathname.startsWith(endpoint + '/'); });
    };
    /**
     * Verify CSRF token from request (unified validation logic)
     * Handles both anonymous and authenticated tokens appropriately
     */
    UnifiedCSRFProtection.verifyCSRFToken = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var headerToken, cookieToken, pathname, isAnonymousEndpoint, isDualTokenEndpoint, isValid, encodedPayload, payload, isValid, isTokenValid, isDoubleSubmitValid, parseError_1, encodedPayload, payload, isTokenValid, isDoubleSubmitValid, parseError_2, isDevelopment, isValid, error_5, errorMessage;
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
            return __generator(this, function (_t) {
                switch (_t.label) {
                    case 0:
                        _t.trys.push([0, 17, , 18]);
                        headerToken = request.headers.get(UnifiedCSRFProtection.headerName);
                        cookieToken = (_a = request.cookies.get(UnifiedCSRFProtection.cookieName)) === null || _a === void 0 ? void 0 : _a.value;
                        pathname = request.nextUrl.pathname;
                        isAnonymousEndpoint = UnifiedCSRFProtection.isAnonymousEndpoint(pathname);
                        isDualTokenEndpoint = UnifiedCSRFProtection.isDualTokenEndpoint(pathname);
                        if (!headerToken) {
                            // Enhanced security logging for missing header tokens
                            csrfSecurityLogger.security('csrf_header_token_missing', 'medium', {
                                action: 'csrf_validation_failed',
                                reason: 'missing_header_token',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_b = request.headers.get('user-agent')) === null || _b === void 0 ? void 0 : _b.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'csrf_attack_attempt',
                                blocked: true
                            });
                            // Record failure for security monitoring
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'missing_header_token', 'medium');
                            return [2 /*return*/, false];
                        }
                        if (!isAnonymousEndpoint) return [3 /*break*/, 2];
                        return [4 /*yield*/, UnifiedCSRFProtection.validateAnonymousToken(request, headerToken)];
                    case 1:
                        isValid = _t.sent();
                        if (!isValid) {
                            csrfSecurityLogger.security('csrf_anonymous_token_invalid', 'medium', {
                                action: 'anonymous_token_validation_failed',
                                reason: 'invalid_anonymous_token',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_c = request.headers.get('user-agent')) === null || _c === void 0 ? void 0 : _c.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'csrf_token_forgery',
                                blocked: true,
                                endpointType: 'anonymous'
                            });
                            // Record failure for security monitoring
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'anonymous_token_validation_failed', 'medium');
                        }
                        return [2 /*return*/, isValid];
                    case 2:
                        if (!isDualTokenEndpoint) return [3 /*break*/, 10];
                        _t.label = 3;
                    case 3:
                        _t.trys.push([3, 8, , 9]);
                        encodedPayload = headerToken.split('.')[0];
                        if (!encodedPayload) return [3 /*break*/, 7];
                        payload = JSON.parse(atob(encodedPayload));
                        if (!(payload.type === 'anonymous')) return [3 /*break*/, 5];
                        return [4 /*yield*/, UnifiedCSRFProtection.validateAnonymousToken(request, headerToken)];
                    case 4:
                        isValid = _t.sent();
                        if (!isValid) {
                            csrfSecurityLogger.security('csrf_dual_anonymous_token_invalid', 'medium', {
                                action: 'dual_endpoint_anonymous_validation_failed',
                                reason: 'invalid_anonymous_token_on_dual_endpoint',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_d = request.headers.get('user-agent')) === null || _d === void 0 ? void 0 : _d.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'csrf_token_forgery',
                                blocked: true,
                                endpointType: 'dual_anonymous_mode'
                            });
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'anonymous_token_validation_failed_dual_endpoint', 'medium');
                        }
                        return [2 /*return*/, isValid];
                    case 5:
                        if (!(payload.type === 'authenticated')) return [3 /*break*/, 7];
                        // Validate as authenticated token (require cookie and signature validation)
                        if (!cookieToken) {
                            csrfSecurityLogger.security('csrf_dual_cookie_token_missing', 'medium', {
                                action: 'dual_endpoint_cookie_validation_failed',
                                reason: 'missing_cookie_token_for_authenticated_token',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_e = request.headers.get('user-agent')) === null || _e === void 0 ? void 0 : _e.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'csrf_attack_attempt',
                                blocked: true,
                                endpointType: 'dual_authenticated_mode',
                                hasHeader: true,
                                hasCookie: false
                            });
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'missing_cookie_token_dual_endpoint', 'medium');
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, UnifiedCSRFProtection.validateAuthenticatedToken(headerToken)];
                    case 6:
                        isTokenValid = _t.sent();
                        if (!isTokenValid) {
                            csrfSecurityLogger.security('csrf_dual_authenticated_token_invalid', 'high', {
                                action: 'dual_endpoint_signature_validation_failed',
                                reason: 'invalid_authenticated_token_signature',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_f = request.headers.get('user-agent')) === null || _f === void 0 ? void 0 : _f.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'csrf_token_tampering',
                                blocked: true,
                                endpointType: 'dual_authenticated_mode',
                                validationStage: 'signature_verification'
                            });
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'authenticated_token_signature_invalid_dual_endpoint', 'medium');
                            return [2 /*return*/, false];
                        }
                        isDoubleSubmitValid = UnifiedCSRFProtection.constantTimeCompare(headerToken, cookieToken);
                        if (!isDoubleSubmitValid) {
                            csrfSecurityLogger.security('csrf_dual_double_submit_failed', 'high', {
                                action: 'dual_endpoint_double_submit_validation_failed',
                                reason: 'header_cookie_token_mismatch',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_g = request.headers.get('user-agent')) === null || _g === void 0 ? void 0 : _g.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'csrf_token_tampering',
                                blocked: true,
                                endpointType: 'dual_authenticated_mode',
                                validationStage: 'double_submit_cookie_verification'
                            });
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'double_submit_validation_failed_dual_endpoint', 'medium');
                        }
                        return [2 /*return*/, isDoubleSubmitValid];
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        parseError_1 = _t.sent();
                        // Enhanced token parsing failure logging
                        csrfSecurityLogger.security('csrf_token_parsing_failed', 'medium', {
                            action: 'dual_endpoint_token_parsing_failed',
                            reason: 'malformed_token_structure',
                            pathname: pathname,
                            ip: UnifiedCSRFProtection.getRequestIP(request),
                            userAgent: (_h = request.headers.get('user-agent')) === null || _h === void 0 ? void 0 : _h.substring(0, 100),
                            timestamp: new Date().toISOString(),
                            threat: 'csrf_token_tampering',
                            blocked: true,
                            endpointType: 'dual_mode',
                            parseError: parseError_1 instanceof Error ? parseError_1.message : String(parseError_1)
                        });
                        csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'token_parsing_failed_dual_endpoint', 'medium');
                        return [2 /*return*/, false];
                    case 9:
                        // If we get here, token type wasn't recognized
                        csrfSecurityLogger.security('csrf_unrecognized_token_type', 'medium', {
                            action: 'dual_endpoint_unrecognized_token_type',
                            reason: 'unknown_token_type',
                            pathname: pathname,
                            ip: UnifiedCSRFProtection.getRequestIP(request),
                            userAgent: (_j = request.headers.get('user-agent')) === null || _j === void 0 ? void 0 : _j.substring(0, 100),
                            timestamp: new Date().toISOString(),
                            threat: 'csrf_token_forgery',
                            blocked: true,
                            endpointType: 'dual_mode'
                        });
                        csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'unrecognized_token_type_dual_endpoint', 'medium');
                        return [2 /*return*/, false];
                    case 10:
                        // For authenticated endpoints, require both header and cookie tokens
                        if (!cookieToken) {
                            csrfSecurityLogger.security('csrf_cookie_token_missing', 'medium', {
                                action: 'authenticated_endpoint_cookie_validation_failed',
                                reason: 'missing_cookie_token_for_authenticated_endpoint',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_k = request.headers.get('user-agent')) === null || _k === void 0 ? void 0 : _k.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'csrf_attack_attempt',
                                blocked: true,
                                endpointType: 'authenticated',
                                hasHeader: true,
                                hasCookie: false
                            });
                            // Record failure for security monitoring
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'missing_cookie_token_authenticated_endpoint', 'medium');
                            return [2 /*return*/, false];
                        }
                        _t.label = 11;
                    case 11:
                        _t.trys.push([11, 14, , 15]);
                        encodedPayload = headerToken.split('.')[0];
                        if (!encodedPayload) return [3 /*break*/, 13];
                        payload = JSON.parse(atob(encodedPayload));
                        // Security check: prevent anonymous tokens on protected endpoints
                        if (payload.type === 'anonymous') {
                            csrfSecurityLogger.security('csrf_security_violation_anonymous_on_protected', 'high', {
                                action: 'security_violation_detected',
                                reason: 'anonymous_token_used_on_protected_endpoint',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_l = request.headers.get('user-agent')) === null || _l === void 0 ? void 0 : _l.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'privilege_escalation_attempt',
                                blocked: true,
                                endpointType: 'protected',
                                violationType: 'anonymous_token_on_authenticated_endpoint',
                                securityImpact: 'high'
                            });
                            // Record high-severity failure for security monitoring
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'anonymous_token_on_protected_endpoint', 'high');
                            return [2 /*return*/, false];
                        }
                        if (!(payload.type === 'authenticated')) return [3 /*break*/, 13];
                        return [4 /*yield*/, UnifiedCSRFProtection.validateAuthenticatedToken(headerToken)];
                    case 12:
                        isTokenValid = _t.sent();
                        if (!isTokenValid) {
                            csrfSecurityLogger.security('csrf_authenticated_token_invalid', 'high', {
                                action: 'authenticated_endpoint_signature_validation_failed',
                                reason: 'invalid_authenticated_token_signature',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_m = request.headers.get('user-agent')) === null || _m === void 0 ? void 0 : _m.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'csrf_token_tampering',
                                blocked: true,
                                endpointType: 'authenticated',
                                validationStage: 'signature_verification'
                            });
                            // Record failure for security monitoring
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'authenticated_token_signature_invalid', 'medium');
                            return [2 /*return*/, false];
                        }
                        isDoubleSubmitValid = UnifiedCSRFProtection.constantTimeCompare(headerToken, cookieToken);
                        if (!isDoubleSubmitValid) {
                            csrfSecurityLogger.security('csrf_double_submit_failed', 'high', {
                                action: 'authenticated_endpoint_double_submit_validation_failed',
                                reason: 'header_cookie_token_mismatch',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_o = request.headers.get('user-agent')) === null || _o === void 0 ? void 0 : _o.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'csrf_token_tampering',
                                blocked: true,
                                endpointType: 'authenticated',
                                validationStage: 'double_submit_cookie_verification'
                            });
                            // Record failure for security monitoring
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'double_submit_validation_failed', 'medium');
                        }
                        return [2 /*return*/, isDoubleSubmitValid];
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        parseError_2 = _t.sent();
                        isDevelopment = (process.env.NODE_ENV || ((_q = (_p = globalThis.process) === null || _p === void 0 ? void 0 : _p.env) === null || _q === void 0 ? void 0 : _q.NODE_ENV)) === 'development';
                        if (isDevelopment) {
                            console.log('CSRF token parsing failed, using legacy validation');
                        }
                        return [3 /*break*/, 15];
                    case 15:
                        isValid = UnifiedCSRFProtection.constantTimeCompare(headerToken, cookieToken);
                        if (!isValid) {
                            csrfSecurityLogger.security('csrf_legacy_token_validation_failed', 'low', {
                                action: 'legacy_token_validation_failed',
                                reason: 'legacy_double_submit_pattern_failed',
                                pathname: pathname,
                                ip: UnifiedCSRFProtection.getRequestIP(request),
                                userAgent: (_r = request.headers.get('user-agent')) === null || _r === void 0 ? void 0 : _r.substring(0, 100),
                                timestamp: new Date().toISOString(),
                                threat: 'csrf_attack_attempt',
                                blocked: true,
                                endpointType: 'authenticated_legacy',
                                validationMethod: 'simple_double_submit'
                            });
                            // Record failure for security monitoring
                            csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, 'legacy_token_validation_failed', 'low');
                        }
                        return [2 /*return*/, isValid];
                    case 16: return [3 /*break*/, 18];
                    case 17:
                        error_5 = _t.sent();
                        csrfSecurityLogger.security('csrf_verification_system_error', 'high', {
                            action: 'csrf_verification_system_failure',
                            reason: 'unexpected_error_during_verification',
                            pathname: request.nextUrl.pathname,
                            ip: UnifiedCSRFProtection.getRequestIP(request),
                            userAgent: (_s = request.headers.get('user-agent')) === null || _s === void 0 ? void 0 : _s.substring(0, 100),
                            timestamp: new Date().toISOString(),
                            threat: 'system_instability',
                            blocked: true,
                            errorType: error_5 instanceof Error ? error_5.name : 'unknown',
                            errorMessage: error_5 instanceof Error ? error_5.message : String(error_5),
                            systemError: true
                        });
                        errorMessage = error_5 instanceof Error ? error_5.message : 'unknown_error';
                        csrf_monitoring_1.CSRFSecurityMonitor.recordFailure(request, "verification_error_".concat(errorMessage), 'medium');
                        return [2 /*return*/, false];
                    case 18: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check if request method requires CSRF protection
     */
    UnifiedCSRFProtection.requiresCSRFProtection = function (method) {
        return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
    };
    /**
     * Constant-time string comparison to prevent timing attacks
     */
    UnifiedCSRFProtection.constantTimeCompare = function (a, b) {
        if (a.length !== b.length) {
            return false;
        }
        var result = 0;
        for (var i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    };
    /**
     * Generate simple CSRF token for backward compatibility
     */
    UnifiedCSRFProtection.generateToken = function () {
        return (0, nanoid_1.nanoid)(UnifiedCSRFProtection.tokenLength);
    };
    UnifiedCSRFProtection.cookieName = 'csrf-token';
    UnifiedCSRFProtection.headerName = 'x-csrf-token';
    UnifiedCSRFProtection.tokenLength = 32;
    /**
     * Endpoints that allow anonymous CSRF tokens
     * All other endpoints require authenticated tokens
     */
    UnifiedCSRFProtection.ANONYMOUS_TOKEN_ALLOWED_ENDPOINTS = [
        '/api/auth/register',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/api/contact' // Public contact forms
    ];
    /**
     * Endpoints that allow both anonymous AND authenticated CSRF tokens
     * These endpoints need to handle both logged-in and non-logged-in users
     */
    UnifiedCSRFProtection.DUAL_TOKEN_ALLOWED_ENDPOINTS = [
        '/api/auth/login' // Users might login while already authenticated (re-auth, account switching)
    ];
    return UnifiedCSRFProtection;
}());
exports.UnifiedCSRFProtection = UnifiedCSRFProtection;
