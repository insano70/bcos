# Phase 2 Migration Target Files Catalog

## Overview

Phase 2 targets **41 critical API files** across authentication, core services, middleware, and high-traffic endpoints. This catalog provides the complete migration roadmap for transforming the API infrastructure to universal logging.

## 🔐 Authentication Routes (Priority 1) - 6 Files

### **Core Authentication Endpoints**
| File | Current Logger | Complexity | Enhancement Focus |
|------|----------------|------------|-------------------|
| `app/api/auth/login/route.ts` | Partial migration | HIGH | Security correlation, risk scoring |
| `app/api/auth/logout/route.ts` | Basic API logger | MEDIUM | Session cleanup, security events |
| `app/api/auth/refresh/route.ts` | Basic API logger | HIGH | Token security, rotation logging |
| `app/api/auth/sessions/route.ts` | Basic API logger | MEDIUM | Session lifecycle management |
| `app/api/auth/me/route.ts` | No structured logging | LOW | User context retrieval logging |

### **CSRF Protection Endpoints**  
| File | Current Logger | Complexity | Enhancement Focus |
|------|----------------|------------|-------------------|
| `app/api/csrf/route.ts` | Basic logging | LOW | Token generation security |
| `app/api/csrf/validate/route.ts` | Basic logging | LOW | Validation event correlation |

**Authentication Enhancement Goals**:
- **Security Event Correlation**: Track authentication patterns and anomalies
- **Risk Assessment**: Implement automatic risk scoring for login attempts
- **Business Intelligence**: User authentication behavior analytics
- **Performance Optimization**: Detailed timing breakdown for auth flows

## 🔧 Core API Services (Priority 2) - 4 Files

### **Business Logic Services**
| File | Current Logger | Lines | Enhancement Focus |
|------|----------------|-------|-------------------|
| `lib/api/services/audit.ts` | Winston logger | ~150 | Business intelligence integration |
| `lib/api/services/email.ts` | Winston logger | ~400 | Email delivery and template analytics |
| `lib/api/services/session.ts` | Winston logger | ~250 | Session lifecycle and security |
| `lib/api/services/upload.ts` | Winston logger | ~300 | File operations and security |

**Service Enhancement Goals**:
- **Business Process Tracking**: Complete business operation lifecycle logging
- **External API Monitoring**: Email service, file storage, third-party integrations
- **Compliance Logging**: HIPAA-compliant audit trails for all operations
- **Performance Analytics**: Service response time and optimization metrics

## 🛡️ API Middleware (Priority 3) - 8 Files

### **Security & Validation Middleware**
| File | Current Logger | Migration Status | Enhancement Focus |
|------|----------------|------------------|-------------------|
| `lib/api/middleware/auth.ts` | Winston logger | PENDING | JWT validation enhancement |
| `lib/api/middleware/global-auth.ts` | Mixed logging | PENDING | Global auth event correlation |
| `lib/api/middleware/jwt-auth.ts` | Winston logger | PENDING | Token security and validation |
| `lib/api/middleware/rate-limit.ts` | Basic logging | PENDING | Rate limiting analytics |
| `lib/api/middleware/validation.ts` | Basic logging | PENDING | Input validation tracking |
| `lib/api/middleware/csrf-validation.ts` | Basic logging | PENDING | CSRF validation enhancement |
| `lib/api/middleware/step-up-auth.ts` | Basic logging | PENDING | Step-up authentication logging |
| `lib/api/middleware/request-sanitization.ts` | ✅ MIGRATED | COMPLETE | ✅ Already enhanced |

**Middleware Enhancement Goals**:
- **Security Pipeline Logging**: Complete authentication pipeline visibility
- **Performance Monitoring**: Middleware processing time optimization
- **Threat Detection**: Enhanced security event correlation across middleware
- **Compliance Tracking**: Regulatory requirement validation logging

## 🌐 High-Traffic Endpoints (Priority 4) - 23 Files

### **Core Business APIs**
| Category | Files | Current Logger | Priority |
|----------|-------|----------------|----------|
| **User Management** | 2 files | Mixed | HIGH |
| `app/api/users/route.ts` | Winston logger | User lifecycle operations |
| `app/api/users/[id]/route.ts` | Winston logger | Individual user operations |

### **Practice Management APIs**  
| Category | Files | Current Logger | Priority |
|----------|-------|----------------|----------|
| **Practice Operations** | 5 files | Mixed | HIGH |
| `app/api/practices/route.ts` | Winston logger | Practice CRUD operations |
| `app/api/practices/[id]/route.ts` | Winston logger | Individual practice management |
| `app/api/practices/[id]/staff/route.ts` | Winston logger | Staff management |
| `app/api/practices/[id]/staff/[staffId]/route.ts` | Winston logger | Individual staff operations |
| `app/api/practices/[id]/staff/reorder/route.ts` | Winston logger | Staff ordering operations |

### **File & Content Management**
| Category | Files | Current Logger | Priority |
|----------|-------|----------------|----------|
| **Upload Operations** | 1 file | RBAC route | HIGH |
| `app/api/upload/route.ts` | RBAC logger | File upload security and analytics |

