import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { publicRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { emailService } from '@/lib/api/services/email-service-instance';
import { log } from '@/lib/logger';

const ContactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Valid email required').max(255, 'Email too long'),
  phone: z.string().optional(),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject too long'),
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
  practiceEmail: z.string().email('Valid practice email required'),
});

const handler = async (request: NextRequest) => {
  try {
    // Use standard validation helper
    const validatedData = await validateRequest(request, ContactFormSchema);

    log.info('Contact form submission received', {
      name: validatedData.name,
      email: validatedData.email,
      subject: validatedData.subject,
      practiceEmail: validatedData.practiceEmail,
      operation: 'contact-form-submission',
    });

    // Send email notification to practice
    await emailService.sendContactForm(validatedData.practiceEmail, {
      name: validatedData.name,
      email: validatedData.email,
      ...(validatedData.phone && { phone: validatedData.phone }),
      subject: validatedData.subject,
      message: validatedData.message,
    });

    log.info('Contact form processed successfully', {
      name: validatedData.name,
      email: validatedData.email,
      practiceEmail: validatedData.practiceEmail,
      operation: 'contact-form-success',
    });

    return createSuccessResponse({ submitted: true }, 'Contact form submitted successfully');
  } catch (error) {
    log.error('Contact form submission failed', error, {
      operation: 'contact-form-error',
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
