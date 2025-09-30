-- Assign super_admin role to your test user

-- First, find the super_admin role ID
SELECT role_id, name FROM roles WHERE name = 'super_admin' LIMIT 1;

-- Then assign it to your user (replace USER_EMAIL with your email)
INSERT INTO user_roles (
  user_role_id,
  user_id,
  role_id,
  organization_id,
  granted_by,
  granted_at,
  is_active
)
SELECT
  gen_random_uuid(),
  u.user_id,
  r.role_id,
  NULL, -- super_admin is global, not organization-specific
  u.user_id, -- Self-granted for initial setup
  NOW(),
  true
FROM users u
CROSS JOIN roles r
WHERE u.email = 'pj@illumination.health'
  AND r.name = 'super_admin'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id
  );

-- Verify
SELECT 
  u.email,
  r.name as role_name,
  ur.is_active
FROM users u
JOIN user_roles ur ON u.user_id = ur.user_id
JOIN roles r ON ur.role_id = r.role_id
WHERE u.email = 'pj@illumination.health';
