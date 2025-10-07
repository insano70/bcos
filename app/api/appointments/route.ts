import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { publicRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
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
  try {
    // Use standard validation helper
    const validatedData = await validateRequest(request, AppointmentRequestSchema);

    log.info('Appointment request received', {
      patientName: `${validatedData.firstName} ${validatedData.lastName}`,
      email: validatedData.email,
      preferredDate: validatedData.preferredDate,
      preferredTime: validatedData.preferredTime,
      reason: validatedData.reason,
      practiceEmail: validatedData.practiceEmail,
      operation: 'appointment-request',
    });

    // Send email notification to practice
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

    log.info('Appointment request processed successfully', {
      patientName: `${validatedData.firstName} ${validatedData.lastName}`,
      email: validatedData.email,
      practiceEmail: validatedData.practiceEmail,
      operation: 'appointment-request-success',
    });

    return createSuccessResponse({ submitted: true }, 'Appointment request submitted successfully');
  } catch (error) {
    log.error('Appointment request failed', error, {
      operation: 'appointment-request-error',
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
