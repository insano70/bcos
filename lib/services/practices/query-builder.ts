/**
 * Practice Query Builder
 *
 * Provides reusable SELECT statement builders for practice queries.
 * Eliminates duplication across service methods.
 */

import { practices, templates, users } from '@/lib/db';

/**
 * Standard practice query projection
 * Used in getPractices, getPracticeById, createPractice, updatePractice
 *
 * @returns Object with practice fields mapped to query columns
 */
export function getPracticeQueryBuilder() {
  return {
    id: practices.practice_id,
    name: practices.name,
    domain: practices.domain,
    status: practices.status,
    template_id: practices.template_id,
    template_name: templates.name,
    owner_email: users.email,
    owner_user_id: practices.owner_user_id,
    created_at: practices.created_at,
    updated_at: practices.updated_at,
  };
}
