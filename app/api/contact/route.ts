import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { emailService } from '@/lib/api/services/email';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { getPracticeByDomain } from '@/lib/services/public-practice-service';

const ContactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Valid email required').max(255, 'Email too long'),
  phone: z.string().optional(),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject too long'),
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
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
    const validatedData = await validateRequest(request, ContactFormSchema);

    // Fetch practice and attributes by domain
    const { practice, attributes } = await getPracticeByDomain(validatedData.practiceDomain);

    // Check if practice has email configured
    const practiceEmail = attributes.email;

    if (!practiceEmail) {
      // Fallback: Send error notification to thrive@bendcare.com
      log.error('practice email not configured - sending error notification', null, {
        operation: 'contact_form_submission',
        practiceId: practice.practice_id,
        practiceName: practice.name,
        domain: practice.domain,
        contactName: validatedData.name,
        contactEmail: validatedData.email.replace(/(.{2}).*@/, '$1***@'),
        component: 'contact-form',
        isPublic: true,
      });

      // Use branded template even for error emails (with ERROR prefix in subject)
      await emailService.sendPracticeBrandedContactForm(
        'thrive@bendcare.com',
        {
          name: validatedData.name,
          email: validatedData.email,
          ...(validatedData.phone && { phone: validatedData.phone }),
          subject: `ERROR - ${validatedData.subject}`,
          message: `[ERROR: Practice email not configured for ${practice.domain}]\n\nPractice: ${practice.name}\n\n${validatedData.message}`,
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
      log.info('contact form processed with error fallback', {
        operation: 'contact_form_submission',
        practiceId: practice.practice_id,
        domain: practice.domain,
        fallbackEmail: 'thrive@bendcare.com',
        contactEmail: validatedData.email.replace(/(.{2}).*@/, '$1***@'),
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'contact-form',
        isPublic: true,
      });

      return createSuccessResponse(
        { submitted: true },
        'Contact form submitted successfully'
      );
    }

    // Send branded email notification to practice
    await emailService.sendPracticeBrandedContactForm(
      practiceEmail,
      {
        name: validatedData.name,
        email: validatedData.email,
        ...(validatedData.phone && { phone: validatedData.phone }),
        subject: validatedData.subject,
        message: validatedData.message,
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

    log.info('contact form processed successfully', {
      operation: 'contact_form_submission',
      practiceId: practice.practice_id,
      practiceName: practice.name,
      domain: practice.domain,
      practiceEmail: practiceEmail.replace(/(.{2}).*@/, '$1***@'),
      contactName: validatedData.name,
      contactEmail: validatedData.email.replace(/(.{2}).*@/, '$1***@'),
      hasPhone: !!validatedData.phone,
      subjectCategory: validatedData.subject,
      messageLength: validatedData.message.length,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'contact-form',
      isPublic: true,
    });

    return createSuccessResponse({ submitted: true }, 'Contact form submitted successfully');
  } catch (error) {
    log.error('contact form submission failed', error, {
      operation: 'contact_form_submission',
      duration: Date.now() - startTime,
      component: 'contact-form',
      isPublic: true,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to submit contact form',
      500,
      request
    );
  }
};

// Public endpoint - no authentication required for contact forms
export const POST = publicRoute(handler, 'Allow visitors to submit contact forms', {
  rateLimit: 'api',
});
