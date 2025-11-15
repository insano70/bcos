/**
 * Practice-Branded Email Templates
 * Templates for contact forms and appointment requests with practice-specific branding
 */

import type { AppointmentRequestFormData, ContactFormData, EmailTemplate } from '../types';
import { escapeHtml, nl2br, truncateText } from '../utils/security';
import { log } from '@/lib/logger';

/**
 * Practice branding data for email templates
 */
export interface PracticeBrandingData {
  practiceName: string;
  domain: string;
  colors: {
    primary: string; // Banner background color (hex)
    secondary: string; // Header text color (hex)
    accent: string; // Footer background color (hex)
  };
}

/**
 * Validates hex color code to prevent CSS injection
 * Returns safe fallback if color is invalid
 *
 * @param color - Hex color code (e.g., "#00AEEF")
 * @param fallback - Fallback color if validation fails
 * @returns Validated hex color code
 */
function validateHexColor(color: string, fallback: string): string {
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  if (!hexRegex.test(color)) {
    log.warn('Invalid hex color detected - using fallback', {
      operation: 'validateHexColor',
      providedColor: color.substring(0, 20), // Truncate for safety
      fallback,
    });
    return fallback;
  }
  return color;
}

/**
 * Generate branded email styles with practice colors
 * Creates inline CSS styles using practice color palette
 * Validates all colors to prevent CSS injection attacks
 */
function createPracticeBrandedEmailStyles(colors: PracticeBrandingData['colors']) {
  // Validate all colors before injection to prevent CSS injection
  const primary = validateHexColor(colors.primary, '#00AEEF');
  const secondary = validateHexColor(colors.secondary, '#FFFFFF');
  const accent = validateHexColor(colors.accent, '#44C0AE');

  return {
    body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0;",
    headerBanner: `background: ${primary}; padding: 30px 20px; text-align: center;`,
    headerTitle: `color: ${secondary}; margin: 0; font-size: 28px; font-weight: 600;`,
    contentBox: 'background: #ffffff; padding: 30px 20px;',
    detailBox:
      'background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef; margin: 20px 0;',
    detailRow: 'margin: 12px 0; color: #333;',
    detailLabel: 'font-weight: 600; color: #495057; display: inline-block; min-width: 120px;',
    messageBox: 'background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; color: #333;',
    footer: `background: ${accent}; padding: 20px; text-align: center; color: #ffffff;`,
    footerText: 'margin: 5px 0; font-size: 14px; color: #ffffff;',
  };
}

/**
 * Wrap email content with practice-branded header and footer
 * Validates colors and escapes practice name for security
 *
 * @param practiceName - Practice name to display in header
 * @param content - HTML content to wrap
 * @param colors - Practice color palette
 * @returns Complete HTML email with branding
 */
