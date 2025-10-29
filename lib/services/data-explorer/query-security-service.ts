import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

export class QuerySecurityService extends BaseRBACService {

  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  async addSecurityFilters(sql: string): Promise<string> {
    if (this.userContext.is_super_admin) {
      log.info('Super admin bypassing practice_uid filtering', {
        operation: 'explorer_security_filter',
        userId: this.userContext.user_id,
        component: 'security',
      });
      return sql;
    }

    const hasFullAccess = this.checker.hasPermission('data-explorer:execute:all');
    if (hasFullAccess) {
      log.info('User has full access, bypassing practice_uid filtering', {
        operation: 'explorer_security_filter',
        userId: this.userContext.user_id,
        component: 'security',
      });
      return sql;
    }

    const accessiblePractices = this.userContext.accessible_practices ?? [];

    if (accessiblePractices.length === 0) {
      log.security('data_explorer_access_denied', 'high', {
        reason: 'No accessible practices found',
        userId: this.userContext.user_id,
        organizationId: this.userContext.current_organization_id,
        blocked: true,
      });
      throw new Error('No accessible practices found for user. Cannot execute query.');
    }

    const filterClause = `practice_uid IN (${accessiblePractices.join(',')})`;
    const hasWhere = /\bWHERE\b/i.test(sql);
    const hasSemicolon = /;\s*$/.test(sql);
    const base = hasSemicolon ? sql.replace(/;\s*$/, '') : sql;
    const securedSQL = `${base}\n${hasWhere ? 'AND' : 'WHERE'} ${filterClause}`;

    log.info('Security filters applied', {
      operation: 'explorer_security_filter',
      userId: this.userContext.user_id,
      organizationId: this.userContext.current_organization_id,
      practiceCount: accessiblePractices.length,
      component: 'security',
    });

    return securedSQL;
  }
}
