import { describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup'; // Import integration setup for database access
import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { createTestUser } from '@/tests/factories';
import { getCurrentTransaction } from '@/tests/helpers/db-helper';
import { generateUniqueEmail } from '@/tests/helpers/unique-generator';

describe('User CRUD Operations', () => {
  describe('createTestUser factory', () => {
    it('should create a user with default values', async () => {
      const user = await createTestUser();

      expect(user).toBeDefined();
      expect(user.user_id).toBeDefined();
      expect(user.email).toMatch(/@test\.local$/);
      expect(user.first_name).toBe('Test');
      expect(user.last_name).toBe('User');
      expect(user.email_verified).toBe(false);
      expect(user.is_active).toBe(true);
      expect(user.created_at).toBeInstanceOf(Date);
      expect(user.updated_at).toBeInstanceOf(Date);
      expect(user.deleted_at).toBeNull();
    });

    it('should create a user with custom values', async () => {
      const customEmail = generateUniqueEmail('custom');
      const customUser = await createTestUser({
        email: customEmail,
        firstName: 'John',
        lastName: 'Doe',
        emailVerified: true,
        isActive: false,
      });

      expect(customUser.email).toBe(customEmail);
      expect(customUser.first_name).toBe('John');
      expect(customUser.last_name).toBe('Doe');
      expect(customUser.email_verified).toBe(true);
      expect(customUser.is_active).toBe(false);
    });

    it('should create users with unique identifiers', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      expect(user1.user_id).not.toBe(user2.user_id);
      expect(user1.email).not.toBe(user2.email);
    });
  });

  describe('Database operations', () => {
    it('should persist user to database', async () => {
      const createdUser = await createTestUser();
      const tx = getCurrentTransaction();

      // Query the user back from database
      const [foundUser] = await tx
        .select()
        .from(users)
        .where(eq(users.user_id, createdUser.user_id));

      expect(foundUser).toBeDefined();
      expect(foundUser?.user_id).toBe(createdUser.user_id);
      expect(foundUser?.email).toBe(createdUser.email);
    });

    it('should support user updates', async () => {
      const user = await createTestUser();
      const tx = getCurrentTransaction();

      const newEmail = generateUniqueEmail('updated');
      const newFirstName = 'Updated';

      // Update the user
      const [updatedUser] = await tx
        .update(users)
        .set({
          email: newEmail,
          first_name: newFirstName,
          updated_at: new Date(),
        })
        .where(eq(users.user_id, user.user_id))
        .returning();

      expect(updatedUser).toBeDefined();
      expect(updatedUser?.email).toBe(newEmail);
      expect(updatedUser?.first_name).toBe(newFirstName);
      expect(updatedUser?.updated_at?.getTime()).toBeGreaterThan(user.updated_at?.getTime());
    });

    it('should support user soft deletion', async () => {
      const user = await createTestUser();
      const tx = getCurrentTransaction();

      // Soft delete the user
      const [deletedUser] = await tx
        .update(users)
        .set({
          deleted_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(users.user_id, user.user_id))
        .returning();

      expect(deletedUser).toBeDefined();
      expect(deletedUser?.deleted_at).toBeInstanceOf(Date);

      // Verify user is not returned in normal queries (assuming soft delete filter)
      const foundUsers = await tx.select().from(users).where(eq(users.user_id, user.user_id));

      // Note: This test assumes the application uses soft delete filtering
      // The actual behavior depends on how your queries are structured
      expect(foundUsers).toHaveLength(1); // Still exists in DB
      expect(foundUsers[0]?.deleted_at).toBeInstanceOf(Date);
    });
  });

  describe('Factory variations', () => {
    it('should create admin-like users', async () => {
      const adminUser = await createTestUser({
        firstName: 'Admin',
        lastName: 'User',
        emailVerified: true,
        isActive: true,
      });

      expect(adminUser.first_name).toBe('Admin');
      expect(adminUser.last_name).toBe('User');
      expect(adminUser.email_verified).toBe(true);
      expect(adminUser.is_active).toBe(true);
    });

    it('should create inactive users', async () => {
      const inactiveUser = await createTestUser({
        isActive: false,
      });

      expect(inactiveUser.is_active).toBe(false);
    });

    it('should create unverified users', async () => {
      const unverifiedUser = await createTestUser({
        emailVerified: false,
      });

      expect(unverifiedUser.email_verified).toBe(false);
    });
  });
});
