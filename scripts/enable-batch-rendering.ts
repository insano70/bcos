/**
 * Enable Batch Rendering for Dashboard
 *
 * Phase 7: Testing Script
 *
 * Updates a dashboard's layout_config to enable batch rendering mode.
 * This allows testing the batch API integration without affecting all dashboards.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dashboards } from '@/lib/db/schema';
import { log } from '@/lib/logger';

const DASHBOARD_ID = process.env.DASHBOARD_ID || 'a0324818-ae41-4bf5-8291-447f30322faa';

async function enableBatchRendering() {
  const startTime = Date.now();

  try {
    log.info('Enabling batch rendering for dashboard', {
      dashboardId: DASHBOARD_ID,
    });

    // Get current dashboard
    const [currentDashboard] = await db
      .select()
      .from(dashboards)
      .where(eq(dashboards.dashboard_id, DASHBOARD_ID))
      .limit(1);

    if (!currentDashboard) {
      throw new Error(`Dashboard not found: ${DASHBOARD_ID}`);
    }

    log.info('Current dashboard loaded', {
      dashboardId: DASHBOARD_ID,
      name: currentDashboard.dashboard_name,
      currentConfig: currentDashboard.layout_config,
    });

    // Update layout_config to enable batch rendering
    const updatedLayoutConfig = {
      ...(currentDashboard.layout_config as Record<string, unknown>),
      useBatchRendering: true,
    };

    const [updatedDashboard] = await db
      .update(dashboards)
      .set({
        layout_config: updatedLayoutConfig,
        updated_at: new Date(),
      })
      .where(eq(dashboards.dashboard_id, DASHBOARD_ID))
      .returning();

    const duration = Date.now() - startTime;

    log.info('Batch rendering enabled successfully', {
      dashboardId: DASHBOARD_ID,
      name: updatedDashboard?.dashboard_name,
      newConfig: updatedLayoutConfig,
      duration,
    });

    console.log('\n✅ Success! Batch rendering enabled for dashboard:');
    console.log(`   Dashboard: ${updatedDashboard?.dashboard_name}`);
    console.log(`   ID: ${DASHBOARD_ID}`);
    console.log(`   Duration: ${duration}ms`);
    console.log('\n📊 To test, visit:');
    console.log(`   http://localhost:4001/dashboard/view/${DASHBOARD_ID}`);
    console.log('\n💡 To disable batch rendering, run:');
    console.log(
      `   DASHBOARD_ID=${DASHBOARD_ID} DISABLE=true pnpm tsx scripts/enable-batch-rendering.ts`
    );
  } catch (error) {
    log.error('Failed to enable batch rendering', error, {
      dashboardId: DASHBOARD_ID,
      duration: Date.now() - startTime,
    });

    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

async function disableBatchRendering() {
  const startTime = Date.now();

  try {
    log.info('Disabling batch rendering for dashboard', {
      dashboardId: DASHBOARD_ID,
    });

    const [currentDashboard] = await db
      .select()
      .from(dashboards)
      .where(eq(dashboards.dashboard_id, DASHBOARD_ID))
      .limit(1);

    if (!currentDashboard) {
      throw new Error(`Dashboard not found: ${DASHBOARD_ID}`);
    }

    const updatedLayoutConfig = {
      ...(currentDashboard.layout_config as Record<string, unknown>),
      useBatchRendering: false,
    };

    await db
      .update(dashboards)
      .set({
        layout_config: updatedLayoutConfig,
        updated_at: new Date(),
      })
      .where(eq(dashboards.dashboard_id, DASHBOARD_ID));

    const duration = Date.now() - startTime;

    log.info('Batch rendering disabled successfully', {
      dashboardId: DASHBOARD_ID,
      duration,
    });

    console.log('\n✅ Batch rendering disabled');
    console.log(`   Duration: ${duration}ms`);
  } catch (error) {
    log.error('Failed to disable batch rendering', error);
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run based on DISABLE flag
if (process.env.DISABLE === 'true') {
  disableBatchRendering();
} else {
  enableBatchRendering();
}
