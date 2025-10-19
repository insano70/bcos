/**
 * Admin Email Templates
 * Templates for system notifications and admin alerts
 */

import type { EmailTemplate, SystemNotificationTemplateVars } from '../types';
import { wrapEmailContentWarning, createCodeBlock } from '../formatters/html-formatter';
import { escapeHtml, truncateText, sanitizeSensitiveData } from '../utils/security';
import { log } from '@/lib/logger';

/**
 * System notification template
 */
export function getSystemNotificationTemplate(vars: SystemNotificationTemplateVars): EmailTemplate {
  try {
    // Sanitize and escape all user input
    const message = escapeHtml(truncateText(vars.message, 2000));

    // Sanitize sensitive data from details before displaying
    const sanitizedDetails = vars.details ? sanitizeSensitiveData(vars.details) : null;
    const detailsHtml = sanitizedDetails
      ? createCodeBlock(escapeHtml(JSON.stringify(sanitizedDetails, null, 2)))
      : '';

    const timestamp = escapeHtml(new Date().toISOString());
    const environment = escapeHtml(process.env.NODE_ENV || 'unknown');

    const subject = 'System Notification';

    const contentHtml = `
    <p>${message}</p>

    ${detailsHtml}

    <p style="margin-top: 20px; font-size: 12px; color: #666;">
      Timestamp: ${timestamp}<br>
      Environment: ${environment}
    </p>
  `;

    const html = wrapEmailContentWarning('System Notification', contentHtml);

    const text = `
System Notification

${truncateText(vars.message, 2000)}

${sanitizedDetails ? `Details: ${JSON.stringify(sanitizedDetails, null, 2)}` : ''}

Timestamp: ${new Date().toISOString()}
Environment: ${process.env.NODE_ENV || 'unknown'}
  `.trim();

    return { subject, html, text };
  } catch (error) {
    log.error('System notification template generation failed', error, {
      operation: 'getSystemNotificationTemplate',
    });
    throw new Error('Failed to generate system notification email template');
  }
}
