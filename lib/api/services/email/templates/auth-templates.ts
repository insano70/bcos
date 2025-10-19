/**
 * Authentication Email Templates
 * Templates for welcome emails, password resets, and email verification
 */

import type {
  EmailTemplate,
  WelcomeTemplateVars,
  PasswordResetTemplateVars,
  EmailVerificationTemplateVars,
} from '../types';
import { wrapEmailContent, wrapEmailContentFlat, createButton, createList } from '../formatters/html-formatter';
import { wrapTextEmail } from '../formatters/text-formatter';
import { escapeHtml, truncateText, validateUrl, getValidatedBaseUrl } from '../utils/security';
import { log } from '@/lib/logger';

/**
 * Welcome email template for new users
 */
export function getWelcomeTemplate(vars: WelcomeTemplateVars): EmailTemplate {
  try {
    // Sanitize and escape all user input
    const firstName = escapeHtml(truncateText(vars.firstName, 100));

    // Validate base URL
    const baseUrl = getValidatedBaseUrl();
    const dashboardUrl = `${baseUrl}/dashboard`;

    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Our Platform';
    const subject = `Welcome to ${appName}, ${firstName}!`;

    const contentHtml = `
    <p style="font-size: 18px; margin-bottom: 20px;">Hi ${firstName},</p>

    <p>Welcome to our rheumatology practice management platform! We're excited to have you on board.</p>

    <p>Your account has been successfully created. You can now:</p>
    ${createList([
      'Access your admin dashboard',
      'Configure your practice settings',
      'Manage your website templates',
      'Add staff members and services',
    ])}

    ${createButton('Access Dashboard', dashboardUrl)}

    <p>If you have any questions or need assistance, please don't hesitate to reach out to our support team.</p>

    <p>Best regards,<br>The ${appName} Team</p>
  `;

    const html = wrapEmailContent('Welcome to Our Platform!', contentHtml);

    const text = wrapTextEmail(
      `Welcome to ${appName}, ${firstName}!`,
      `Your account has been successfully created. You can now access your admin dashboard at:
${dashboardUrl}

If you have any questions, please contact our support team.`
    );

    return { subject, html, text };
  } catch (error) {
    log.error('Welcome template generation failed', error, {
      operation: 'getWelcomeTemplate',
    });
    throw new Error('Failed to generate welcome email template');
  }
}

/**
 * Password reset email template
 */
export function getPasswordResetTemplate(vars: PasswordResetTemplateVars): EmailTemplate {
  try {
    // Sanitize and escape all user input
    const firstName = escapeHtml(truncateText(vars.firstName, 100));

    // Validate reset URL
    const resetUrl = validateUrl(vars.resetUrl);

    const subject = 'Reset Your Password';
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Platform';

    const contentHtml = `
    <p>Hi ${firstName},</p>

    <p>We received a request to reset your password. If you made this request, click the button below to reset your password:</p>

    ${createButton('Reset Password', resetUrl, 'danger')}

    <p>This link will expire in 1 hour for security reasons.</p>

    <p>If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>

    <p>Best regards,<br>The ${appName} Team</p>
  `;

    const html = wrapEmailContentFlat('Password Reset Request', contentHtml);

    const text = wrapTextEmail(
      'Password Reset Request',
      `Hi ${firstName},

We received a request to reset your password. If you made this request, visit this link to reset your password:
${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email.`
    );

    return { subject, html, text };
  } catch (error) {
    log.error('Password reset template generation failed', error, {
      operation: 'getPasswordResetTemplate',
    });
    throw new Error('Failed to generate password reset email template');
  }
}

/**
 * Email verification template
 */
export function getEmailVerificationTemplate(vars: EmailVerificationTemplateVars): EmailTemplate {
  try {
    // Sanitize and escape all user input
    const firstName = escapeHtml(truncateText(vars.firstName, 100));

    // Validate verification URL
    const verificationUrl = validateUrl(vars.verificationUrl);

    const subject = 'Verify Your Email Address';
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Platform';

    const contentHtml = `
    <p>Hi ${firstName},</p>

    <p>Please verify your email address by clicking the button below:</p>

    ${createButton('Verify Email', verificationUrl, 'success')}

    <p>This verification link will expire in 24 hours.</p>

    <p>If you didn't create an account, you can safely ignore this email.</p>

    <p>Best regards,<br>The ${appName} Team</p>
  `;

    const html = wrapEmailContentFlat('Verify Your Email', contentHtml);

    const text = wrapTextEmail(
      'Verify Your Email',
      `Hi ${firstName},

Please verify your email address by visiting this link:
${verificationUrl}

This verification link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.`
    );

    return { subject, html, text };
  } catch (error) {
    log.error('Email verification template generation failed', error, {
      operation: 'getEmailVerificationTemplate',
    });
    throw new Error('Failed to generate email verification template');
  }
}
