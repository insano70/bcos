-- Enable Batch Rendering for Dashboard
-- Phase 7: Testing Script
--
-- Updates dashboard layout_config to enable batch rendering mode
-- Usage: psql $DATABASE_URL -f scripts/enable-batch-rendering.sql

-- Dashboard ID from logs: a0324818-ae41-4bf5-8291-447f30322faa

-- View current config
SELECT 
  dashboard_id,
  dashboard_name,
  layout_config
FROM dashboards
WHERE dashboard_id = 'a0324818-ae41-4bf5-8291-447f30322faa';

-- Enable batch rendering
UPDATE dashboards
SET 
  layout_config = jsonb_set(
    COALESCE(layout_config, '{}'::jsonb),
    '{useBatchRendering}',
    'true'::jsonb
  ),
  updated_at = NOW()
WHERE dashboard_id = 'a0324818-ae41-4bf5-8291-447f30322faa';

-- Verify update
SELECT 
  dashboard_id,
  dashboard_name,
  layout_config->'useBatchRendering' as batch_rendering_enabled,
  layout_config
FROM dashboards
WHERE dashboard_id = 'a0324818-ae41-4bf5-8291-447f30322faa';

-- Instructions
\echo ''
\echo '✅ Batch rendering enabled!'
\echo ''
\echo '📊 To test, visit:'
\echo '   http://localhost:4001/dashboard/view/a0324818-ae41-4bf5-8291-447f30322faa'
\echo ''
\echo '💡 To disable, run:'
\echo '   UPDATE dashboards SET layout_config = jsonb_set(layout_config, ''{useBatchRendering}'', ''false''::jsonb) WHERE dashboard_id = ''a0324818-ae41-4bf5-8291-447f30322faa'';'
\echo ''

