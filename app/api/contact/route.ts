import { NextRequest, NextResponse } from 'next/server'
import { publicRoute } from '@/lib/api/rbac-route-handler'
import { EmailService } from '@/lib/api/services/email'
import { z } from 'zod'
import { createAppLogger } from '@/lib/logger/factory'

const contactLogger = createAppLogger('contact-api', {
  component: 'api',
  feature: 'contact-form',
  module: 'contact-endpoint'
})

const ContactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Valid email required').max(255, 'Email too long'),
  phone: z.string().optional(),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject too long'),
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
  practiceEmail: z.string().email('Valid practice email required')
})

interface ContactFormData {
  name: string
  email: string
  phone?: string
  subject: string
  message: string
  practiceEmail: string
}

const handler = async (request: NextRequest) => {
  try {
    if (request.method !== 'POST') {
      return NextResponse.json(
        { error: 'Method not allowed' },
        { status: 405 }
      )
    }

    const body = await request.json() as ContactFormData
    
    // Validate request data
    const validatedData = ContactFormSchema.parse(body)

    contactLogger.info('Contact form submission received', {
      name: validatedData.name,
      email: validatedData.email,
      subject: validatedData.subject,
      practiceEmail: validatedData.practiceEmail,
      operation: 'contact-form-submission'
    })

    // Send email notification to practice
    await EmailService.sendContactForm(validatedData.practiceEmail, {
      name: validatedData.name,
      email: validatedData.email,
      ...(validatedData.phone && { phone: validatedData.phone }),
      subject: validatedData.subject,
      message: validatedData.message
    })

    contactLogger.info('Contact form processed successfully', {
      name: validatedData.name,
      email: validatedData.email,
      practiceEmail: validatedData.practiceEmail,
      operation: 'contact-form-success'
    })

    return NextResponse.json({
      success: true,
      message: 'Contact form submitted successfully'
    })

  } catch (error) {
    contactLogger.error('Contact form submission failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'contact-form-error'
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid form data', 
          details: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }))
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to submit contact form' },
      { status: 500 }
    )
  }
}

// Public endpoint - no authentication required for contact forms
export const POST = publicRoute(handler, 'Allow visitors to submit contact forms', {
  rateLimit: 'api'
})
