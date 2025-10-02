import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { practice_comments } from '@/lib/db/schema';
import type { PracticeComment } from '@/lib/types/practice';

/**
 * Fetch featured comments for a practice (for carousel display)
 * Returns comments ordered by display_order, then by created_at desc
 */
export async function getFeaturedComments(practiceId: string): Promise<PracticeComment[]> {
  try {
    const comments = await db
      .select()
      .from(practice_comments)
      .where(eq(practice_comments.practice_id, practiceId))
      .orderBy(practice_comments.display_order, desc(practice_comments.created_at));

    return comments.map((comment) => ({
      comment_id: comment.comment_id,
      practice_id: comment.practice_id,
      commenter_name: comment.commenter_name,
      commenter_location: comment.commenter_location,
      comment: comment.comment,
      rating: comment.rating,
      display_order: comment.display_order ?? 0, // default to 0 if null
      created_at: comment.created_at,
    }));
  } catch (error) {
    console.error('Error fetching featured comments:', error);
    return [];
  }
}

/**
 * Get all comments for a practice (for admin purposes)
 */
export async function getAllComments(practiceId: string): Promise<PracticeComment[]> {
  try {
    const comments = await db
      .select()
      .from(practice_comments)
      .where(eq(practice_comments.practice_id, practiceId))
      .orderBy(desc(practice_comments.created_at));

    return comments.map((comment) => ({
      comment_id: comment.comment_id,
      practice_id: comment.practice_id,
      commenter_name: comment.commenter_name,
      commenter_location: comment.commenter_location,
      comment: comment.comment,
      rating: comment.rating,
      display_order: comment.display_order ?? 0, // default to 0 if null
      created_at: comment.created_at,
    }));
  } catch (error) {
    console.error('Error fetching all comments:', error);
    return [];
  }
}

/**
 * Add a new comment (typically from a form submission)
 */
export async function addComment(data: {
  practiceId: string;
  commenterName?: string;
  commenterLocation?: string;
  comment: string;
  rating: number;
  displayOrder?: number;
}): Promise<string | null> {
  try {
    const result = await db
      .insert(practice_comments)
      .values({
        practice_id: data.practiceId,
        commenter_name: data.commenterName || null,
        commenter_location: data.commenterLocation || null,
        comment: data.comment,
        rating: data.rating.toString(), // Convert to string for numeric field
        display_order: data.displayOrder || 0,
      })
      .returning({ commentId: practice_comments.comment_id });

    return result[0]?.commentId || null;
  } catch (error) {
    console.error('Error adding comment:', error);
    return null;
  }
}
