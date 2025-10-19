/**
 * Practice Email Templates
 * Templates for practice setup and onboarding notifications
 */

import type { EmailTemplate, PracticeSetupTemplateVars } from '../types';
import { wrapEmailContent, createButton, createList } from '../formatters/html-formatter';
import { wrapTextEmail } from '../formatters/text-formatter';

/**
 * Practice setup notification template
 */
export function getPracticeSetupTemplate(vars: PracticeSetupTemplateVars): EmailTemplate {
  const subject = `Your ${vars.practiceName} Website is Ready!`;
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Platform';

  const contentHtml = `
    <p style="font-size: 18px; margin-bottom: 20px;">Hi Dr. ${vars.ownerName},</p>

    <p>Congratulations! Your ${vars.practiceName} website has been successfully set up and is now live.</p>

    <p>You can now:</p>
    ${createList([
      'Customize your practice information',
      'Add staff members and their specialties',
      'Update your services and treatments',
      'Configure your contact information and hours',
      'Choose and customize your website template',
    ])}

    ${createButton('Manage Your Practice', vars.dashboardUrl, 'info')}

    <p>If you need any assistance setting up your practice website, our support team is here to help.</p>

    <p>Best regards,<br>The ${appName} Team</p>
  `;

  const html = wrapEmailContent('🎉 Your Practice Website is Live!', contentHtml, {
    headerGradient: 'success',
  });

  const text = wrapTextEmail(
    `Your ${vars.practiceName} Website is Ready!`,
    `Hi Dr. ${vars.ownerName},

Congratulations! Your practice website has been successfully set up and is now live.

Manage your practice at: ${vars.dashboardUrl}

If you need assistance, our support team is here to help.`
  );

  return { subject, html, text };
}
