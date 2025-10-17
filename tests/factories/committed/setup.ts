/**
 * Register all committed factories with the global registry
 *
 * This file should be imported at the beginning of test files
 * that use the committed factories.
 */

import { FactoryRegistry } from '../base';
import { committedChartFactory } from './chart-factory';
import { committedDashboardFactory } from './dashboard-factory';
import { committedUserFactory } from './user-factory';

// Register all factories
FactoryRegistry.registerFactory('user', committedUserFactory);
FactoryRegistry.registerFactory('dashboard', committedDashboardFactory);
FactoryRegistry.registerFactory('chart', committedChartFactory);