function wrapPracticeBrandedEmail(
  practiceName: string,
  content: string,
  colors: PracticeBrandingData['colors']
): string {
  const styles = createPracticeBrandedEmailStyles(colors);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Contact Form - ${escapeHtml(practiceName)}</title>
      </head>
      <body style="${styles.body}">
        <!-- Header Banner -->
        <div style="${styles.headerBanner}">
          <h1 style="${styles.headerTitle}">${escapeHtml(practiceName)}</h1>
        </div>

        <!-- Content -->
        <div style="${styles.contentBox}">
          ${content}
        </div>

        <!-- Footer -->
        <div style="${styles.footer}">
          <p style="${styles.footerText}">
            This is an automated notification from your practice website.
          </p>
          <p style="${styles.footerText}">
            © ${new Date().getFullYear()} ${escapeHtml(practiceName)}
          </p>
        </div>
      </body>
    </html>
  `;
}

/**
 * Practice-branded contact form email template
 * Uses practice colors for header, body, and footer styling
 */
export function getPracticeBrandedContactFormTemplate(
  formData: ContactFormData,
  branding: PracticeBrandingData
): EmailTemplate {
  try {
    const styles = createPracticeBrandedEmailStyles(branding.colors);

    // Validate colors for inline style usage
    const primaryColor = validateHexColor(branding.colors.primary, '#00AEEF');

    // Sanitize and escape all user input
    const name = escapeHtml(truncateText(formData.name, 100));
    const email = escapeHtml(formData.email);
    const phone = formData.phone ? escapeHtml(formData.phone) : '';
    const subjectText = escapeHtml(truncateText(formData.subject, 200));
    const message = nl2br(truncateText(formData.message, 2000));

    const subject = `Contact Form Submission - ${escapeHtml(branding.domain)}`;

    const content = `
      <h2 style="color: #2c3e50; margin: 0 0 20px 0; font-size: 22px;">
        New Contact Form Submission
      </h2>

      <div style="${styles.detailBox}">
        <h3 style="color: #495057; margin: 0 0 15px 0; font-size: 18px;">Contact Information</h3>
        
        <div style="${styles.detailRow}">
          <span style="${styles.detailLabel}">Name:</span>
          <span>${name}</span>
        </div>
        
        <div style="${styles.detailRow}">
          <span style="${styles.detailLabel}">Email:</span>
          <a href="mailto:${email}" style="color: ${primaryColor}; text-decoration: none;">${email}</a>
        </div>
        
        ${
          phone
            ? `
        <div style="${styles.detailRow}">
          <span style="${styles.detailLabel}">Phone:</span>
          <a href="tel:${phone}" style="color: ${primaryColor}; text-decoration: none;">${phone}</a>
        </div>
        `
            : ''
        }
        
        <div style="${styles.detailRow}">
          <span style="${styles.detailLabel}">Subject:</span>
          <span>${subjectText}</span>
        </div>
      </div>

      <div style="margin: 20px 0;">
        <h3 style="color: #495057; margin: 0 0 10px 0; font-size: 18px;">Message</h3>
        <div style="${styles.messageBox}">
          ${message}
        </div>
      </div>

      <div style="background: #e7f3ff; padding: 15px; border-radius: 6px; border-left: 4px solid ${primaryColor}; margin-top: 20px;">
        <p style="margin: 0; color: #0066cc; font-size: 14px;">
          <strong>Next Steps:</strong> Please respond to this inquiry within 24 hours to provide excellent customer service.
        </p>
      </div>
    `;

    const html = wrapPracticeBrandedEmail(branding.practiceName, content, branding.colors);

    const text = `Contact Form Submission - ${escapeHtml(branding.domain)}

Contact Information:
Name: ${escapeHtml(formData.name)}
Email: ${formData.email}
${formData.phone ? `Phone: ${formData.phone}` : ''}
Subject: ${escapeHtml(truncateText(formData.subject, 200))}

Message:
${truncateText(formData.message, 2000)}

---
Please respond within 24 hours.`;

    return { subject, html, text };
  } catch (error) {
    log.error('Practice-branded contact form template generation failed', error, {
      operation: 'getPracticeBrandedContactFormTemplate',
      practiceName: branding.practiceName,
      domain: branding.domain,
    });
    throw new Error('Failed to generate practice-branded contact form email template');
  }
}

/**
 * Practice-branded appointment request email template
 * Uses practice colors for header, body, and footer styling
 */
export function getPracticeBrandedAppointmentRequestTemplate(
  formData: AppointmentRequestFormData,
  branding: PracticeBrandingData
): EmailTemplate {
  try {
    const styles = createPracticeBrandedEmailStyles(branding.colors);

    // Validate colors for inline style usage
    const primaryColor = validateHexColor(branding.colors.primary, '#00AEEF');

    // Sanitize and escape all user input
    const firstName = escapeHtml(truncateText(formData.firstName, 100));
    const lastName = escapeHtml(truncateText(formData.lastName, 100));
    const email = escapeHtml(formData.email);
    const phone = escapeHtml(formData.phone);
    const preferredDate = formData.preferredDate ? escapeHtml(formData.preferredDate) : '';
    const preferredTime = formData.preferredTime ? escapeHtml(formData.preferredTime) : '';
    const reason = formData.reason ? escapeHtml(truncateText(formData.reason, 200)) : '';
    const message = formData.message ? nl2br(truncateText(formData.message, 2000)) : '';

    const subject = `Appointment Request - ${escapeHtml(branding.domain)}`;

    const content = `
      <h2 style="color: #2c3e50; margin: 0 0 20px 0; font-size: 22px;">
        New Appointment Request
      </h2>

      <div style="${styles.detailBox}">
        <h3 style="color: #495057; margin: 0 0 15px 0; font-size: 18px;">Patient Information</h3>
        
        <div style="${styles.detailRow}">
          <span style="${styles.detailLabel}">Name:</span>
          <span>${firstName} ${lastName}</span>
        </div>
        
        <div style="${styles.detailRow}">
          <span style="${styles.detailLabel}">Email:</span>
          <a href="mailto:${email}" style="color: ${primaryColor}; text-decoration: none;">${email}</a>
        </div>
        
        <div style="${styles.detailRow}">
          <span style="${styles.detailLabel}">Phone:</span>
          <a href="tel:${phone}" style="color: ${primaryColor}; text-decoration: none;">${phone}</a>
        </div>
      </div>

      ${
        preferredDate || preferredTime || reason
          ? `
      <div style="${styles.detailBox}">
        <h3 style="color: #495057; margin: 0 0 15px 0; font-size: 18px;">Appointment Details</h3>
        
        ${
          preferredDate
            ? `
        <div style="${styles.detailRow}">
          <span style="${styles.detailLabel}">Preferred Date:</span>
          <span>${preferredDate}</span>
        </div>
        `
            : ''
        }
        
        ${
          preferredTime
            ? `
        <div style="${styles.detailRow}">
          <span style="${styles.detailLabel}">Preferred Time:</span>
          <span>${preferredTime}</span>
        </div>
        `
            : ''
        }
        
        ${
          reason
            ? `
        <div style="${styles.detailRow}">
          <span style="${styles.detailLabel}">Reason for Visit:</span>
          <span>${reason}</span>
        </div>
        `
            : ''
        }
      </div>
      `
          : ''
      }

      ${
        message
          ? `
      <div style="margin: 20px 0;">
        <h3 style="color: #495057; margin: 0 0 10px 0; font-size: 18px;">Additional Message</h3>
        <div style="${styles.messageBox}">
          ${message}
        </div>
      </div>
      `
          : ''
      }

      <div style="background: #e7f3ff; padding: 15px; border-radius: 6px; border-left: 4px solid ${primaryColor}; margin-top: 20px;">
        <p style="margin: 0; color: #0066cc; font-size: 14px;">
          <strong>Next Steps:</strong> Please contact the patient within 24 hours to schedule their appointment.
        </p>
      </div>
    `;

    const html = wrapPracticeBrandedEmail(branding.practiceName, content, branding.colors);

    const text = `Appointment Request - ${escapeHtml(branding.domain)}

Patient Information:
Name: ${escapeHtml(formData.firstName)} ${escapeHtml(formData.lastName)}
Email: ${formData.email}
Phone: ${formData.phone}
${formData.preferredDate ? `Preferred Date: ${escapeHtml(formData.preferredDate)}` : ''}
${formData.preferredTime ? `Preferred Time: ${escapeHtml(formData.preferredTime)}` : ''}
${formData.reason ? `Reason for Visit: ${escapeHtml(truncateText(formData.reason, 200))}` : ''}

${formData.message ? `Additional Message:\n${truncateText(formData.message, 2000)}` : ''}

---
Please contact the patient within 24 hours to schedule their appointment.`;

    return { subject, html, text };
  } catch (error) {
    log.error('Practice-branded appointment request template generation failed', error, {
      operation: 'getPracticeBrandedAppointmentRequestTemplate',
      practiceName: branding.practiceName,
      domain: branding.domain,
    });
    throw new Error('Failed to generate practice-branded appointment request email template');
  }
}

