import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { emailService } from '@/lib/api/services/email-service-instance';
import { log } from '@/lib/logger';

const AppointmentRequestSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long'),
  email: z.string().email('Valid email required').max(255, 'Email too long'),
  phone: z.string().min(1, 'Phone number is required').max(20, 'Phone number too long'),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  reason: z.string().optional(),
  message: z.string().optional(),
  practiceEmail: z.string().email('Valid practice email required'),
});

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Use standard validation helper
    const validatedData = await validateRequest(request, AppointmentRequestSchema);

    // Send email notification to practice
    const emailStart = Date.now();
    await emailService.sendAppointmentRequest(validatedData.practiceEmail, {
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      email: validatedData.email,
      phone: validatedData.phone,
      ...(validatedData.preferredDate && { preferredDate: validatedData.preferredDate }),
      ...(validatedData.preferredTime && { preferredTime: validatedData.preferredTime }),
      ...(validatedData.reason && { reason: validatedData.reason }),
      ...(validatedData.message && { message: validatedData.message }),
    });
    const emailDuration = Date.now() - emailStart;

    // Enriched appointment request log with patient and scheduling context
    log.info('appointment request submitted and email sent', {
      operation: 'create_appointment_request',
      resourceType: 'appointment_request',
      patientName: `${validatedData.firstName} ${validatedData.lastName}`,
      patientEmail: validatedData.email.replace(/(.{2}).*@/, '$1***@'),
      patientPhone: validatedData.phone.replace(/(\d{3})\d+(\d{2})/, '$1***$2'),
      practiceEmail: validatedData.practiceEmail.replace(/(.{2}).*@/, '$1***@'),
      scheduling: {
        hasPreferredDate: !!validatedData.preferredDate,
        hasPreferredTime: !!validatedData.preferredTime,
        preferredDate: validatedData.preferredDate,
        preferredTime: validatedData.preferredTime,
      },
      request: {
        hasReason: !!validatedData.reason,
        hasMessage: !!validatedData.message,
        reasonLength: validatedData.reason?.length || 0,
        messageLength: validatedData.message?.length || 0,
      },
      email: {
        sent: true,
        duration: emailDuration,
        slow: emailDuration > 2000,
      },
      duration: Date.now() - startTime,
      slow: Date.now() - startTime > 3000,
      component: 'appointments',
      isPublic: true,
    });

    return createSuccessResponse({ submitted: true }, 'Appointment request submitted successfully');
  } catch (error) {
    log.error('Appointment request failed', error, {
      operation: 'create_appointment_request',
      duration: Date.now() - startTime,
      component: 'appointments',
      isPublic: true,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to submit appointment request',
      500,
      request
    );
  }
};

// Public endpoint - no authentication required for appointment requests
export const POST = publicRoute(handler, 'Allow patients to submit appointment requests', {
  rateLimit: 'api',
});
