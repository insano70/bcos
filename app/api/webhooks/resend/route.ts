import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { webhookRoute } from '@/lib/api/rbac-route-handler'
import { AuditLogger } from '@/lib/api/services/audit'
import { 
  createAPILogger, 
  logSecurityEvent, 
  logPerformanceMetric
} from '@/lib/logger'

/**
 * Resend Webhook Handler
 * Processes email delivery events and bounces
 */

/**
 * Verify Resend webhook signature
 */
async function verifyResendWebhookSignature(request: NextRequest, body: string): Promise<boolean> {
  const logger = createAPILogger(request)
  const headerList = await headers()
  const signature = headerList.get('resend-signature')
  
  if (!signature) {
    logger.warn('Resend webhook missing signature')
    logSecurityEvent(logger, 'webhook_missing_signature', 'medium', {
      source: 'resend'
    })
    return false
  }

  if (!process.env.RESEND_WEBHOOK_SECRET) {
    logger.error('Resend webhook secret not configured')
    logSecurityEvent(logger, 'webhook_config_missing', 'critical', {
      source: 'resend'
    })
    
    await AuditLogger.logSecurity({
      action: 'webhook_config_missing',
      metadata: { source: 'resend', reason: 'RESEND_WEBHOOK_SECRET not configured' },
      severity: 'critical'
    })
    return false
  }

  try {
    // TODO: Replace with actual Resend SDK signature verification
    // const isValid = verifyWebhookSignature(body, signature, process.env.RESEND_WEBHOOK_SECRET)
    
    // For now, basic check that secret exists
    return !!process.env.RESEND_WEBHOOK_SECRET && signature.length > 0
  } catch (error) {
    logger.error('Resend signature verification error', error)
    return false
  }
}

const resendWebhookHandler = async (request: NextRequest, event: any, rawBody: string) => {
  const logger = createAPILogger(request)
  
  logger.info('Processing Resend webhook event', {
    eventType: event.type,
    eventId: event.id
  })

  try {

    // Check for idempotency key to prevent duplicate processing
    const idempotencyKey = request.headers.get('idempotency-key') || event.id
    // Note: In a production system, you'd store processed webhook IDs to prevent duplicates

    // Rate limiting for webhooks (different from API rate limiting)
    const clientIP = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown'

    // Log webhook received with security context
    await AuditLogger.logSystem({
      action: 'webhook_received',
      metadata: {
        source: 'resend',
        eventType: event.type,
        eventId: event.id,
        idempotencyKey,
        clientIP,
        userAgent: request.headers.get('user-agent')
      },
      severity: 'low'
    })

    // Process different event types
    switch (event.type) {
      case 'email.sent':
        await handleEmailSent(event)
        break
        
      case 'email.delivered':
        await handleEmailDelivered(event)
        break
        
      case 'email.bounced':
        await handleEmailBounced(event)
        break
        
      case 'email.complained':
        await handleEmailComplained(event)
        break
        
      case 'email.clicked':
        await handleEmailClicked(event)
        break
        
      case 'email.opened':
        await handleEmailOpened(event)
        break
        
      default:
        logger.warn('Unhandled Resend event type', {
          eventType: event.type,
          eventId: event.id
        })
    }

    return createSuccessResponse({ received: true }, 'Webhook processed successfully')
    
  } catch (error) {
    logger.error('Resend webhook error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    
    await AuditLogger.logSystem({
      action: 'webhook_error',
      metadata: {
        source: 'resend',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      severity: 'high'
    })
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

async function verifyResendSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // This would use Resend's signature verification
    // For now, return true if secret is configured
    return !!secret
  } catch (error) {
    // Note: This function doesn't have access to logger, so we use basic error handling
    // In production, consider passing logger instance or using global logger
    return false
  }
}

async function handleEmailSent(event: any) {
  const data = event.data
  
  // Log email sent (audit logging already handles this below)
  // Using AuditLogger for business events
  
  // Update email status in database
  // Track delivery metrics
  
  await AuditLogger.logSystem({
    action: 'email_sent',
    metadata: {
      emailId: data.email_id,
      to: data.to,
      subject: data.subject,
      from: data.from
    },
    severity: 'low'
  })
}

async function handleEmailDelivered(event: any) {
  const data = event.data
  
  // Log email delivery (audit logging already handles this below)
  // Using AuditLogger for business events
  
  // Update delivery status
  // Track successful deliveries
  
  await AuditLogger.logSystem({
    action: 'email_delivered',
    metadata: {
      emailId: data.email_id,
      to: data.to,
      deliveredAt: data.created_at
    },
    severity: 'low'
  })
}

async function handleEmailBounced(event: any) {
  const data = event.data
  
  // Log email bounce (audit logging already handles this below)
  // Using AuditLogger for business events
  
  // Mark email as bounced
  // Handle hard bounces (remove from list)
  // Handle soft bounces (retry logic)
  
  await AuditLogger.logSystem({
    action: 'email_bounced',
    metadata: {
      emailId: data.email_id,
      to: data.to,
      bounceType: data.bounce_type,
      reason: data.bounce_reason
    },
    severity: 'medium'
  })
  
  // For hard bounces, consider marking email as invalid
  if (data.bounce_type === 'hard') {
    await AuditLogger.logSystem({
      action: 'email_address_invalid',
      metadata: {
        email: data.to,
        reason: 'hard_bounce'
      },
      severity: 'medium'
    })
  }
}

async function handleEmailComplained(event: any) {
  const data = event.data
  
  // Log email complaint (audit logging already handles this below)
  // Using AuditLogger for business events
  
  // Mark as spam complaint
  // Remove from mailing list
  // Update user preferences
  
  await AuditLogger.logSystem({
    action: 'email_complained',
    metadata: {
      emailId: data.email_id,
      to: data.to,
      complaintType: data.complaint_type
    },
    severity: 'high'
  })
}

async function handleEmailClicked(event: any) {
  const data = event.data
  
  // Log email click (audit logging already handles this below)
  // Using AuditLogger for business events
  
  // Track click metrics
  // Update engagement scores
  
  await AuditLogger.logSystem({
    action: 'email_clicked',
    metadata: {
      emailId: data.email_id,
      to: data.to,
      url: data.link,
      clickedAt: data.created_at
    },
    severity: 'low'
  })
}

async function handleEmailOpened(event: any) {
  const data = event.data
  
  // Log email open (audit logging already handles this below)
  // Using AuditLogger for business events
  
  // Track open metrics
  // Update engagement scores
  
  await AuditLogger.logSystem({
    action: 'email_opened',
    metadata: {
      emailId: data.email_id,
      to: data.to,
      openedAt: data.created_at,
      userAgent: data.user_agent,
      ipAddress: data.ip_address
    },
    severity: 'low'
  })
}

export const POST = withCorrelation(resendWebhookHandler)
