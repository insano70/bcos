#!/usr/bin/env tsx

/**
 * API Security Audit Script
 * Automatically scans all API endpoints and generates a security report
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface SecurityIssue {
  endpoint: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  issue: string;
  line?: number;
  recommendation: string;
}

interface EndpointInfo {
  path: string;
  methods: string[];
  hasAuthentication: boolean;
  hasRBAC: boolean;
  permissions: string[];
  hasRateLimit: boolean;
  hasCSRF: boolean;
  isPublic: boolean;
  publicReason?: string;
}

class APISecurityAuditor {
  private issues: SecurityIssue[] = [];
  private endpoints: EndpointInfo[] = [];
  
  async scanDirectory(dir: string, basePath: string = ''): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and other non-API directories
        if (!['node_modules', '.next', '.git'].includes(entry.name)) {
          await this.scanDirectory(fullPath, join(basePath, entry.name));
        }
      } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
        await this.analyzeEndpoint(fullPath, basePath);
      }
    }
  }
  
  async analyzeEndpoint(filePath: string, apiPath: string): Promise<void> {
    const content = await readFile(filePath, 'utf-8');
    // Ensure proper API path formatting
    const cleanApiPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    const endpoint = `/api${cleanApiPath}`;
    
    const info: EndpointInfo = {
      path: endpoint,
      methods: this.extractMethods(content),
      hasAuthentication: false,
      hasRBAC: false,
      permissions: [],
      hasRateLimit: false,
      hasCSRF: false,
      isPublic: false
    };
    
    // Check for authentication patterns (including all RBAC route wrappers)
    const rbacPatterns = [
      'rbacRoute', 'practiceRoute', 'userRoute', 'superAdminRoute', 
      'orgAdminRoute', 'analyticsRoute', 'publicRoute', 'requireAuth',
      'getServerSession'
    ];
    
    info.hasAuthentication = rbacPatterns.some(pattern => content.includes(pattern));
    
    // Check for RBAC (any of the RBAC route wrappers)
    const rbacRoutePatterns = [
      'rbacRoute', 'practiceRoute', 'userRoute', 'superAdminRoute', 
      'orgAdminRoute', 'analyticsRoute'
    ];
    
    info.hasRBAC = rbacRoutePatterns.some(pattern => content.includes(pattern));
    if (info.hasRBAC) {
      info.permissions = this.extractPermissions(content);
    }
    
    // Check for public routes
    info.isPublic = content.includes('publicRoute');
    if (info.isPublic) {
      const reason = this.extractPublicReason(content);
      if (reason) {
        info.publicReason = reason;
      }
    }
    
    // Check for rate limiting (both configuration and direct calls)
    info.hasRateLimit = content.includes('rateLimit:') || content.includes('applyRateLimit(');
    
    // Check for CSRF (should be handled by middleware now)
    info.hasCSRF = content.includes('CSRFProtection') || content.includes('withCSRFProtection');
    
    this.endpoints.push(info);
    
    // Run security checks
    this.checkAuthentication(info, content);
    this.checkInputValidation(info, content);
    this.checkErrorHandling(info, content);
    this.checkSensitiveData(info, content);
    this.checkRateLimit(info, content);
  }
  
  extractMethods(content: string): string[] {
    const methods: string[] = [];
    const methodPattern = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g;
    let match;
    
    while ((match = methodPattern.exec(content)) !== null) {
      if (match[1]) {
        methods.push(match[1]);
      }
    }
    
    return methods;
  }
  
  extractPermissions(content: string): string[] {
    const permissions: string[] = [];
    const permissionPattern = /permission:\s*(\[[\s\S]*?\]|['"`][\w:]+['"`])/g;
    let match;
    
    while ((match = permissionPattern.exec(content)) !== null) {
      const permStr = match[1];
      if (permStr) {
        if (permStr.startsWith('[')) {
          // Array of permissions
          const perms = permStr.match(/['"`]([\w:]+)['"`]/g);
          if (perms) {
            permissions.push(...perms.map(p => p.replace(/['"`]/g, '')));
          }
        } else {
          // Single permission
          permissions.push(permStr.replace(/['"`]/g, ''));
        }
      }
    }
    
    return permissions;
  }
  
  extractPublicReason(content: string): string | undefined {
    const reasonMatch = content.match(/publicRoute\s*\([^,]+,\s*['"`]([^'"`]+)['"`]/);
    return reasonMatch ? reasonMatch[1] : undefined;
  }
  
  checkAuthentication(info: EndpointInfo, content: string): void {
    // Check if endpoint should have auth but doesn't
    const shouldHaveAuth = !info.isPublic && 
                          !info.path.includes('/health') &&
                          !info.path.includes('/csrf') &&
                          !info.path.includes('/auth/login') &&
                          !info.path.includes('/auth/register');
    
    if (shouldHaveAuth && !info.hasAuthentication) {
      this.issues.push({
        endpoint: info.path,
        severity: 'critical',
        issue: 'Missing authentication',
        recommendation: 'Use rbacRoute wrapper or add authentication check'
      });
    }
    
    // Check public endpoints have documented reasons
    if (info.isPublic && !info.publicReason) {
      this.issues.push({
        endpoint: info.path,
        severity: 'medium',
        issue: 'Public endpoint without documented reason',
        recommendation: 'Add reason parameter to publicRoute wrapper'
      });
    }
  }
  
  checkInputValidation(info: EndpointInfo, content: string): void {
    const hasMutationMethod = info.methods.some(m => ['POST', 'PUT', 'PATCH'].includes(m));
    
    if (hasMutationMethod) {
      // Check for validation patterns (expanded list)
      const validationPatterns = [
        'z.object', 'zod', '.parse(', '.safeParse(',
        'validateRequest', 'validateQuery', 'validateBody',
        'schema.validate', 'joi.validate', 'yup.validate',
        'Schema', 'validation', 'validator'
      ];
      
      const hasValidation = validationPatterns.some(pattern => 
        content.includes(pattern) || content.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (!hasValidation) {
        this.issues.push({
          endpoint: info.path,
          severity: 'high',
          issue: 'No input validation detected for mutation endpoint',
          recommendation: 'Add Zod schema validation for request body'
        });
      }
    }
  }
  
  checkErrorHandling(info: EndpointInfo, content: string): void {
    // Check for exposed stack traces (more sophisticated check)
    const hasStackExposure = content.includes('error.stack') && 
                            !content.includes('NODE_ENV') && 
                            !content.includes('process.env.NODE_ENV') &&
                            !content.includes('development');
    
    if (hasStackExposure) {
      this.issues.push({
        endpoint: info.path,
        severity: 'high',
        issue: 'Potential stack trace exposure in production',
        recommendation: 'Only expose stack traces in development environment'
      });
    }
    
    // Check for proper error responses (but be less strict)
    const hasErrorHandling = content.includes('createErrorResponse') ||
                             content.includes('NextResponse.json') ||
                             content.includes('Response(');
    
    if (!hasErrorHandling && info.methods.length > 0) {
      this.issues.push({
        endpoint: info.path,
        severity: 'low',
        issue: 'No structured error handling detected',
        recommendation: 'Use createErrorResponse for consistent error handling'
      });
    }
  }
  
  checkSensitiveData(info: EndpointInfo, content: string): void {
    // Check for potential password exposure
    if (content.match(/password['"]\s*:/i) && !content.includes('bcrypt')) {
      this.issues.push({
        endpoint: info.path,
        severity: 'critical',
        issue: 'Potential password exposure without hashing',
        recommendation: 'Always hash passwords with bcrypt before storage or transmission'
      });
    }
    
    // Check for console.log of sensitive data
    if (content.includes('console.log') && 
        (content.includes('password') || content.includes('token') || content.includes('secret'))) {
      this.issues.push({
        endpoint: info.path,
        severity: 'high',
        issue: 'Potential sensitive data in console.log',
        recommendation: 'Remove console.log statements that might expose sensitive data'
      });
    }
  }
  
  checkRateLimit(info: EndpointInfo, content: string): void {
    // Special endpoints that need rate limiting
    const needsRateLimit = info.path.includes('/auth/') || 
                          info.path.includes('/upload') ||
                          info.path.includes('/api/');
    
    if (needsRateLimit && !info.hasRateLimit) {
      this.issues.push({
        endpoint: info.path,
        severity: 'medium',
        issue: 'Missing rate limiting',
        recommendation: 'Add rateLimit option to route configuration'
      });
    }
  }
  
  generateReport(): void {
    console.log('='.repeat(80));
    console.log('API SECURITY AUDIT REPORT');
    console.log('='.repeat(80));
    console.log(`Date: ${new Date().toISOString()}`);
    console.log(`Total Endpoints Scanned: ${this.endpoints.length}`);
    console.log(`Total Issues Found: ${this.issues.length}`);
    console.log();
    
    // Summary by severity
    const severityCounts = {
      critical: this.issues.filter(i => i.severity === 'critical').length,
      high: this.issues.filter(i => i.severity === 'high').length,
      medium: this.issues.filter(i => i.severity === 'medium').length,
      low: this.issues.filter(i => i.severity === 'low').length
    };
    
    console.log('ISSUE SUMMARY BY SEVERITY:');
    console.log(`  Critical: ${severityCounts.critical}`);
    console.log(`  High: ${severityCounts.high}`);
    console.log(`  Medium: ${severityCounts.medium}`);
    console.log(`  Low: ${severityCounts.low}`);
    console.log();
    
    // Endpoint summary
    console.log('ENDPOINT SUMMARY:');
    console.log(`  Public Endpoints: ${this.endpoints.filter(e => e.isPublic).length}`);
    console.log(`  Protected Endpoints: ${this.endpoints.filter(e => e.hasAuthentication).length}`);
    console.log(`  RBAC-Enabled Endpoints: ${this.endpoints.filter(e => e.hasRBAC).length}`);
    console.log(`  Rate-Limited Endpoints: ${this.endpoints.filter(e => e.hasRateLimit).length}`);
    console.log();
    
    // Detailed issues
    if (this.issues.length > 0) {
      console.log('DETAILED SECURITY ISSUES:');
      console.log('-'.repeat(80));
      
      // Sort by severity
      const sortedIssues = this.issues.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
      
      for (const issue of sortedIssues) {
        console.log(`\n[${issue.severity.toUpperCase()}] ${issue.endpoint}`);
        console.log(`Issue: ${issue.issue}`);
        console.log(`Recommendation: ${issue.recommendation}`);
      }
    } else {
      console.log('✅ No security issues found!');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('RECOMMENDATIONS:');
    console.log('1. Address all CRITICAL issues immediately');
    console.log('2. Plan remediation for HIGH issues within the current sprint');
    console.log('3. Include MEDIUM issues in technical debt backlog');
    console.log('4. Review LOW issues during regular code reviews');
    console.log('='.repeat(80));
  }
}

// Main execution
async function main() {
  const auditor = new APISecurityAuditor();
  const apiDir = join(process.cwd(), 'app', 'api');
  
  console.log('Starting API Security Audit...');
  console.log(`Scanning directory: ${apiDir}`);
  console.log();
  
  try {
    await auditor.scanDirectory(apiDir);
    auditor.generateReport();
  } catch (error) {
    console.error('Error during audit:', error);
    process.exit(1);
  }
}

// Run the audit
main().catch(console.error);
