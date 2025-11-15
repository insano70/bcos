/**
 * Email Templates Barrel Exports
 * Central export point for all email templates
 */

// Auth templates
export {
  getWelcomeTemplate,
  getPasswordResetTemplate,
  getEmailVerificationTemplate,
} from './auth-templates';

// Practice templates
export { getPracticeSetupTemplate } from './practice-templates';

// Public form templates
export { getAppointmentRequestTemplate, getContactFormTemplate } from './public-form-templates';

// Practice-branded templates
export {
  getPracticeBrandedContactFormTemplate,
  getPracticeBrandedAppointmentRequestTemplate,
} from './practice-branded-templates';

// Admin templates
export { getSystemNotificationTemplate } from './admin-templates';

// Work item templates
export {
  getStatusChangeTemplate,
  getCommentTemplate,
  getAssignmentTemplate,
  getDueDateReminderTemplate,
  type WorkItemContext,
  type NotificationRecipient,
} from './work-item-templates';
