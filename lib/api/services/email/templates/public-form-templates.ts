/**
 * Public Form Email Templates
 * Templates for appointment requests and contact form submissions
 */

import type { EmailTemplate, AppointmentRequestFormData, ContactFormData } from '../types';
import { emailStyles } from '../formatters/html-formatter';
import { escapeHtml, nl2br, truncateText } from '../utils/security';
import { log } from '@/lib/logger';

/**
 * Appointment request email template
 */
export function getAppointmentRequestTemplate(formData: AppointmentRequestFormData): EmailTemplate {
  try {
    // Sanitize and escape all user input
    const firstName = escapeHtml(truncateText(formData.firstName, 100));
    const lastName = escapeHtml(truncateText(formData.lastName, 100));
    const email = escapeHtml(formData.email);
    const phone = escapeHtml(formData.phone);
    const preferredDate = escapeHtml(formData.preferredDate);
    const preferredTime = escapeHtml(formData.preferredTime);
    const reason = escapeHtml(truncateText(formData.reason, 200));
    const message = formData.message ? nl2br(truncateText(formData.message, 2000)) : '';

    const subject = `New Appointment Request - ${firstName} ${lastName}`;

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>New Appointment Request</title>
      </head>
      <body style="${emailStyles.body}">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2c3e50; margin: 0;">New Appointment Request</h1>
        </div>

        <div style="${emailStyles.detailBox}">
          <h2 style="color: #495057; margin-top: 0;">Patient Information</h2>
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>

          ${preferredDate ? `<p><strong>Preferred Date:</strong> ${preferredDate}</p>` : ''}
          ${preferredTime ? `<p><strong>Preferred Time:</strong> ${preferredTime}</p>` : ''}
          ${reason ? `<p><strong>Reason for Visit:</strong> ${reason}</p>` : ''}

          ${
            message
              ? `
            <h3 style="color: #495057;">Additional Message</h3>
            <p style="${emailStyles.messageBox}">${message}</p>
          `
              : ''
          }
        </div>

        <div style="${emailStyles.infoBox}">
          <p style="${emailStyles.infoText}">
            <strong>Next Steps:</strong> Please contact the patient within 24 hours to confirm their appointment.
          </p>
        </div>
      </body>
    </html>
  `;

    const text = `New Appointment Request

Patient Information:
Name: ${escapeHtml(formData.firstName)} ${escapeHtml(formData.lastName)}
Email: ${formData.email}
Phone: ${formData.phone}
${formData.preferredDate ? `Preferred Date: ${formData.preferredDate}` : ''}
${formData.preferredTime ? `Preferred Time: ${formData.preferredTime}` : ''}
${formData.reason ? `Reason for Visit: ${truncateText(formData.reason, 200)}` : ''}

${formData.message ? `Additional Message:\n${truncateText(formData.message, 2000)}` : ''}

Next Steps: Please contact the patient within 24 hours to confirm their appointment.`;

    return { subject, html, text };
  } catch (error) {
    log.error('Appointment request template generation failed', error, {
      operation: 'getAppointmentRequestTemplate',
    });
    throw new Error('Failed to generate appointment request email template');
  }
}

/**
 * Contact form email template
 */
export function getContactFormTemplate(formData: ContactFormData): EmailTemplate {
  try {
    // Sanitize and escape all user input
    const name = escapeHtml(truncateText(formData.name, 100));
    const email = escapeHtml(formData.email);
    const phone = formData.phone ? escapeHtml(formData.phone) : '';
    const subjectText = escapeHtml(truncateText(formData.subject, 200));
    const message = nl2br(truncateText(formData.message, 2000));

    const subject = `Contact Form: ${subjectText} - ${name}`;

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Contact Form Submission</title>
      </head>
      <body style="${emailStyles.body}">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2c3e50; margin: 0;">Contact Form Submission</h1>
        </div>

        <div style="${emailStyles.detailBox}">
          <h2 style="color: #495057; margin-top: 0;">Contact Information</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          ${phone ? `<p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>` : ''}
          <p><strong>Subject:</strong> ${subjectText}</p>

          <h3 style="color: #495057;">Message</h3>
          <div style="${emailStyles.messageBoxSuccess}">
            ${message}
          </div>
        </div>

        <div style="${emailStyles.warningBox}">
          <p style="${emailStyles.warningText}">
            <strong>Reply to:</strong> <a href="mailto:${email}">${email}</a>
          </p>
        </div>
      </body>
    </html>
  `;

    const text = `Contact Form Submission

Contact Information:
Name: ${escapeHtml(formData.name)}
Email: ${formData.email}
${formData.phone ? `Phone: ${formData.phone}` : ''}
Subject: ${truncateText(formData.subject, 200)}

Message:
${truncateText(formData.message, 2000)}

Reply to: ${formData.email}`;

    return { subject, html, text };
  } catch (error) {
    log.error('Contact form template generation failed', error, {
      operation: 'getContactFormTemplate',
    });
    throw new Error('Failed to generate contact form email template');
  }
}
