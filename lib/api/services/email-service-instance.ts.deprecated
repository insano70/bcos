/**
 * EmailService Singleton Instance
 * Provides a shared instance of EmailService for the application
 * Node.js runtime only - nodemailer dependency
 */

import * as nodemailer from 'nodemailer';
import { getEmailConfig } from '@/lib/env';
import { log } from '@/lib/logger';
import { EmailService } from './email';

/**
 * Singleton instance of EmailService
 * Initialized with nodemailer transporter
 */
let emailServiceInstance: EmailService | null = null;

/**
 * Create nodemailer transporter with AWS SES configuration
 * Falls back to mock transporter if credentials not configured
 */
function createTransporter(): nodemailer.Transporter {
  const config = getEmailConfig();

  if (!config.smtp.username || !config.smtp.password || !config.smtp.endpoint) {
    log.warn('Email service disabled - AWS SES credentials not configured');

    // Create a mock transporter that logs instead of sending
    return {
      sendMail: async (mailOptions: nodemailer.SendMailOptions) => {
        log.info('Mock email send (SES not configured)', {
          to: mailOptions.to,
          subject: mailOptions.subject,
        });
        return { messageId: 'mock-email-id', response: 'Mock email sent' };
      },
    } as nodemailer.Transporter;
  }

  // Create real SMTP transporter for AWS SES
  return nodemailer.createTransport({
    host: config.smtp.endpoint,
    port: config.smtp.startTlsPort,
    secure: false, // Use STARTTLS
    auth: {
      user: config.smtp.username,
      pass: config.smtp.password,
    },
    tls: {
      // Don't fail on invalid certificates for development
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });
}

/**
 * Get the singleton instance of EmailService
 * Creates the instance on first call
 */
export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    const transporter = createTransporter();
    emailServiceInstance = new EmailService(transporter);
  }
  return emailServiceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetEmailService(): void {
  emailServiceInstance = null;
}

// Export the singleton instance for convenience
export const emailService = getEmailService();
