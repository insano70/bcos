-- Migration: WebAuthn MFA Support
-- Adds passkey/WebAuthn authentication tables and extends account_security

-- WebAuthn Credentials Table
-- Stores user passkeys with public keys, counters, and metadata
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  credential_id VARCHAR(255) PRIMARY KEY, -- Base64URL encoded credential ID
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- WebAuthn spec fields
  public_key TEXT NOT NULL, -- Base64URL encoded COSE public key
  counter INTEGER NOT NULL DEFAULT 0, -- Signature counter for clone detection
  credential_device_type VARCHAR(32) NOT NULL, -- 'platform' (Touch ID, Face ID) or 'cross-platform' (USB key)
  transports TEXT, -- JSON array: ['usb', 'nfc', 'ble', 'internal']
  aaguid TEXT, -- Authenticator AAGUID for device identification

  -- User-facing metadata
  credential_name VARCHAR(100) NOT NULL, -- "MacBook Pro Touch ID", "YubiKey 5C"
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used TIMESTAMP WITH TIME ZONE,

  -- Security tracking
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE, -- Backup eligible flag (BE flag from authenticator)
  registration_ip VARCHAR(45) NOT NULL,
  registration_user_agent TEXT
);

-- Indexes for webauthn_credentials
CREATE INDEX idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);
CREATE INDEX idx_webauthn_credentials_active ON webauthn_credentials(is_active);
CREATE INDEX idx_webauthn_credentials_last_used ON webauthn_credentials(last_used);

-- WebAuthn Challenges Table
-- Temporary storage for registration and authentication challenges
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge_id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL, -- User performing the operation
  challenge VARCHAR(255) NOT NULL, -- Base64URL encoded random challenge
  challenge_type VARCHAR(20) NOT NULL, -- 'registration' or 'authentication'

  -- Security context
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT,

  -- Expiration and one-time use
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- 5-minute TTL
  used_at TIMESTAMP WITH TIME ZONE -- One-time use enforcement
);

-- Indexes for webauthn_challenges
CREATE INDEX idx_webauthn_challenges_user_id ON webauthn_challenges(user_id);
CREATE INDEX idx_webauthn_challenges_expires_at ON webauthn_challenges(expires_at);
CREATE INDEX idx_webauthn_challenges_challenge_type ON webauthn_challenges(challenge_type);

-- Extend account_security table for MFA tracking
ALTER TABLE account_security
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_method VARCHAR(20), -- 'webauthn' (future: 'totp')
  ADD COLUMN IF NOT EXISTS mfa_enforced_at TIMESTAMP WITH TIME ZONE;

-- Create index for MFA status queries
CREATE INDEX idx_account_security_mfa_enabled ON account_security(mfa_enabled);

-- Comments for documentation
COMMENT ON TABLE webauthn_credentials IS 'User passkey credentials with public keys and metadata';
COMMENT ON COLUMN webauthn_credentials.counter IS 'Signature counter incremented on each use - clone detection';
COMMENT ON COLUMN webauthn_credentials.backed_up IS 'Backup eligible flag - indicates if credential is synced across devices';
COMMENT ON COLUMN webauthn_credentials.credential_device_type IS 'Platform authenticators (Touch ID, Face ID) vs cross-platform (USB keys)';

COMMENT ON TABLE webauthn_challenges IS 'Temporary challenge storage for WebAuthn registration and authentication';
COMMENT ON COLUMN webauthn_challenges.used_at IS 'One-time use enforcement - prevents replay attacks';
COMMENT ON COLUMN webauthn_challenges.expires_at IS '5-minute expiration for security';

COMMENT ON COLUMN account_security.mfa_enabled IS 'Whether MFA is enabled for this user account';
COMMENT ON COLUMN account_security.mfa_method IS 'MFA method in use: webauthn (passkeys)';
COMMENT ON COLUMN account_security.mfa_enforced_at IS 'When MFA was enforced for this user';
