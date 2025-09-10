import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { AuditLogger } from '@/lib/api/services/audit'
import { EmailService } from '@/lib/api/services/email'

/**
 * Stripe Webhook Handler
 * Processes payment events and subscription changes
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = headers().get('stripe-signature')
    
    if (!signature) {
      return createErrorResponse('Missing Stripe signature', 400, request)
    }

    // Verify webhook signature (implement when Stripe is configured)
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const isValid = await verifyStripeSignature(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
      if (!isValid) {
        await AuditLogger.logSecurity({
          action: 'webhook_signature_invalid',
          metadata: { source: 'stripe', signature },
          severity: 'high'
        })
        return createErrorResponse('Invalid signature', 401, request)
      }
    }

    const event = JSON.parse(body)
    
    // Log webhook received
    await AuditLogger.logSystem({
      action: 'webhook_received',
      metadata: {
        source: 'stripe',
        eventType: event.type,
        eventId: event.id
      },
      severity: 'low'
    })

    // Process different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event)
        break
        
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event)
        break
        
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event)
        break
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event)
        break
        
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event)
        break
        
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event)
        break
        
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event)
        break
        
      default:
        console.log(`Unhandled Stripe event type: ${event.type}`)
    }

    return createSuccessResponse({ received: true }, 'Webhook processed successfully')
    
  } catch (error) {
    console.error('Stripe webhook error:', error)
    
    await AuditLogger.logSystem({
      action: 'webhook_error',
      metadata: {
        source: 'stripe',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      severity: 'high'
    })
    
    return createErrorResponse(error, 500, request)
  }
}

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // This would use Stripe's signature verification
    // For now, return true if secret is configured
    return !!secret
  } catch (error) {
    console.error('Stripe signature verification failed:', error)
    return false
  }
}

async function handlePaymentSuccess(event: any) {
  const paymentIntent = event.data.object
  
  console.log('Payment succeeded:', paymentIntent.id)
  
  // Update database with successful payment
  // Send confirmation email
  // Update subscription status if applicable
  
  await AuditLogger.logSystem({
    action: 'payment_succeeded',
    metadata: {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      customerId: paymentIntent.customer
    },
    severity: 'low'
  })
}

async function handlePaymentFailed(event: any) {
  const paymentIntent = event.data.object
  
  console.log('Payment failed:', paymentIntent.id)
  
  // Send payment failed notification
  // Update subscription status
  // Log for follow-up
  
  await AuditLogger.logSystem({
    action: 'payment_failed',
    metadata: {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      customerId: paymentIntent.customer,
      failureReason: paymentIntent.last_payment_error?.message
    },
    severity: 'medium'
  })
}

async function handleSubscriptionCreated(event: any) {
  const subscription = event.data.object
  
  console.log('Subscription created:', subscription.id)
  
  // Update user's subscription status
  // Send welcome email
  // Activate premium features
  
  await AuditLogger.logSystem({
    action: 'subscription_created',
    metadata: {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
      planId: subscription.items.data[0]?.price?.id
    },
    severity: 'low'
  })
}

async function handleSubscriptionUpdated(event: any) {
  const subscription = event.data.object
  
  console.log('Subscription updated:', subscription.id)
  
  // Update subscription details
  // Handle plan changes
  // Send notification if needed
  
  await AuditLogger.logSystem({
    action: 'subscription_updated',
    metadata: {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
      planId: subscription.items.data[0]?.price?.id
    },
    severity: 'low'
  })
}

async function handleSubscriptionCanceled(event: any) {
  const subscription = event.data.object
  
  console.log('Subscription canceled:', subscription.id)
  
  // Deactivate premium features
  // Send cancellation confirmation
  // Schedule data retention
  
  await AuditLogger.logSystem({
    action: 'subscription_canceled',
    metadata: {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      canceledAt: subscription.canceled_at,
      cancelationReason: subscription.cancellation_details?.reason
    },
    severity: 'medium'
  })
}

async function handleInvoicePaymentSucceeded(event: any) {
  const invoice = event.data.object
  
  console.log('Invoice payment succeeded:', invoice.id)
  
  // Send receipt
  // Update billing records
  
  await AuditLogger.logSystem({
    action: 'invoice_payment_succeeded',
    metadata: {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      amount: invoice.amount_paid,
      currency: invoice.currency
    },
    severity: 'low'
  })
}

async function handleInvoicePaymentFailed(event: any) {
  const invoice = event.data.object
  
  console.log('Invoice payment failed:', invoice.id)
  
  // Send payment failure notification
  // Handle dunning management
  
  await AuditLogger.logSystem({
    action: 'invoice_payment_failed',
    metadata: {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      amount: invoice.amount_due,
      currency: invoice.currency,
      attemptCount: invoice.attempt_count
    },
    severity: 'high'
  })
}
