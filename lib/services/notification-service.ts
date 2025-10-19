import { and, eq } from 'drizzle-orm';
import type { EmailService } from '@/lib/api/services/email';
import { getEmailService } from '@/lib/api/services/email';
import {
  getStatusChangeTemplate,
  getCommentTemplate,
  getAssignmentTemplate,
  getDueDateReminderTemplate,
} from '@/lib/api/services/email/templates/work-item-templates';
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
      const emailPromises = recipients.map((recipient) => {
        const template = getStatusChangeTemplate(workItem, oldStatus, newStatus, recipient);
        return this.emailService
          .sendWorkItemNotification(recipient.email, template.subject, template.html, template.text || '')
          .catch((error) => {
            // Log error but don't throw - notification failures shouldn't break operations
            log.error('Failed to send status change notification', error, {
              work_item_id: workItem.work_item_id,
              recipient_email: recipient.email,
            });
          });
      });

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
      const emailPromises = filteredRecipients.map((recipient) => {
        const template = getCommentTemplate(workItem, comment, commenterName, recipient);
        return this.emailService
          .sendWorkItemNotification(recipient.email, template.subject, template.html, template.text || '')
          .catch((error) => {
            log.error('Failed to send comment notification', error, {
              work_item_id: workItem.work_item_id,
              recipient_email: recipient.email,
            });
          });
      });

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
      const emailPromises = recipients.map((recipient) => {
        const template = getAssignmentTemplate(workItem, assignedUser, assignedBy, recipient);
        return this.emailService
          .sendWorkItemNotification(recipient.email, template.subject, template.html, template.text || '')
          .catch((error) => {
            log.error('Failed to send assignment notification', error, {
              work_item_id: workItem.work_item_id,
              recipient_email: recipient.email,
            });
          });
      });

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
      const emailPromises = recipients.map((recipient) => {
        const template = getDueDateReminderTemplate(workItem, recipient);
        return this.emailService
          .sendWorkItemNotification(recipient.email, template.subject, template.html, template.text || '')
          .catch((error) => {
            log.error('Failed to send due date reminder notification', error, {
              work_item_id: workItem.work_item_id,
              recipient_email: recipient.email,
            });
          });
      });

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

}

/**
 * Factory function to create NotificationService instance
 */
export function createNotificationService(): NotificationService {
  return new NotificationService();
}
