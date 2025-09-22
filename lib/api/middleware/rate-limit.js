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
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRateLimiter = exports.authRateLimiter = exports.globalRateLimiter = void 0;
exports.getRateLimitKey = getRateLimitKey;
exports.applyRateLimit = applyRateLimit;
exports.addRateLimitHeaders = addRateLimitHeaders;
var error_1 = require("../responses/error");
var InMemoryRateLimiter = /** @class */ (function () {
    function InMemoryRateLimiter(windowMs, maxRequests) {
        if (windowMs === void 0) { windowMs = 15 * 60 * 1000; }
        if (maxRequests === void 0) { maxRequests = 100; }
        var _this = this;
        this.store = new Map();
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        // Clean up expired entries every 5 minutes
        setInterval(function () { return _this.cleanup(); }, 5 * 60 * 1000);
    }
    InMemoryRateLimiter.prototype.cleanup = function () {
        var now = Date.now();
        for (var _i = 0, _a = Array.from(this.store.entries()); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], entry = _b[1];
            if (now > entry.resetTime) {
                this.store.delete(key);
            }
        }
    };
    InMemoryRateLimiter.prototype.checkLimit = function (identifier) {
        var now = Date.now();
        var resetTime = now + this.windowMs;
        var existing = this.store.get(identifier);
        if (!existing || now > existing.resetTime) {
            this.store.set(identifier, { count: 1, resetTime: resetTime });
            return { success: true, remaining: this.maxRequests - 1, resetTime: resetTime };
        }
        existing.count++;
        var remaining = Math.max(0, this.maxRequests - existing.count);
        return {
            success: existing.count <= this.maxRequests,
            remaining: remaining,
            resetTime: existing.resetTime
        };
    };
    return InMemoryRateLimiter;
}());
// Rate limiter instances
exports.globalRateLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 100); // 100 req/15min
exports.authRateLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 20); // 20 req/15min (increased for refresh tokens)
exports.apiRateLimiter = new InMemoryRateLimiter(60 * 1000, 30); // 30 req/min
function getRateLimitKey(request, prefix) {
    if (prefix === void 0) { prefix = ''; }
    var ip = request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'anonymous';
    return prefix ? "".concat(prefix, ":").concat(ip) : ip;
}
function applyRateLimit(request_1) {
    return __awaiter(this, arguments, void 0, function (request, type) {
        var rateLimitKey, limiter, limit, windowMs, result, error;
        if (type === void 0) { type = 'api'; }
        return __generator(this, function (_a) {
            rateLimitKey = getRateLimitKey(request, type);
            limiter = exports.apiRateLimiter;
            limit = 30;
            windowMs = 60 * 1000;
            switch (type) {
                case 'auth':
                    limiter = exports.authRateLimiter;
                    limit = 5;
                    windowMs = 15 * 60 * 1000;
                    break;
                case 'upload':
                    limiter = new InMemoryRateLimiter(60 * 1000, 10); // 10 uploads per minute
                    limit = 10;
                    windowMs = 60 * 1000;
                    break;
                case 'api':
                    limit = 30;
                    windowMs = 60 * 1000;
                    break;
            }
            result = limiter.checkLimit(rateLimitKey);
            if (!result.success) {
                error = (0, error_1.RateLimitError)(result.resetTime);
                // Add additional context to the error
                error.details = {
                    limit: limit,
                    windowMs: windowMs,
                    resetTime: result.resetTime,
                    retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
                    type: type
                };
                throw error;
            }
            return [2 /*return*/, __assign(__assign({}, result), { limit: limit, windowMs: windowMs })];
        });
    });
}
function addRateLimitHeaders(response, result) {
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());
    if (result.limit !== undefined) {
        response.headers.set('X-RateLimit-Limit', result.limit.toString());
    }
    if (result.windowMs !== undefined) {
        response.headers.set('X-RateLimit-Window', Math.ceil(result.windowMs / 1000).toString());
    }
    response.headers.set('X-RateLimit-Policy', 'sliding-window');
    // Add retry-after header if rate limited
    if (result.remaining === 0) {
        var retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
        response.headers.set('Retry-After', Math.max(1, retryAfter).toString());
    }
}
