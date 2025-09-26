import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger/api-features'

/**
 * CSP Violation Report Endpoint
 * Receives and logs Content Security Policy violation reports
 * Used for monitoring and debugging CSP policy effectiveness
 */

interface CSPViolationReport {
  'csp-report': {
    'document-uri': string
    'violated-directive': string
    'blocked-uri': string
    'source-file': string
    'line-number': number
    'column-number': number
    'status-code': number
    referrer: string
    'script-sample': string
  }
}

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request)
  
  try {
    // Parse the CSP violation report
    const report: CSPViolationReport = await request.json()
    const violation = report['csp-report']
    
    if (!violation) {
      logger.warn('Invalid CSP report format received', { report })
      return NextResponse.json({ error: 'Invalid report format' }, { status: 400 })
    }
    
    // Log the violation with appropriate severity
    const violationType = violation['violated-directive']
    const isScriptViolation = violationType?.includes('script-src')
    const isStyleViolation = violationType?.includes('style-src')
    
    // High severity for script violations (potential XSS)
    if (isScriptViolation) {
      logger.error('CSP Script Violation Detected', {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        sourceFile: violation['source-file'],
        lineNumber: violation['line-number'],
        columnNumber: violation['column-number'],
        scriptSample: violation['script-sample'],
        userAgent: request.headers.get('user-agent'),
        referer: violation.referrer,
        severity: 'critical'
      })
    } else if (isStyleViolation) {
      logger.warn('CSP Style Violation Detected', {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        sourceFile: violation['source-file'],
        lineNumber: violation['line-number'],
        columnNumber: violation['column-number'],
        userAgent: request.headers.get('user-agent'),
        referer: violation.referrer,
        severity: 'medium'
      })
    } else {
      logger.info('CSP Violation Detected', {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        sourceFile: violation['source-file'],
        severity: 'low'
      })
    }
    
    // Check if this is a practice page violation (critical for business)
    const isPracticePage = violation['document-uri']?.includes('/practice/')
    if (isPracticePage) {
      logger.error('CSP Violation on Practice Page - Business Impact', {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        severity: 'critical',
        businessImpact: true,
        practicePageAffected: true
      })
    }
    
    // In development, also log to console for immediate visibility
    if (process.env.NODE_ENV === 'development') {
      console.warn('🚨 CSP Violation:', {
        directive: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        document: violation['document-uri'],
        line: violation['line-number']
      })
    }
    
    return NextResponse.json({ received: true }, { status: 204 })
    
  } catch (error) {
    logger.error('Failed to process CSP violation report', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// CSP reports are always POST requests
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