### **Search & Discovery**
| Category | Files | Current Logger | Priority |
|----------|-------|----------------|----------|
| **Search APIs** | 1 file | Winston logger | MEDIUM |
| `app/api/search/route.ts` | Winston logger | Search analytics and performance |

### **System & Health**
| Category | Files | Current Logger | Priority |
|----------|-------|----------------|----------|
| **Health Monitoring** | 2 files | Basic logging | LOW |
| `app/api/health/route.ts` | Basic logging | System health monitoring |
| `app/api/health/db/route.ts` | Basic logging | Database health monitoring |

### **Analytics & Reporting APIs**
| Category | Files | Current Logger | Priority |
|----------|-------|----------------|----------|
| **Admin Analytics** | 12 files | Mixed | MEDIUM |
| `app/api/admin/analytics/system/route.ts` | API logger | System metrics analytics |
| `app/api/admin/analytics/users/route.ts` | API logger | User behavior analytics |
| `app/api/admin/analytics/practices/route.ts` | API logger | Practice analytics |
| `app/api/admin/analytics/charts/route.ts` | API logger | Chart configuration analytics |
| `app/api/admin/analytics/charts/[chartId]/route.ts` | API logger | Individual chart analytics |
| `app/api/admin/analytics/dashboards/route.ts` | API logger | Dashboard analytics |
| `app/api/admin/analytics/dashboards/[dashboardId]/route.ts` | API logger | Individual dashboard analytics |
| `app/api/admin/analytics/favorites/route.ts` | API logger | User favorites analytics |
| `app/api/admin/analytics/categories/route.ts` | API logger | Category analytics |
| `app/api/admin/analytics/measures/route.ts` | API logger | Measures analytics |
| `app/api/admin/analytics/explore/route.ts` | API logger | Data exploration analytics |
| `app/api/admin/analytics/debug/route.ts` | API logger | Debug analytics |

## 📊 Migration Complexity Analysis

### **High Complexity (Requires Custom Enhancement)** - 8 files
- `app/api/auth/login/route.ts` - Complex authentication flow
- `app/api/auth/refresh/route.ts` - Token rotation security
- `lib/api/services/audit.ts` - Audit system integration
- `lib/api/services/email.ts` - External service integration
- `lib/api/rbac-route-handler.ts` - Security-critical RBAC system
- `app/api/upload/route.ts` - File security and compliance
- `app/api/search/route.ts` - Search analytics and performance
- `lib/api/middleware/jwt-auth.ts` - JWT security enhancement

### **Medium Complexity (Standard Enhancement)** - 18 files
- Authentication routes (logout, sessions, me, csrf)
- API services (session, upload)
- Most API middleware components
- Practice management APIs
- User management APIs

### **Low Complexity (Direct Migration)** - 15 files
- Health monitoring endpoints
- Simple analytics endpoints
- Template management
- Role management
- Basic CRUD operations

## 🎯 Phase 2 Success Criteria

### **Technical Criteria**
- [ ] All 41 files migrated to universal logger
- [ ] Enhanced authentication logging with security correlation
- [ ] Business intelligence logging across all business operations
- [ ] Performance impact <2% of API response time baseline
- [ ] Memory usage increase <20MB total
- [ ] Zero security logging gaps

### **Security Criteria**
- [ ] 100% authentication event coverage with enhanced metadata
- [ ] Real-time threat detection across all API endpoints
- [ ] Comprehensive audit trail for regulatory compliance
- [ ] Security event correlation for attack pattern detection
- [ ] Automatic alerting for security anomalies

### **Business Intelligence Criteria**
- [ ] User behavior analytics across all user-facing APIs
- [ ] API performance analytics with optimization recommendations
- [ ] Business process monitoring with success/failure tracking
- [ ] External service integration monitoring
- [ ] Compliance reporting automation

## 📈 Expected Impact

### **Security Improvements**
- **50% faster security incident detection** with real-time correlation
- **100% audit compliance** with automated regulatory reporting
- **Advanced threat detection** with behavioral analysis
- **Zero security blind spots** across API infrastructure

### **Performance Benefits**
- **API response time monitoring** with automatic optimization recommendations
- **Database query optimization** with performance correlation
- **External service monitoring** with dependency tracking
- **Memory and resource optimization** with usage analytics

### **Business Intelligence**
- **User journey analytics** across all touchpoints
- **Feature usage analytics** for product optimization
- **API adoption metrics** for engineering priorities
- **Compliance reporting automation** for regulatory requirements

## 🗓️ Implementation Timeline

### **Week 2: Core Infrastructure**
- **Days 1-2**: Authentication routes migration
- **Days 3-4**: API services migration  
- **Day 5**: API middleware migration + testing

### **Week 3: High-Traffic APIs**
- **Days 6-7**: RBAC and user management APIs
- **Days 8-9**: Practice, upload, search APIs
- **Day 10**: Analytics APIs + validation

**Total Estimated Effort**: 2 weeks with 2 developers + QA support
