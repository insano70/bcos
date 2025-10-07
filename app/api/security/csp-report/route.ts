import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';

/**
 * CSP Violation Report Endpoint
 * Receives and logs Content Security Policy violation reports
 * Used for monitoring and debugging CSP policy effectiveness
 */

interface CSPViolationReport {
  'csp-report': {
    'document-uri': string;
    'violated-directive': string;
    'blocked-uri': string;
    'source-file': string;
    'line-number': number;
    'column-number': number;
    'status-code': number;
    referrer: string;
    'script-sample': string;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Parse the CSP violation report
    const report: CSPViolationReport = await request.json();

    // Handle both standard and non-standard CSP report formats
    const violation = report['csp-report'] || report;

    if (!violation || !violation['violated-directive']) {
      log.info('Invalid CSP report format received', {
        report: report,
        hasStandardFormat: !!report['csp-report'],
        violationKeys: Object.keys(violation || {}),
      });
      return createSuccessResponse({ received: true }, 'CSP report received (invalid format)');
    }

    // Log the violation with appropriate severity
    const violationType = violation['violated-directive'];
    const isScriptViolation = violationType?.includes('script-src');
    const isStyleViolation = violationType?.includes('style-src');

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
    const isPracticePage = violation['document-uri']?.includes('/practice/');
    if (isPracticePage) {
      log.security('csp_practice_page_violation', 'critical', {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        businessImpact: true,
        practicePageAffected: true,
      });
    }

    // In development, also log to console for immediate visibility
    if (process.env.NODE_ENV === 'development') {
      console.warn('🚨 CSP Violation:', {
        directive: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        document: violation['document-uri'],
        line: violation['line-number'],
      });
    }

    return createSuccessResponse({ received: true }, 'CSP report received');
  } catch (error) {
    log.error('Failed to process CSP violation report', error);
    return createErrorResponse('Internal server error', 500, request);
  }
}

// CSP reports are always POST requests
export async function GET(request: NextRequest) {
  return createErrorResponse('Method not allowed', 405, request);
}
