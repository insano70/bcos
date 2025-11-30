import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { emailService } from '@/lib/api/services/email';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { getPracticeByDomain } from '@/lib/services/public-practice-service';

const AppointmentRequestSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long'),
  email: z.string().email('Valid email required').max(255, 'Email too long'),
  phone: z.string().min(1, 'Phone number is required').max(20, 'Phone number too long'),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  reason: z.string().optional(),
  message: z.string().optional(),
  practiceDomain: z
    .string()
    .min(1, 'Practice domain is required')
    .max(255, 'Domain too long')
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
      'Invalid domain format'
    ),
});

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Validate request data
    const validatedData = await validateRequest(request, AppointmentRequestSchema);

    // Fetch practice and attributes by domain
    const { practice, attributes} = await getPracticeByDomain(validatedData.practiceDomain);

    // Check if practice has email configured
    const practiceEmail = attributes.email;

    if (!practiceEmail) {
      // Fallback: Send error notification to thrive@bendcare.com
      log.error('practice email not configured - sending error notification', null, {
        operation: 'create_appointment_request',
        practiceId: practice.practice_id,
        practiceName: practice.name,
        domain: practice.domain,
        patientName: `${validatedData.firstName} ${validatedData.lastName}`,
        patientEmail: validatedData.email.replace(/(.{2}).*@/, '$1***@'),
        component: 'appointments',
        isPublic: true,
      });

      // Use branded template even for error emails
      await emailService.sendPracticeBrandedAppointmentRequest(
        'thrive@bendcare.com',
        {
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          email: validatedData.email,
          phone: validatedData.phone,
          ...(validatedData.preferredDate && { preferredDate: validatedData.preferredDate }),
          ...(validatedData.preferredTime && { preferredTime: validatedData.preferredTime }),
          ...(validatedData.reason && {
            reason: validatedData.reason,
          }),
          ...(validatedData.message && {
            message: `[ERROR: Practice email not configured for ${practice.domain}]\n\nPractice: ${practice.name}\n\n${validatedData.message}`,
          }),
        },
        {
          practiceName: practice.name,
          domain: practice.domain,
          colors: {
            primary: attributes.primary_color || '#00AEEF',
            secondary: attributes.secondary_color || '#FFFFFF',
            accent: attributes.accent_color || '#44C0AE',
          },
        }
      );

      const duration = Date.now() - startTime;
      log.info('appointment request processed with error fallback', {
        operation: 'create_appointment_request',
        practiceId: practice.practice_id,
        domain: practice.domain,
        fallbackEmail: 'thrive@bendcare.com',
        patientEmail: validatedData.email.replace(/(.{2}).*@/, '$1***@'),
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'appointments',
        isPublic: true,
      });

      return createSuccessResponse(
        { submitted: true },
        'Appointment request submitted successfully'
      );
    }

    // Send branded email notification to practice
    const emailStart = Date.now();
    await emailService.sendPracticeBrandedAppointmentRequest(
      practiceEmail,
      {
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        email: validatedData.email,
        phone: validatedData.phone,
        ...(validatedData.preferredDate && { preferredDate: validatedData.preferredDate }),
        ...(validatedData.preferredTime && { preferredTime: validatedData.preferredTime }),
        ...(validatedData.reason && { reason: validatedData.reason }),
        ...(validatedData.message && { message: validatedData.message }),
      },
      {
        practiceName: practice.name,
        domain: practice.domain,
        colors: {
          primary: attributes.primary_color || '#00AEEF',
          secondary: attributes.secondary_color || '#FFFFFF',
          accent: attributes.accent_color || '#44C0AE',
        },
      }
    );
    const emailDuration = Date.now() - emailStart;

    const duration = Date.now() - startTime;

    // Enriched appointment request log with patient and scheduling context
    log.info('appointment request submitted and email sent', {
      operation: 'create_appointment_request',
      resourceType: 'appointment_request',
      practiceId: practice.practice_id,
      practiceName: practice.name,
      domain: practice.domain,
      practiceEmail: practiceEmail.replace(/(.{2}).*@/, '$1***@'),
      patientName: `${validatedData.firstName} ${validatedData.lastName}`,
      patientEmail: validatedData.email.replace(/(.{2}).*@/, '$1***@'),
      patientPhone: validatedData.phone.replace(/(\d{3})\d+(\d{2})/, '$1***$2'),
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
        slow: emailDuration > SLOW_THRESHOLDS.EMAIL_OPERATION,
      },
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'appointments',
      isPublic: true,
    });

    return createSuccessResponse({ submitted: true }, 'Appointment request submitted successfully');
  } catch (error) {
    log.error('appointment request failed', error, {
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
