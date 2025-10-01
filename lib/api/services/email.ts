import * as nodemailer from 'nodemailer';
import { getEmailConfig } from '@/lib/env';
import { createAppLogger } from '@/lib/logger/factory';

// Create Universal Logger for email service operations
const emailLogger = createAppLogger('email-service', {
  component: 'communications',
  feature: 'email-delivery',
  module: 'email-service',
});

/**
 * Professional Email Service
 * Handles all email communications with templates and tracking
 */

interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

interface EmailOptions {
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

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  private static getTransporter(): nodemailer.Transporter {
    if (!EmailService.transporter) {
      const config = getEmailConfig();

      if (!config.smtp.username || !config.smtp.password || !config.smtp.endpoint) {
        emailLogger.warn('Email service disabled - AWS SES credentials not configured');
        // Create a mock transporter that logs instead of sending
        EmailService.transporter = {
          sendMail: async (mailOptions: nodemailer.SendMailOptions) => {
            emailLogger.info('Mock email send (SES not configured)', {
              to: mailOptions.to,
              subject: mailOptions.subject,
            });
            return { messageId: 'mock-email-id', response: 'Mock email sent' };
          },
        } as nodemailer.Transporter;
      } else {
        EmailService.transporter = nodemailer.createTransport({
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
    }
    if (!EmailService.transporter) {
      throw new Error('Failed to initialize email service');
    }
    return EmailService.transporter;
  }

  /**
   * Send a welcome email to new users
   */
  static async sendWelcomeEmail(email: string, firstName: string, lastName: string): Promise<void> {
    const template = EmailService.getWelcomeTemplate({ firstName, lastName });

    await EmailService.send({
      to: email,
      subject: template.subject,
      html: template.html,
      ...(template.text && { text: template.text }),
    });
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    firstName: string
  ): Promise<void> {
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`;
    const template = EmailService.getPasswordResetTemplate({ firstName, resetUrl });

    await EmailService.send({
      to: email,
      subject: template.subject,
      html: template.html,
      ...(template.text && { text: template.text }),
    });
  }

  /**
   * Send email verification email
   */
  static async sendEmailVerificationEmail(
    email: string,
    verificationToken: string,
    firstName: string
  ): Promise<void> {
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verificationToken}`;
    const template = EmailService.getEmailVerificationTemplate({ firstName, verificationUrl });

    await EmailService.send({
      to: email,
      subject: template.subject,
      html: template.html,
      ...(template.text && { text: template.text }),
    });
  }

  /**
   * Send practice setup notification to practice owners
   */
  static async sendPracticeSetupEmail(
    email: string,
    practiceName: string,
    ownerName: string
  ): Promise<void> {
    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;
    const template = EmailService.getPracticeSetupTemplate({
      ownerName,
      practiceName,
      dashboardUrl,
    });

    await EmailService.send({
      to: email,
      subject: template.subject,
      html: template.html,
      ...(template.text && { text: template.text }),
    });
  }

  /**
   * Send system notification emails to admins
   */
  static async sendSystemNotification(
    subject: string,
    message: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const adminEmails = process.env.ADMIN_NOTIFICATION_EMAILS?.split(',') || [];

    if (adminEmails.length === 0) {
      emailLogger.warn('No admin notification emails configured', {
        operation: 'sendAdminNotification',
        reason: 'ADMIN_NOTIFICATION_EMAILS not set',
      });
      return;
    }

    const template = EmailService.getSystemNotificationTemplate({
      message,
      details: details || {},
    });

    await EmailService.send({
      to: adminEmails,
      subject: `[System Alert] ${subject}`,
      html: template.html,
      ...(template.text && { text: template.text }),
    });
  }

  /**
   * Core email sending method
   */
  private static async send(options: EmailOptions): Promise<void> {
    try {
      const transporter = EmailService.getTransporter();
      const config = getEmailConfig();

      const mailOptions: nodemailer.SendMailOptions = {
        from: `${config.from.name} <${config.from.email}>`,
        to: Array.isArray(options.to) ? options.to : [options.to],
        replyTo: config.replyTo,
        subject: options.subject,
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

      const result = await transporter.sendMail(mailOptions);

      emailLogger.info('Email sent successfully', {
        to: options.to,
        emailId: result.messageId,
        subject: options.subject,
        operation: 'sendEmail',
      });
    } catch (error) {
      emailLogger.error('Email sending error', {
        to: options.to,
        subject: options.subject,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        operation: 'sendEmail',
      });
      throw error;
    }
  }

  /**
   * Welcome email template
   */
  private static getWelcomeTemplate(vars: { firstName: string; lastName: string }): EmailTemplate {
    const subject = `Welcome to ${process.env.NEXT_PUBLIC_APP_NAME || 'Our Platform'}, ${vars.firstName}!`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${subject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Our Platform!</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 18px; margin-bottom: 20px;">Hi ${vars.firstName},</p>
            
            <p>Welcome to our rheumatology practice management platform! We're excited to have you on board.</p>
            
            <p>Your account has been successfully created. You can now:</p>
            <ul>
              <li>Access your admin dashboard</li>
              <li>Configure your practice settings</li>
              <li>Manage your website templates</li>
              <li>Add staff members and services</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" 
                 style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Access Dashboard
              </a>
            </div>
            
            <p>If you have any questions or need assistance, please don't hesitate to reach out to our support team.</p>
            
            <p>Best regards,<br>The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team</p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p>© ${new Date().getFullYear()} ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'}. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    const text = `
      Welcome to ${process.env.NEXT_PUBLIC_APP_NAME || 'Our Platform'}, ${vars.firstName}!
      
      Your account has been successfully created. You can now access your admin dashboard at:
      ${process.env.NEXT_PUBLIC_APP_URL}/dashboard
      
      If you have any questions, please contact our support team.
      
      Best regards,
      The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team
    `;

    return { subject, html, text };
  }

  /**
   * Password reset email template
   */
  private static getPasswordResetTemplate(vars: {
    firstName: string;
    resetUrl: string;
  }): EmailTemplate {
    const subject = 'Reset Your Password';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${subject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
            <h1 style="color: #333; margin: 0 0 20px 0; font-size: 24px;">Password Reset Request</h1>
            
            <p>Hi ${vars.firstName},</p>
            
            <p>We received a request to reset your password. If you made this request, click the button below to reset your password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${vars.resetUrl}" 
                 style="background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Reset Password
              </a>
            </div>
            
            <p>This link will expire in 1 hour for security reasons.</p>
            
            <p>If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
            
            <p>Best regards,<br>The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team</p>
          </div>
        </body>
      </html>
    `;

    const text = `
      Password Reset Request
      
      Hi ${vars.firstName},
      
      We received a request to reset your password. If you made this request, visit this link to reset your password:
      ${vars.resetUrl}
      
      This link will expire in 1 hour for security reasons.
      
      If you didn't request a password reset, you can safely ignore this email.
      
      Best regards,
      The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team
    `;

    return { subject, html, text };
  }

  /**
   * Email verification template
   */
  private static getEmailVerificationTemplate(vars: {
    firstName: string;
    verificationUrl: string;
  }): EmailTemplate {
    const subject = 'Verify Your Email Address';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${subject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
            <h1 style="color: #333; margin: 0 0 20px 0; font-size: 24px;">Verify Your Email</h1>
            
            <p>Hi ${vars.firstName},</p>
            
            <p>Please verify your email address by clicking the button below:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${vars.verificationUrl}" 
                 style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Verify Email
              </a>
            </div>
            
            <p>This verification link will expire in 24 hours.</p>
            
            <p>If you didn't create an account, you can safely ignore this email.</p>
            
            <p>Best regards,<br>The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team</p>
          </div>
        </body>
      </html>
    `;

    const text = `
      Verify Your Email
      
      Hi ${vars.firstName},
      
      Please verify your email address by visiting this link:
      ${vars.verificationUrl}
      
      This verification link will expire in 24 hours.
      
      If you didn't create an account, you can safely ignore this email.
      
      Best regards,
      The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team
    `;

    return { subject, html, text };
  }

  /**
   * Practice setup notification template
   */
  private static getPracticeSetupTemplate(vars: {
    ownerName: string;
    practiceName: string;
    dashboardUrl: string;
  }): EmailTemplate {
    const subject = `Your ${vars.practiceName} Website is Ready!`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${subject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #00AEEF 0%, #44C0AE 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Your Practice Website is Live!</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 18px; margin-bottom: 20px;">Hi Dr. ${vars.ownerName},</p>
            
            <p>Congratulations! Your ${vars.practiceName} website has been successfully set up and is now live.</p>
            
            <p>You can now:</p>
            <ul>
              <li>Customize your practice information</li>
              <li>Add staff members and their specialties</li>
              <li>Update your services and treatments</li>
              <li>Configure your contact information and hours</li>
              <li>Choose and customize your website template</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${vars.dashboardUrl}" 
                 style="background: #00AEEF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Manage Your Practice
              </a>
            </div>
            
            <p>If you need any assistance setting up your practice website, our support team is here to help.</p>
            
            <p>Best regards,<br>The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team</p>
          </div>
        </body>
      </html>
    `;

    const text = `
      Your ${vars.practiceName} Website is Ready!
      
      Hi Dr. ${vars.ownerName},
      
      Congratulations! Your practice website has been successfully set up and is now live.
      
      Manage your practice at: ${vars.dashboardUrl}
      
      If you need assistance, our support team is here to help.
      
      Best regards,
      The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team
    `;

    return { subject, html, text };
  }

  /**
   * System notification template
   */
  private static getSystemNotificationTemplate(vars: {
    message: string;
    details?: Record<string, unknown>;
  }): EmailTemplate {
    const subject = 'System Notification';

    const detailsHtml = vars.details
      ? `<pre style="background: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 12px; overflow-x: auto;">${JSON.stringify(vars.details, null, 2)}</pre>`
      : '';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${subject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; border-left: 4px solid #ffc107;">
            <h1 style="color: #333; margin: 0 0 20px 0; font-size: 24px;">⚠️ System Notification</h1>
            
            <p>${vars.message}</p>
            
            ${detailsHtml}
            
            <p style="margin-top: 20px; font-size: 12px; color: #666;">
              Timestamp: ${new Date().toISOString()}<br>
              Environment: ${process.env.NODE_ENV || 'unknown'}
            </p>
          </div>
        </body>
      </html>
    `;

    const text = `
      System Notification
      
      ${vars.message}
      
      ${vars.details ? `Details: ${JSON.stringify(vars.details, null, 2)}` : ''}
      
      Timestamp: ${new Date().toISOString()}
      Environment: ${process.env.NODE_ENV || 'unknown'}
    `;

    return { subject, html, text };
  }

  /**
   * Send appointment request notification
   */
  static async sendAppointmentRequest(
    practiceEmail: string,
    formData: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      preferredDate?: string;
      preferredTime?: string;
      reason?: string;
      message?: string;
    }
  ): Promise<void> {
    const template = EmailService.getAppointmentRequestTemplate(formData);

    await EmailService.send({
      to: practiceEmail,
      subject: template.subject,
      html: template.html,
      ...(template.text && { text: template.text }),
    });

    emailLogger.info('Appointment request email sent', {
      practiceEmail,
      patientEmail: formData.email,
      patientName: `${formData.firstName} ${formData.lastName}`,
      operation: 'sendAppointmentRequest',
    });
  }

  /**
   * Send contact form submission notification
   */
  static async sendContactForm(
    practiceEmail: string,
    formData: {
      name: string;
      email: string;
      phone?: string;
      subject: string;
      message: string;
    }
  ): Promise<void> {
    const template = EmailService.getContactFormTemplate(formData);

    await EmailService.send({
      to: practiceEmail,
      subject: template.subject,
      html: template.html,
      ...(template.text && { text: template.text }),
    });

    emailLogger.info('Contact form email sent', {
      practiceEmail,
      contactEmail: formData.email,
      contactName: formData.name,
      operation: 'sendContactForm',
    });
  }

  /**
   * Appointment request email template
   */
  private static getAppointmentRequestTemplate(formData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    preferredDate?: string;
    preferredTime?: string;
    reason?: string;
    message?: string;
  }): EmailTemplate {
    const subject = `New Appointment Request - ${formData.firstName} ${formData.lastName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>New Appointment Request</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin: 0;">New Appointment Request</h1>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef;">
            <h2 style="color: #495057; margin-top: 0;">Patient Information</h2>
            <p><strong>Name:</strong> ${formData.firstName} ${formData.lastName}</p>
            <p><strong>Email:</strong> <a href="mailto:${formData.email}">${formData.email}</a></p>
            <p><strong>Phone:</strong> <a href="tel:${formData.phone}">${formData.phone}</a></p>
            
            ${formData.preferredDate ? `<p><strong>Preferred Date:</strong> ${formData.preferredDate}</p>` : ''}
            ${formData.preferredTime ? `<p><strong>Preferred Time:</strong> ${formData.preferredTime}</p>` : ''}
            ${formData.reason ? `<p><strong>Reason for Visit:</strong> ${formData.reason}</p>` : ''}
            
            ${
              formData.message
                ? `
              <h3 style="color: #495057;">Additional Message</h3>
              <p style="background: #f8f9fa; padding: 15px; border-radius: 4px; border-left: 4px solid #007bff;">${formData.message}</p>
            `
                : ''
            }
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background: #e7f3ff; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #0066cc;">
              <strong>Next Steps:</strong> Please contact the patient within 24 hours to confirm their appointment.
            </p>
          </div>
        </body>
      </html>
    `;

    const text = `New Appointment Request

Patient Information:
Name: ${formData.firstName} ${formData.lastName}
Email: ${formData.email}
Phone: ${formData.phone}
${formData.preferredDate ? `Preferred Date: ${formData.preferredDate}` : ''}
${formData.preferredTime ? `Preferred Time: ${formData.preferredTime}` : ''}
${formData.reason ? `Reason for Visit: ${formData.reason}` : ''}

${formData.message ? `Additional Message:\n${formData.message}` : ''}

Next Steps: Please contact the patient within 24 hours to confirm their appointment.`;

    return { subject, html, text };
  }

  /**
   * Contact form email template
   */
  private static getContactFormTemplate(formData: {
    name: string;
    email: string;
    phone?: string;
    subject: string;
    message: string;
  }): EmailTemplate {
    const subject = `Contact Form: ${formData.subject} - ${formData.name}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Contact Form Submission</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin: 0;">Contact Form Submission</h1>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef;">
            <h2 style="color: #495057; margin-top: 0;">Contact Information</h2>
            <p><strong>Name:</strong> ${formData.name}</p>
            <p><strong>Email:</strong> <a href="mailto:${formData.email}">${formData.email}</a></p>
            ${formData.phone ? `<p><strong>Phone:</strong> <a href="tel:${formData.phone}">${formData.phone}</a></p>` : ''}
            <p><strong>Subject:</strong> ${formData.subject}</p>
            
            <h3 style="color: #495057;">Message</h3>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; border-left: 4px solid #28a745;">
              ${formData.message.replace(/\n/g, '<br>')}
            </div>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #856404;">
              <strong>Reply to:</strong> <a href="mailto:${formData.email}">${formData.email}</a>
            </p>
          </div>
        </body>
      </html>
    `;

    const text = `Contact Form Submission

Contact Information:
Name: ${formData.name}
Email: ${formData.email}
${formData.phone ? `Phone: ${formData.phone}` : ''}
Subject: ${formData.subject}

Message:
${formData.message}

Reply to: ${formData.email}`;

    return { subject, html, text };
  }
}
