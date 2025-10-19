/**
 * Work Item Email Templates
 * Templates for work item notifications (status changes, comments, assignments, due dates)
 * Extracted from NotificationService for better separation of concerns
 */

import type { EmailTemplate } from '../types';
import type { WorkItemStatus } from '@/lib/hooks/use-work-item-statuses';
import type { WorkItemComment } from '@/lib/hooks/use-work-items';
import { escapeHtml, nl2br, truncateText } from '../utils/security';
import { log } from '@/lib/logger';

/**
 * Shared interfaces for work item template variables
 */
export interface WorkItemContext {
  work_item_id: string;
  subject: string;
  description: string | null;
  priority: string | null;
  organization_id: string;
  organization_name?: string;
}

export interface NotificationRecipient {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

/**
 * Status change notification template
 */
export function getStatusChangeTemplate(
  workItem: WorkItemContext,
  oldStatus: WorkItemStatus,
  newStatus: WorkItemStatus,
  recipient: NotificationRecipient
): EmailTemplate {
  try {
    // Sanitize and escape all user input
    const recipientFirstName = escapeHtml(truncateText(recipient.first_name, 100));
    const workItemSubject = escapeHtml(truncateText(workItem.subject, 200));
    const workItemDescription = workItem.description ? nl2br(truncateText(workItem.description, 1000)) : '';
    const workItemPriority = workItem.priority ? escapeHtml(truncateText(workItem.priority, 50)) : '';
    const organizationName = workItem.organization_name ? escapeHtml(truncateText(workItem.organization_name, 200)) : '';
    const oldStatusName = escapeHtml(truncateText(oldStatus.status_name, 100));
    const newStatusName = escapeHtml(truncateText(newStatus.status_name, 100));

    const subject = `Work Item Status Changed: ${workItemSubject}`;

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { background: #ffffff; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px; }
          .status-change { display: flex; align-items: center; gap: 10px; margin: 20px 0; }
          .status { padding: 8px 16px; border-radius: 4px; font-weight: 600; }
          .status-old { background: #f1f3f5; color: #495057; }
          .status-new { background: #e7f5ff; color: #1971c2; }
          .arrow { font-size: 20px; color: #adb5bd; }
          .work-item-details { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .detail-row { margin: 8px 0; }
          .label { font-weight: 600; color: #495057; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">Work Item Status Changed</h2>
          </div>
          <div class="content">
            <p>Hello ${recipientFirstName},</p>
            <p>The status of a work item you're watching has changed:</p>

            <div class="status-change">
              <span class="status status-old">${oldStatusName}</span>
              <span class="arrow">→</span>
              <span class="status status-new">${newStatusName}</span>
            </div>

            <div class="work-item-details">
              <div class="detail-row">
                <span class="label">Subject:</span> ${workItemSubject}
              </div>
              ${workItemDescription ? `<div class="detail-row"><span class="label">Description:</span> ${workItemDescription}</div>` : ''}
              ${workItemPriority ? `<div class="detail-row"><span class="label">Priority:</span> ${workItemPriority}</div>` : ''}
              ${organizationName ? `<div class="detail-row"><span class="label">Organization:</span> ${organizationName}</div>` : ''}
            </div>

            <div class="footer">
              <p>You're receiving this notification because you're watching this work item.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

    const text = `
Hello ${escapeHtml(recipient.first_name)},

The status of a work item you're watching has changed:

${escapeHtml(oldStatus.status_name)} → ${escapeHtml(newStatus.status_name)}

Work Item Details:
- Subject: ${escapeHtml(truncateText(workItem.subject, 200))}
${workItem.description ? `- Description: ${truncateText(workItem.description, 1000)}` : ''}
${workItem.priority ? `- Priority: ${truncateText(workItem.priority, 50)}` : ''}
${workItem.organization_name ? `- Organization: ${truncateText(workItem.organization_name, 200)}` : ''}

You're receiving this notification because you're watching this work item.
  `.trim();

    return { subject, html, text };
  } catch (error) {
    log.error('Status change template generation failed', error, {
      operation: 'getStatusChangeTemplate',
    });
    throw new Error('Failed to generate status change email template');
  }
}

/**
 * Comment notification template
 */
export function getCommentTemplate(
  workItem: WorkItemContext,
  comment: WorkItemComment,
  commenterName: string,
  recipient: NotificationRecipient
): EmailTemplate {
  try {
    // Sanitize and escape all user input
    const recipientFirstName = escapeHtml(truncateText(recipient.first_name, 100));
    const workItemSubject = escapeHtml(truncateText(workItem.subject, 200));
    const workItemDescription = workItem.description ? nl2br(truncateText(workItem.description, 1000)) : '';
    const commentText = nl2br(truncateText(comment.comment_text, 2000));
    const escapedCommenterName = escapeHtml(truncateText(commenterName, 100));

    const subject = `New Comment on Work Item: ${workItemSubject}`;

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { background: #ffffff; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px; }
          .comment { background: #f8f9fa; padding: 15px; border-left: 4px solid #1971c2; margin: 20px 0; border-radius: 4px; }
          .comment-meta { color: #6c757d; font-size: 14px; margin-bottom: 10px; }
          .work-item-details { background: #fff3cd; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .detail-row { margin: 8px 0; }
          .label { font-weight: 600; color: #495057; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">New Comment on Work Item</h2>
          </div>
          <div class="content">
            <p>Hello ${recipientFirstName},</p>
            <p><strong>${escapedCommenterName}</strong> commented on a work item you're watching:</p>

            <div class="comment">
              <div class="comment-meta">Comment by ${escapedCommenterName}</div>
              <div>${commentText}</div>
            </div>

            <div class="work-item-details">
              <div class="detail-row">
                <span class="label">Subject:</span> ${workItemSubject}
              </div>
              ${workItemDescription ? `<div class="detail-row"><span class="label">Description:</span> ${workItemDescription}</div>` : ''}
            </div>

            <div class="footer">
              <p>You're receiving this notification because you're watching this work item.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

    const text = `
Hello ${escapeHtml(recipient.first_name)},

${escapeHtml(commenterName)} commented on a work item you're watching:

"${truncateText(comment.comment_text, 2000)}"

Work Item Details:
- Subject: ${escapeHtml(truncateText(workItem.subject, 200))}
${workItem.description ? `- Description: ${truncateText(workItem.description, 1000)}` : ''}

You're receiving this notification because you're watching this work item.
  `.trim();

    return { subject, html, text };
  } catch (error) {
    log.error('Comment template generation failed', error, {
      operation: 'getCommentTemplate',
    });
    throw new Error('Failed to generate comment email template');
  }
}

/**
 * Assignment notification template
 */
export function getAssignmentTemplate(
  workItem: WorkItemContext,
  assignedUser: { first_name: string; last_name: string },
  assignedBy: { first_name: string; last_name: string },
  recipient: NotificationRecipient
): EmailTemplate {
  try {
    // Sanitize and escape all user input
    const recipientFirstName = escapeHtml(truncateText(recipient.first_name, 100));
    const workItemSubject = escapeHtml(truncateText(workItem.subject, 200));
    const workItemDescription = workItem.description ? nl2br(truncateText(workItem.description, 1000)) : '';
    const workItemPriority = workItem.priority ? escapeHtml(truncateText(workItem.priority, 50)) : '';
    const assignedUserFirstName = escapeHtml(truncateText(assignedUser.first_name, 100));
    const assignedUserLastName = escapeHtml(truncateText(assignedUser.last_name, 100));
    const assignedByFirstName = escapeHtml(truncateText(assignedBy.first_name, 100));
    const assignedByLastName = escapeHtml(truncateText(assignedBy.last_name, 100));

    const subject = `Work Item Assigned: ${workItemSubject}`;

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { background: #ffffff; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px; }
          .assignment { background: #d3f9d8; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .work-item-details { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .detail-row { margin: 8px 0; }
          .label { font-weight: 600; color: #495057; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">Work Item Assigned</h2>
          </div>
          <div class="content">
            <p>Hello ${recipientFirstName},</p>
            <p>A work item you're watching has been assigned:</p>

            <div class="assignment">
              <strong>${assignedUserFirstName} ${assignedUserLastName}</strong> was assigned by
              <strong>${assignedByFirstName} ${assignedByLastName}</strong>
            </div>

            <div class="work-item-details">
              <div class="detail-row">
                <span class="label">Subject:</span> ${workItemSubject}
              </div>
              ${workItemDescription ? `<div class="detail-row"><span class="label">Description:</span> ${workItemDescription}</div>` : ''}
              ${workItemPriority ? `<div class="detail-row"><span class="label">Priority:</span> ${workItemPriority}</div>` : ''}
            </div>

            <div class="footer">
              <p>You're receiving this notification because you're watching this work item.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

    const text = `
Hello ${escapeHtml(recipient.first_name)},

A work item you're watching has been assigned:

${escapeHtml(assignedUser.first_name)} ${escapeHtml(assignedUser.last_name)} was assigned by ${escapeHtml(assignedBy.first_name)} ${escapeHtml(assignedBy.last_name)}

Work Item Details:
- Subject: ${escapeHtml(truncateText(workItem.subject, 200))}
${workItem.description ? `- Description: ${truncateText(workItem.description, 1000)}` : ''}
${workItem.priority ? `- Priority: ${truncateText(workItem.priority, 50)}` : ''}

You're receiving this notification because you're watching this work item.
  `.trim();

    return { subject, html, text };
  } catch (error) {
    log.error('Assignment template generation failed', error, {
      operation: 'getAssignmentTemplate',
    });
    throw new Error('Failed to generate assignment email template');
  }
}

/**
 * Due date reminder notification template
 */
export function getDueDateReminderTemplate(
  workItem: WorkItemContext & { due_date: Date },
  recipient: NotificationRecipient
): EmailTemplate {
  try {
    // Sanitize and escape all user input
    const recipientFirstName = escapeHtml(truncateText(recipient.first_name, 100));
    const workItemSubject = escapeHtml(truncateText(workItem.subject, 200));
    const workItemDescription = workItem.description ? nl2br(truncateText(workItem.description, 1000)) : '';
    const workItemPriority = workItem.priority ? escapeHtml(truncateText(workItem.priority, 50)) : '';

    const subject = `Due Date Reminder: ${workItemSubject}`;

    const daysUntilDue = Math.ceil(
      (workItem.due_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const urgencyClass = daysUntilDue <= 1 ? 'urgent' : daysUntilDue <= 3 ? 'warning' : 'info';
    const dueText = daysUntilDue === 0 ? 'Today' : daysUntilDue === 1 ? 'Tomorrow' : `in ${daysUntilDue} days`;
    const formattedDate = escapeHtml(workItem.due_date.toLocaleDateString());

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { background: #ffffff; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px; }
          .due-date { padding: 15px; border-radius: 4px; margin: 20px 0; text-align: center; font-size: 18px; font-weight: 600; }
          .due-date.urgent { background: #ffe0e0; color: #c92a2a; }
          .due-date.warning { background: #fff3cd; color: #856404; }
          .due-date.info { background: #e7f5ff; color: #1971c2; }
          .work-item-details { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .detail-row { margin: 8px 0; }
          .label { font-weight: 600; color: #495057; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">Due Date Reminder</h2>
          </div>
          <div class="content">
            <p>Hello ${recipientFirstName},</p>
            <p>This is a reminder about an upcoming due date for a work item you're watching:</p>

            <div class="due-date ${urgencyClass}">
              Due ${dueText}
              <br>
              <span style="font-size: 14px; font-weight: normal;">${formattedDate}</span>
            </div>

            <div class="work-item-details">
              <div class="detail-row">
                <span class="label">Subject:</span> ${workItemSubject}
              </div>
              ${workItemDescription ? `<div class="detail-row"><span class="label">Description:</span> ${workItemDescription}</div>` : ''}
              ${workItemPriority ? `<div class="detail-row"><span class="label">Priority:</span> ${workItemPriority}</div>` : ''}
            </div>

            <div class="footer">
              <p>You're receiving this notification because you're watching this work item.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

    const text = `
Hello ${escapeHtml(recipient.first_name)},

This is a reminder about an upcoming due date for a work item you're watching:

Due ${dueText}: ${formattedDate}

Work Item Details:
- Subject: ${escapeHtml(truncateText(workItem.subject, 200))}
${workItem.description ? `- Description: ${truncateText(workItem.description, 1000)}` : ''}
${workItem.priority ? `- Priority: ${truncateText(workItem.priority, 50)}` : ''}

You're receiving this notification because you're watching this work item.
  `.trim();

    return { subject, html, text };
  } catch (error) {
    log.error('Due date reminder template generation failed', error, {
      operation: 'getDueDateReminderTemplate',
    });
    throw new Error('Failed to generate due date reminder email template');
  }
}
