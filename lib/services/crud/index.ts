/**
 * Generic CRUD Service Infrastructure
 *
 * Provides a configuration-driven base class for creating CRUD services
 * with automatic RBAC, logging, soft delete, and organization scoping.
 *
 * @example
 * ```typescript
 * import { BaseCrudService, type CrudServiceConfig, type ListResponse } from '@/lib/services/crud';
 * import type { InferSelectModel } from 'drizzle-orm';
 * import { templates } from '@/lib/db/schema';
 *
 * type TemplateEntity = InferSelectModel<typeof templates>;
 *
 * export class RBACTemplatesService extends BaseCrudService<
 *   typeof templates,
 *   TemplateEntity,
 *   CreateTemplateData,
 *   UpdateTemplateData
 * > {
 *   protected config: CrudServiceConfig<...> = { ... };
 * }
 * ```
 */

export { BaseCrudService } from './base-crud-service';
export type {
  BaseQueryOptions,
  CrudServiceConfig,
  CrudServiceInterface,
  EntityFromConfig,
  FieldChange,
  JoinDefinition,
  JoinQueryConfig,
  JoinQueryOptions,
  ListResponse,
  WhereCondition,
} from './types';
