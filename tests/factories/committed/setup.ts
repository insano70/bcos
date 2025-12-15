/**
 * Register all committed factories with the global registry
 *
 * This file should be imported at the beginning of test files
 * that use the committed factories.
 */

import { FactoryRegistry } from '../base';
import { committedChartFactory } from './chart-factory';
import { committedDashboardFactory } from './dashboard-factory';
import { committedOrganizationFactory } from './organization-factory';
import { committedUserFactory } from './user-factory';
import {
  committedWorkItemFactory,
  committedWorkItemStatusFactory,
  committedWorkItemTypeFactory,
} from './work-item-factory';

// Register all factories
// Order here doesn't matter - cleanup order is determined by CLEANUP_ORDER in cleanup-tracker.ts
FactoryRegistry.registerFactory('user', committedUserFactory);
FactoryRegistry.registerFactory('organization', committedOrganizationFactory);
FactoryRegistry.registerFactory('dashboard', committedDashboardFactory);
FactoryRegistry.registerFactory('chart', committedChartFactory);
FactoryRegistry.registerFactory('work_item', committedWorkItemFactory);
FactoryRegistry.registerFactory('work_item_type', committedWorkItemTypeFactory);
FactoryRegistry.registerFactory('work_item_status', committedWorkItemStatusFactory);
