import type { NextRequest } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { cspViolationReportSchema } from '@/lib/validations/admin-cache';

/**
 * CSP Violation Report Endpoint
 * Receives and logs Content Security Policy violation reports
 * Used for monitoring and debugging CSP policy effectiveness
 *
 * CURRENT CSP POLICY (Production):
 * - script-src: Strict nonce-based protection (no unsafe-inline)
 * - style-src: unsafe-inline ONLY (no nonces, no hashes)
 *
 * CRITICAL CSP BEHAVIOR:
 * Per W3C CSP spec, when ANY nonce or hash is present in a directive,
 * unsafe-inline is IGNORED by the browser. This caused production errors.
 *
 * STYLE-SRC RATIONALE:
 * - Dynamic inline styles required for UI libraries and user customization
 * - Security: Inline styles cannot execute JavaScript (low XSS risk)
 * - Scripts remain strictly protected (nonces still required)
 *
 * See: lib/security/headers.ts for full CSP configuration
 */

const postHandler = async (request: NextRequest) => {
  try {
    // Parse and validate the CSP violation report
    const body = await request.json();
    const report = cspViolationReportSchema.parse(body);

    // Handle both standard and non-standard CSP report formats
    // The csp-report field may be missing if browser sends non-standard format
    const violation = report['csp-report'] ?? (report as typeof report['csp-report']);

    if (!violation || !violation?.['violated-directive']) {
      log.info('Invalid CSP report format received', {
        report: report,
        hasStandardFormat: !!report['csp-report'],
        violationKeys: Object.keys(violation || {}),
      });
      return createSuccessResponse({ received: true }, 'CSP report received (invalid format)');
    }

    // Log the violation with appropriate severity
    const violationType = violation['violated-directive'] ?? '';
    const isScriptViolation = violationType.includes('script-src');
    const isStyleViolation = violationType.includes('style-src');

    // High severity for script violations (potential XSS)
    if (isScriptViolation) {
      log.security('csp_script_violation', 'critical', {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        sourceFile: violation['source-file'],
        lineNumber: violation['line-number'],
        columnNumber: violation['column-number'],
        scriptSample: violation['script-sample'],
        userAgent: request.headers.get('user-agent'),
        referer: violation.referrer,
      });
    } else if (isStyleViolation) {
      log.security('csp_style_violation', 'medium', {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        sourceFile: violation['source-file'],
        lineNumber: violation['line-number'],
        columnNumber: violation['column-number'],
        userAgent: request.headers.get('user-agent'),
        referer: violation.referrer,
      });
    } else {
      log.security('csp_violation', 'low', {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        sourceFile: violation['source-file'],
      });
    }

    // Check if this is a practice page violation (critical for business)
    const documentUri = violation['document-uri'] ?? '';
    const isPracticePage = documentUri.includes('/practice/');
    if (isPracticePage) {
      log.security('csp_practice_page_violation', 'critical', {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        businessImpact: true,
        practicePageAffected: true,
      });
    }

    // Development-only debug logging for immediate visibility
    if (process.env.NODE_ENV === 'development') {
      log.warn('csp violation in development', {
        directive: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        document: violation['document-uri'],
        line: violation['line-number'],
        component: 'security',
        operation: 'csp_report',
      });
    }

    return createSuccessResponse({ received: true }, 'CSP report received');
  } catch (error) {
    log.error('Failed to process CSP violation report', error);
    return handleRouteError(error, 'Failed to process CSP report', request);
  }
};

const getHandler = async (request: NextRequest) => {
  return createErrorResponse('Method not allowed', 405, request);
};

// CSP reports are sent by browsers automatically when violations occur
// Cannot include authentication headers, so must be public
export const POST = publicRoute(
  postHandler,
  'CSP violation reporting endpoint - browsers send these automatically',
  { rateLimit: 'api' }
);

export const GET = publicRoute(
  getHandler,
  'CSP violation reporting endpoint - GET not allowed',
  { rateLimit: 'api' }
);
