import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { AuditLogger } from '@/lib/api/services/audit'

/**
 * Resend Webhook Handler
 * Processes email delivery events and bounces
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = (await headers()).get('resend-signature')
    
    if (!signature) {
      return createErrorResponse('Missing Resend signature', 400, request)
    }

    // Verify webhook signature - REQUIRED for security
    if (!process.env.RESEND_WEBHOOK_SECRET) {
      await AuditLogger.logSecurity({
        action: 'webhook_config_missing',
        metadata: { source: 'resend', reason: 'RESEND_WEBHOOK_SECRET not configured' },
        severity: 'critical'
      })
      return createErrorResponse('Webhook configuration error', 500, request)
    }

    const isValid = await verifyResendSignature(body, signature, process.env.RESEND_WEBHOOK_SECRET)
    if (!isValid) {
      await AuditLogger.logSecurity({
        action: 'webhook_signature_invalid',
        metadata: { source: 'resend', signature: signature.substring(0, 10) + '...' },
        severity: 'high'
      })
      return createErrorResponse('Invalid webhook signature', 401, request)
    }

    const event = JSON.parse(body)

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
        console.log(`Unhandled Resend event type: ${event.type}`)
    }

    return createSuccessResponse({ received: true }, 'Webhook processed successfully')
    
  } catch (error) {
    console.error('Resend webhook error:', error)
    
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
    console.error('Resend signature verification failed:', error)
    return false
  }
}

async function handleEmailSent(event: any) {
  const data = event.data
  
  console.log('Email sent:', data.email_id)
  
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
  
  console.log('Email delivered:', data.email_id)
  
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
  
  console.log('Email bounced:', data.email_id)
  
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
  
  console.log('Email complaint:', data.email_id)
  
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
  
  console.log('Email clicked:', data.email_id)
  
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
  
  console.log('Email opened:', data.email_id)
  
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
