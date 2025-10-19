/**
 * Email Service Types
 * Shared interfaces for email templates and options
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  template?: string;
  variables?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

/**
 * Template variable interfaces for type safety
 */

export interface WelcomeTemplateVars {
  firstName: string;
  lastName: string;
}

export interface PasswordResetTemplateVars {
  firstName: string;
  resetUrl: string;
}

export interface EmailVerificationTemplateVars {
  firstName: string;
  verificationUrl: string;
}

export interface PracticeSetupTemplateVars {
  ownerName: string;
  practiceName: string;
  dashboardUrl: string;
}

export interface SystemNotificationTemplateVars {
  message: string;
  details?: Record<string, unknown>;
}

export interface AppointmentRequestFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredDate?: string;
  preferredTime?: string;
  reason?: string;
  message?: string;
}

export interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}
