/**
 * Migration: SAML SSO Support
 * 
 * Makes password_hash nullable to support SSO-only users
 * 
 * Security Model:
 * - Users with password_hash: Can use email/password OR SAML SSO (hybrid)
 * - Users with NULL password_hash: Can ONLY use SAML SSO (SSO-only)
 * - Password login validation will reject NULL password_hash users
 * 
 * @migration 0015
 * @date 2025-09-30
 * @author SAML SSO Implementation
 */


-- Make password_hash nullable to support SSO-only users
-- Users created via SAML can have NULL password_hash
-- Password-based login will validate password_hash is NOT NULL before attempting verification
ALTER TABLE users 
  ALTER COLUMN password_hash DROP NOT NULL;

-- Add comment documenting the security model
COMMENT ON COLUMN users.password_hash IS 
  'Bcrypt password hash. NULL for SSO-only users who authenticate exclusively via SAML. Users with a hash can use both password and SAML authentication.';

-- Migration completed successfully

