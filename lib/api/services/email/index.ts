/**
 * Email Service Barrel Exports
 * Main entry point for email service - maintains backward compatibility
 *
 * Usage:
 *   // Simple (existing code):
 *   import { emailService } from '@/lib/api/services/email';
 *   await emailService.sendWelcomeEmail(...);
 *
 *   // Modern (template-based):
 *   import { emailService, getWelcomeTemplate } from '@/lib/api/services/email';
 *   const template = getWelcomeTemplate({ firstName, lastName });
 *   await emailService.sendTemplatedEmail(email, template);
 */

// Core service and singleton instance
export { EmailService } from './core-service';
export { emailService, getEmailService, resetEmailService } from './email-service-instance';

// Types
export type {
  EmailTemplate,
  EmailOptions,
  WelcomeTemplateVars,
  PasswordResetTemplateVars,
  EmailVerificationTemplateVars,
  PracticeSetupTemplateVars,
  SystemNotificationTemplateVars,
  AppointmentRequestFormData,
  ContactFormData,
} from './types';

// Template generators (for modern usage)
export {
  // Auth templates
  getWelcomeTemplate,
  getPasswordResetTemplate,
  getEmailVerificationTemplate,
  // Practice templates
  getPracticeSetupTemplate,
  // Public form templates
  getAppointmentRequestTemplate,
  getContactFormTemplate,
  // Admin templates
  getSystemNotificationTemplate,
  // Work item templates
  getStatusChangeTemplate,
  getCommentTemplate,
  getAssignmentTemplate,
  getDueDateReminderTemplate,
  // Work item types
  type WorkItemContext,
  type NotificationRecipient,
} from './templates';

// HTML formatters (for custom templates)
export {
  emailStyles,
  wrapEmailContent,
  wrapEmailContentFlat,
  wrapEmailContentWarning,
  createDetailRow,
  createButton,
  createList,
  createInfoBox,
  createWarningBox,
  createCodeBlock,
} from './formatters/html-formatter';

// Text formatters (for custom templates)
export {
  formatDetailsList,
  wrapTextEmail,
  createSeparator,
  formatList,
  createHeading,
} from './formatters/text-formatter';
