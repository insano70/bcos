import { NextRequest, NextResponse } from 'next/server'
import { publicRoute } from '@/lib/api/rbac-route-handler'
import { emailService } from '@/lib/api/services/email-service-instance'
import { z } from 'zod'
import { log } from '@/lib/logger'

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

    log.info('Contact form submission received', {
      name: validatedData.name,
      email: validatedData.email,
      subject: validatedData.subject,
      practiceEmail: validatedData.practiceEmail,
      operation: 'contact-form-submission'
    })

    // Send email notification to practice
    await emailService.sendContactForm(validatedData.practiceEmail, {
      name: validatedData.name,
      email: validatedData.email,
      ...(validatedData.phone && { phone: validatedData.phone }),
      subject: validatedData.subject,
      message: validatedData.message
    })

    log.info('Contact form processed successfully', {
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
    log.error('Contact form submission failed', error, {
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
