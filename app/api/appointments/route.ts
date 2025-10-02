import { NextRequest, NextResponse } from 'next/server'
import { publicRoute } from '@/lib/api/rbac-route-handler'
import { EmailService } from '@/lib/api/services/email'
import { z } from 'zod'
import { log } from '@/lib/logger'

const AppointmentRequestSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long'),
  email: z.string().email('Valid email required').max(255, 'Email too long'),
  phone: z.string().min(1, 'Phone number is required').max(20, 'Phone number too long'),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  reason: z.string().optional(),
  message: z.string().optional(),
  practiceEmail: z.string().email('Valid practice email required')
})

interface AppointmentRequestData {
  firstName: string
  lastName: string
  email: string
  phone: string
  preferredDate?: string
  preferredTime?: string
  reason?: string
  message?: string
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

    const body = await request.json() as AppointmentRequestData
    
    // Validate request data
    const validatedData = AppointmentRequestSchema.parse(body)

    log.info('Appointment request received', {
      patientName: `${validatedData.firstName} ${validatedData.lastName}`,
      email: validatedData.email,
      preferredDate: validatedData.preferredDate,
      preferredTime: validatedData.preferredTime,
      reason: validatedData.reason,
      practiceEmail: validatedData.practiceEmail,
      operation: 'appointment-request'
    })

    // Send email notification to practice
    await EmailService.sendAppointmentRequest(validatedData.practiceEmail, {
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      email: validatedData.email,
      phone: validatedData.phone,
      ...(validatedData.preferredDate && { preferredDate: validatedData.preferredDate }),
      ...(validatedData.preferredTime && { preferredTime: validatedData.preferredTime }),
      ...(validatedData.reason && { reason: validatedData.reason }),
      ...(validatedData.message && { message: validatedData.message })
    })

    log.info('Appointment request processed successfully', {
      patientName: `${validatedData.firstName} ${validatedData.lastName}`,
      email: validatedData.email,
      practiceEmail: validatedData.practiceEmail,
      operation: 'appointment-request-success'
    })

    return NextResponse.json({
      success: true,
      message: 'Appointment request submitted successfully'
    })

  } catch (error) {
    log.error('Appointment request failed', error, {
      operation: 'appointment-request-error'
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid form data', 
          details: error.issues.map((e: any) => ({ field: e.path.join('.'), message: e.message }))
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to submit appointment request' },
      { status: 500 }
    )
  }
}

// Public endpoint - no authentication required for appointment requests
export const POST = publicRoute(handler, 'Allow patients to submit appointment requests', {
  rateLimit: 'api'
})
