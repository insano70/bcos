import type * as nodemailer from 'nodemailer';
import { getEmailConfig } from '@/lib/env';
import { log } from '@/lib/logger';
import type {
  AppointmentRequestFormData,
  ContactFormData,
  EmailOptions,
  EmailTemplate,
} from './types';
import {
  getAppointmentRequestTemplate,
  getContactFormTemplate,
} from './templates/public-form-templates';
import { getSystemNotificationTemplate } from './templates/admin-templates';
import { sanitizeEmailHeader, parseEmailList } from './utils/security';

/**
 * Email Service - Core Transport Layer
 * Handles email sending and delivery only
 * Templates are delegated to template modules for separation of concerns
 * Node.js runtime only - nodemailer dependency
 */
export class EmailService {
  constructor(private transporter: nodemailer.Transporter) {}

  /**
   * Core email sending method
   * Low-level transport - use sendTemplatedEmail for template-based emails
   */
  private async send(options: EmailOptions): Promise<void> {
    try {
      const config = getEmailConfig();

      // Sanitize email subject to prevent header injection
      const sanitizedSubject = sanitizeEmailHeader(options.subject);

      const mailOptions: nodemailer.SendMailOptions = {
        from: `${config.from.name} <${config.from.email}>`,
        to: Array.isArray(options.to) ? options.to : [options.to],
        replyTo: config.replyTo,
        subject: sanitizedSubject,
        html: options.html || '',
        text: options.text || '',
      };

      if (options.attachments && options.attachments.length > 0) {
        mailOptions.attachments = options.attachments.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        }));
      }

      const result = await this.transporter.sendMail(mailOptions);

      log.info('Email sent successfully', {
        to: options.to,
        emailId: result.messageId,
        subject: options.subject,
        operation: 'sendEmail',
      });
    } catch (error) {
      log.error('Email sending error', error, {
        to: options.to,
        subject: options.subject,
        operation: 'sendEmail',
      });
      throw error;
    }
  }

  /**
   * Send templated email (high-level method)
   * Accepts an EmailTemplate object and sends it
   */
  async sendTemplatedEmail(to: string | string[], template: EmailTemplate): Promise<void> {
    await this.send({
      to,
      subject: template.subject,
      html: template.html,
      ...(template.text && { text: template.text }),
    });
  }

  /**
   * ============================================================
   * HIGH-LEVEL CONVENIENCE METHODS
   * These methods are actively used in the codebase
   * They provide a simplified API for common email operations
   * ============================================================
   */

  /**
   * Send system notification emails to admins
   * Used by: audit service for critical alerts
   */
  async sendSystemNotification(
    subject: string,
    message: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const adminEmailsRaw = process.env.ADMIN_NOTIFICATION_EMAILS || '';

    // Validate and parse admin email list
    const adminEmails = parseEmailList(adminEmailsRaw);

    if (adminEmails.length === 0) {
      log.warn('No admin notification emails configured', {
        operation: 'sendAdminNotification',
        reason: 'ADMIN_NOTIFICATION_EMAILS not set or invalid',
      });
      return;
    }

    const template = getSystemNotificationTemplate({
      message,
      details: details || {},
    });

    // Sanitize subject header (parseEmailList already validated emails)
    const sanitizedSubject = sanitizeEmailHeader(subject);

    await this.send({
      to: adminEmails,
      subject: `[System Alert] ${sanitizedSubject}`,
      html: template.html,
      ...(template.text && { text: template.text }),
    });
  }

  /**
   * Send appointment request notification
   * Used by: appointments API route for patient requests
   */
  async sendAppointmentRequest(
    practiceEmail: string,
    formData: AppointmentRequestFormData
  ): Promise<void> {
    const template = getAppointmentRequestTemplate(formData);
    await this.sendTemplatedEmail(practiceEmail, template);

    log.info('Appointment request email sent', {
      practiceEmail,
      patientEmail: formData.email,
      patientName: `${formData.firstName} ${formData.lastName}`,
      operation: 'sendAppointmentRequest',
    });
  }

  /**
   * Send contact form submission notification
   * Used by: contact API route for visitor inquiries
   */
  async sendContactForm(practiceEmail: string, formData: ContactFormData): Promise<void> {
    const template = getContactFormTemplate(formData);
    await this.sendTemplatedEmail(practiceEmail, template);

    log.info('Contact form email sent', {
      practiceEmail,
      contactEmail: formData.email,
      contactName: formData.name,
      operation: 'sendContactForm',
    });
  }

  /**
   * Send work item notification
   * Public method for work item notification service
   * This is NOT deprecated as it's a low-level utility method
   */
  async sendWorkItemNotification(
    to: string,
    subject: string,
    html: string,
    text: string
  ): Promise<void> {
    await this.send({
      to,
      subject,
      html,
      text,
    });
  }
}
