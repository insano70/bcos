import { and, eq } from 'drizzle-orm';
import type { EmailService } from '@/lib/api/services/email';
import { getEmailService } from '@/lib/api/services/email-service-instance';
import { db } from '@/lib/db';
import { users, work_item_watchers } from '@/lib/db/schema';
import type { WorkItemStatus } from '@/lib/hooks/use-work-item-statuses';
import type { WorkItemComment } from '@/lib/hooks/use-work-items';
import { log } from '@/lib/logger';

interface NotificationRecipient {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface WorkItemContext {
  work_item_id: string;
  subject: string;
  description: string | null;
  priority: string | null;
  organization_id: string;
  organization_name?: string;
}

/**
 * NotificationService
 *
 * Handles work item-related notifications:
 * - Status change notifications
 * - Comment notifications
 * - Assignment notifications
 * - Due date reminder notifications
 *
 * Integrates with the existing EmailService and respects watcher preferences.
 */
export class NotificationService {
  private emailService: EmailService;

  constructor() {
    this.emailService = getEmailService();
  }

  /**
   * Send status change notification to watchers
   */
  async sendStatusChangeNotification(
    workItem: WorkItemContext,
    oldStatus: WorkItemStatus,
    newStatus: WorkItemStatus
  ): Promise<void> {
    const startTime = Date.now();

    try {
      log.info('Sending status change notification', {
        work_item_id: workItem.work_item_id,
        oldStatus: oldStatus.status_name,
        newStatus: newStatus.status_name,
      });

      // Get recipients who want status change notifications
      const recipients = await this.getNotificationRecipients(
        workItem.work_item_id,
        'notify_status_changes'
      );

      if (recipients.length === 0) {
        log.info('No recipients for status change notification', {
          work_item_id: workItem.work_item_id,
        });
        return;
      }

      // Send notification to each recipient
      const emailPromises = recipients.map((recipient) =>
        this.emailService
          .sendWorkItemNotification(
            recipient.email,
            `Work Item Status Changed: ${workItem.subject}`,
            this.generateStatusChangeEmailHtml(workItem, oldStatus, newStatus, recipient),
            this.generateStatusChangeEmailText(workItem, oldStatus, newStatus, recipient)
          )
          .catch((error) => {
            // Log error but don't throw - notification failures shouldn't break operations
            log.error('Failed to send status change notification', error, {
              work_item_id: workItem.work_item_id,
              recipient_email: recipient.email,
            });
          })
      );

      await Promise.allSettled(emailPromises);

      const duration = Date.now() - startTime;
      log.info('Status change notifications sent', {
        work_item_id: workItem.work_item_id,
        recipientCount: recipients.length,
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log.error('Failed to send status change notifications', error, {
        work_item_id: workItem.work_item_id,
        duration,
      });
      // Don't throw - notification failures shouldn't break operations
    }
  }

  /**
   * Send comment notification to watchers
   */
  async sendCommentNotification(
    workItem: WorkItemContext,
    comment: WorkItemComment,
    commenterName: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      log.info('Sending comment notification', {
        work_item_id: workItem.work_item_id,
        comment_id: comment.work_item_comment_id,
      });

      // Get recipients who want comment notifications (excluding commenter)
      const recipients = await this.getNotificationRecipients(
        workItem.work_item_id,
        'notify_comments'
      );

      // Filter out the commenter
      const filteredRecipients = recipients.filter(
        (recipient) => recipient.user_id !== comment.user_id
      );

      if (filteredRecipients.length === 0) {
        log.info('No recipients for comment notification', {
          work_item_id: workItem.work_item_id,
        });
        return;
      }

      // Send notification to each recipient
      const emailPromises = filteredRecipients.map((recipient) =>
        this.emailService
          .sendWorkItemNotification(
            recipient.email,
            `New Comment on Work Item: ${workItem.subject}`,
            this.generateCommentEmailHtml(workItem, comment, commenterName, recipient),
            this.generateCommentEmailText(workItem, comment, commenterName, recipient)
          )
          .catch((error) => {
            log.error('Failed to send comment notification', error, {
              work_item_id: workItem.work_item_id,
              recipient_email: recipient.email,
            });
          })
      );

      await Promise.allSettled(emailPromises);

      const duration = Date.now() - startTime;
      log.info('Comment notifications sent', {
        work_item_id: workItem.work_item_id,
        recipientCount: filteredRecipients.length,
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log.error('Failed to send comment notifications', error, {
        work_item_id: workItem.work_item_id,
        duration,
      });
    }
  }

  /**
   * Send assignment notification to watchers
   */
  async sendAssignmentNotification(
    workItem: WorkItemContext,
    assignedUser: { user_id: string; email: string; first_name: string; last_name: string },
    assignedBy: { first_name: string; last_name: string }
  ): Promise<void> {
    const startTime = Date.now();

    try {
      log.info('Sending assignment notification', {
        work_item_id: workItem.work_item_id,
        assigned_to: assignedUser.user_id,
      });

      // Get recipients who want assignment notifications
      const recipients = await this.getNotificationRecipients(
        workItem.work_item_id,
        'notify_assignments'
      );

      if (recipients.length === 0) {
        log.info('No recipients for assignment notification', {
          work_item_id: workItem.work_item_id,
        });
        return;
      }

      // Send notification to each recipient
      const emailPromises = recipients.map((recipient) =>
        this.emailService
          .sendWorkItemNotification(
            recipient.email,
            `Work Item Assigned: ${workItem.subject}`,
            this.generateAssignmentEmailHtml(workItem, assignedUser, assignedBy, recipient),
            this.generateAssignmentEmailText(workItem, assignedUser, assignedBy, recipient)
          )
          .catch((error) => {
            log.error('Failed to send assignment notification', error, {
              work_item_id: workItem.work_item_id,
              recipient_email: recipient.email,
            });
          })
      );

      await Promise.allSettled(emailPromises);

      const duration = Date.now() - startTime;
      log.info('Assignment notifications sent', {
        work_item_id: workItem.work_item_id,
        recipientCount: recipients.length,
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log.error('Failed to send assignment notifications', error, {
        work_item_id: workItem.work_item_id,
        duration,
      });
    }
  }

  /**
   * Send due date reminder notification to watchers
   */
  async sendDueDateReminderNotification(
    workItem: WorkItemContext & { due_date: Date }
  ): Promise<void> {
    const startTime = Date.now();

    try {
      log.info('Sending due date reminder notification', {
        work_item_id: workItem.work_item_id,
        due_date: workItem.due_date,
      });

      // Get recipients who want due date notifications
      const recipients = await this.getNotificationRecipients(
        workItem.work_item_id,
        'notify_due_date'
      );

      if (recipients.length === 0) {
        log.info('No recipients for due date reminder notification', {
          work_item_id: workItem.work_item_id,
        });
        return;
      }

      // Send notification to each recipient
      const emailPromises = recipients.map((recipient) =>
        this.emailService
          .sendWorkItemNotification(
            recipient.email,
            `Due Date Reminder: ${workItem.subject}`,
            this.generateDueDateReminderEmailHtml(workItem, recipient),
            this.generateDueDateReminderEmailText(workItem, recipient)
          )
          .catch((error) => {
            log.error('Failed to send due date reminder notification', error, {
              work_item_id: workItem.work_item_id,
              recipient_email: recipient.email,
            });
          })
      );

      await Promise.allSettled(emailPromises);

      const duration = Date.now() - startTime;
      log.info('Due date reminder notifications sent', {
        work_item_id: workItem.work_item_id,
        recipientCount: recipients.length,
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log.error('Failed to send due date reminder notifications', error, {
        work_item_id: workItem.work_item_id,
        duration,
      });
    }
  }

  /**
   * Get notification recipients for a work item filtered by notification type
   */
  private async getNotificationRecipients(
    workItemId: string,
    notificationType:
      | 'notify_status_changes'
      | 'notify_comments'
      | 'notify_assignments'
      | 'notify_due_date'
  ): Promise<NotificationRecipient[]> {
    try {
      const results = await db
        .select({
          user_id: work_item_watchers.user_id,
          email: users.email,
          first_name: users.first_name,
          last_name: users.last_name,
        })
        .from(work_item_watchers)
        .leftJoin(users, eq(work_item_watchers.user_id, users.user_id))
        .where(
          and(
            eq(work_item_watchers.work_item_id, workItemId),
            eq(work_item_watchers[notificationType], true)
          )
        );

      return results.filter((r) => r.email !== null) as NotificationRecipient[];
    } catch (error) {
      log.error('Failed to get notification recipients', error, {
        work_item_id: workItemId,
        notificationType,
      });
      return [];
    }
  }

  /**
   * Generate status change email HTML
   */
  private generateStatusChangeEmailHtml(
    workItem: WorkItemContext,
    oldStatus: WorkItemStatus,
    newStatus: WorkItemStatus,
    recipient: NotificationRecipient
  ): string {
    return `
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
              <p>Hello ${recipient.first_name},</p>
              <p>The status of a work item you're watching has changed:</p>

              <div class="status-change">
                <span class="status status-old">${oldStatus.status_name}</span>
                <span class="arrow">→</span>
                <span class="status status-new">${newStatus.status_name}</span>
              </div>

              <div class="work-item-details">
                <div class="detail-row">
                  <span class="label">Subject:</span> ${workItem.subject}
                </div>
                ${workItem.description ? `<div class="detail-row"><span class="label">Description:</span> ${workItem.description}</div>` : ''}
                ${workItem.priority ? `<div class="detail-row"><span class="label">Priority:</span> ${workItem.priority}</div>` : ''}
                ${workItem.organization_name ? `<div class="detail-row"><span class="label">Organization:</span> ${workItem.organization_name}</div>` : ''}
              </div>

              <div class="footer">
                <p>You're receiving this notification because you're watching this work item.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate status change email plain text
   */
  private generateStatusChangeEmailText(
    workItem: WorkItemContext,
    oldStatus: WorkItemStatus,
    newStatus: WorkItemStatus,
    recipient: NotificationRecipient
  ): string {
    return `
Hello ${recipient.first_name},

The status of a work item you're watching has changed:

${oldStatus.status_name} → ${newStatus.status_name}

Work Item Details:
- Subject: ${workItem.subject}
${workItem.description ? `- Description: ${workItem.description}` : ''}
${workItem.priority ? `- Priority: ${workItem.priority}` : ''}
${workItem.organization_name ? `- Organization: ${workItem.organization_name}` : ''}

You're receiving this notification because you're watching this work item.
    `.trim();
  }

  /**
   * Generate comment email HTML
   */
  private generateCommentEmailHtml(
    workItem: WorkItemContext,
    comment: WorkItemComment,
    commenterName: string,
    recipient: NotificationRecipient
  ): string {
    return `
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
              <p>Hello ${recipient.first_name},</p>
              <p><strong>${commenterName}</strong> commented on a work item you're watching:</p>

              <div class="comment">
                <div class="comment-meta">Comment by ${commenterName}</div>
                <div>${comment.comment_text}</div>
              </div>

              <div class="work-item-details">
                <div class="detail-row">
                  <span class="label">Subject:</span> ${workItem.subject}
                </div>
                ${workItem.description ? `<div class="detail-row"><span class="label">Description:</span> ${workItem.description}</div>` : ''}
              </div>

              <div class="footer">
                <p>You're receiving this notification because you're watching this work item.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate comment email plain text
   */
  private generateCommentEmailText(
    workItem: WorkItemContext,
    comment: WorkItemComment,
    commenterName: string,
    recipient: NotificationRecipient
  ): string {
    return `
Hello ${recipient.first_name},

${commenterName} commented on a work item you're watching:

"${comment.comment_text}"

Work Item Details:
- Subject: ${workItem.subject}
${workItem.description ? `- Description: ${workItem.description}` : ''}

You're receiving this notification because you're watching this work item.
    `.trim();
  }

  /**
   * Generate assignment email HTML
   */
  private generateAssignmentEmailHtml(
    workItem: WorkItemContext,
    assignedUser: { first_name: string; last_name: string },
    assignedBy: { first_name: string; last_name: string },
    recipient: NotificationRecipient
  ): string {
    return `
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
              <p>Hello ${recipient.first_name},</p>
              <p>A work item you're watching has been assigned:</p>

              <div class="assignment">
                <strong>${assignedUser.first_name} ${assignedUser.last_name}</strong> was assigned by
                <strong>${assignedBy.first_name} ${assignedBy.last_name}</strong>
              </div>

              <div class="work-item-details">
                <div class="detail-row">
                  <span class="label">Subject:</span> ${workItem.subject}
                </div>
                ${workItem.description ? `<div class="detail-row"><span class="label">Description:</span> ${workItem.description}</div>` : ''}
                ${workItem.priority ? `<div class="detail-row"><span class="label">Priority:</span> ${workItem.priority}</div>` : ''}
              </div>

              <div class="footer">
                <p>You're receiving this notification because you're watching this work item.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate assignment email plain text
   */
  private generateAssignmentEmailText(
    workItem: WorkItemContext,
    assignedUser: { first_name: string; last_name: string },
    assignedBy: { first_name: string; last_name: string },
    recipient: NotificationRecipient
  ): string {
    return `
Hello ${recipient.first_name},

A work item you're watching has been assigned:

${assignedUser.first_name} ${assignedUser.last_name} was assigned by ${assignedBy.first_name} ${assignedBy.last_name}

Work Item Details:
- Subject: ${workItem.subject}
${workItem.description ? `- Description: ${workItem.description}` : ''}
${workItem.priority ? `- Priority: ${workItem.priority}` : ''}

You're receiving this notification because you're watching this work item.
    `.trim();
  }

  /**
   * Generate due date reminder email HTML
   */
  private generateDueDateReminderEmailHtml(
    workItem: WorkItemContext & { due_date: Date },
    recipient: NotificationRecipient
  ): string {
    const daysUntilDue = Math.ceil(
      (workItem.due_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const urgencyClass = daysUntilDue <= 1 ? 'urgent' : daysUntilDue <= 3 ? 'warning' : 'info';

    return `
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
              <p>Hello ${recipient.first_name},</p>
              <p>This is a reminder about an upcoming due date for a work item you're watching:</p>

              <div class="due-date ${urgencyClass}">
                Due ${daysUntilDue === 0 ? 'Today' : daysUntilDue === 1 ? 'Tomorrow' : `in ${daysUntilDue} days`}
                <br>
                <span style="font-size: 14px; font-weight: normal;">${workItem.due_date.toLocaleDateString()}</span>
              </div>

              <div class="work-item-details">
                <div class="detail-row">
                  <span class="label">Subject:</span> ${workItem.subject}
                </div>
                ${workItem.description ? `<div class="detail-row"><span class="label">Description:</span> ${workItem.description}</div>` : ''}
                ${workItem.priority ? `<div class="detail-row"><span class="label">Priority:</span> ${workItem.priority}</div>` : ''}
              </div>

              <div class="footer">
                <p>You're receiving this notification because you're watching this work item.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate due date reminder email plain text
   */
  private generateDueDateReminderEmailText(
    workItem: WorkItemContext & { due_date: Date },
    recipient: NotificationRecipient
  ): string {
    const daysUntilDue = Math.ceil(
      (workItem.due_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    return `
Hello ${recipient.first_name},

This is a reminder about an upcoming due date for a work item you're watching:

Due ${daysUntilDue === 0 ? 'Today' : daysUntilDue === 1 ? 'Tomorrow' : `in ${daysUntilDue} days`}: ${workItem.due_date.toLocaleDateString()}

Work Item Details:
- Subject: ${workItem.subject}
${workItem.description ? `- Description: ${workItem.description}` : ''}
${workItem.priority ? `- Priority: ${workItem.priority}` : ''}

You're receiving this notification because you're watching this work item.
    `.trim();
  }
}

/**
 * Factory function to create NotificationService instance
 */
export function createNotificationService(): NotificationService {
  return new NotificationService();
}
