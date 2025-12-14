import { describe, it, expect } from 'vitest';
import {
  parseSQL,
  checkDestructiveOperations,
  validateTablesAgainstAllowList,
  injectSecurityFilter,
  validateSQL,
} from '@/lib/services/data-explorer/sql-ast-parser';

describe('SQL AST Parser', () => {
  describe('parseSQL', () => {
    it('should parse simple SELECT query', () => {
      const result = parseSQL('SELECT * FROM ih.patients');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.statementType).toBe('select');
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0]).toEqual({
        schema: 'ih',
        table: 'patients',
        alias: null,
      });
    });

    it('should parse query with table alias', () => {
      const result = parseSQL('SELECT p.* FROM ih.patients p');

      expect(result.isValid).toBe(true);
      expect(result.tables[0]).toEqual({
        schema: 'ih',
        table: 'patients',
        alias: 'p',
      });
    });

    it('should parse query with JOIN', () => {
      const result = parseSQL(
        'SELECT * FROM ih.patients p JOIN ih.appointments a ON p.id = a.patient_id'
      );

      expect(result.isValid).toBe(true);
      expect(result.tables).toHaveLength(2);
      expect(result.tables.map((t) => t.table)).toContain('patients');
      expect(result.tables.map((t) => t.table)).toContain('appointments');
    });

    it('should reject UNION queries', () => {
      const result = parseSQL(
        'SELECT id FROM ih.patients UNION SELECT id FROM ih.providers'
      );

      expect(result.isValid).toBe(false);
      expect(result.hasUnion).toBe(true);
      expect(result.errors).toContain('UNION queries are not allowed for security reasons');
    });

    it('should reject subqueries in FROM clause', () => {
      const result = parseSQL(
        'SELECT * FROM (SELECT * FROM ih.patients) AS subq'
      );

      expect(result.isValid).toBe(false);
      expect(result.hasSubquery).toBe(true);
      expect(result.errors).toContain('Subqueries in FROM clause are not allowed for security reasons');
    });

    it('should reject subqueries in WHERE clause', () => {
      const result = parseSQL(
        'SELECT * FROM ih.patients WHERE id IN (SELECT patient_id FROM ih.appointments)'
      );

      expect(result.isValid).toBe(false);
      expect(result.hasSubquery).toBe(true);
      // The error message can be for WHERE or IN clause subqueries
      expect(result.errors.some((e) => e.includes('Subqueries'))).toBe(true);
    });

    it('should reject non-SELECT statements', () => {
      const insertResult = parseSQL('INSERT INTO ih.patients VALUES (1, "test")');
      expect(insertResult.errors.some((e) => e.includes('Only SELECT statements are allowed'))).toBe(true);

      const updateResult = parseSQL('UPDATE ih.patients SET name = "test"');
      expect(updateResult.errors.some((e) => e.includes('Only SELECT statements are allowed'))).toBe(true);

      const deleteResult = parseSQL('DELETE FROM ih.patients');
      expect(deleteResult.errors.some((e) => e.includes('Only SELECT statements are allowed'))).toBe(true);
    });

    it('should reject multiple statements', () => {
      const result = parseSQL('SELECT * FROM ih.patients; SELECT * FROM ih.providers');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Multiple SQL statements not allowed');
    });

    it('should handle invalid SQL gracefully', () => {
      const result = parseSQL('NOT VALID SQL QUERY');

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('parse error'))).toBe(true);
    });
  });

  describe('checkDestructiveOperations', () => {
    it('should detect DROP', () => {
      expect(checkDestructiveOperations('DROP TABLE ih.patients')).toContain('DROP');
    });

    it('should detect TRUNCATE', () => {
      expect(checkDestructiveOperations('TRUNCATE TABLE ih.patients')).toContain('TRUNCATE');
    });

    it('should detect DELETE', () => {
      expect(checkDestructiveOperations('DELETE FROM ih.patients')).toContain('DELETE');
    });

    it('should detect INSERT', () => {
      expect(checkDestructiveOperations('INSERT INTO ih.patients VALUES (1)')).toContain('INSERT');
    });

    it('should detect UPDATE', () => {
      expect(checkDestructiveOperations('UPDATE ih.patients SET name = "x"')).toContain('UPDATE');
    });

    it('should detect ALTER', () => {
      expect(checkDestructiveOperations('ALTER TABLE ih.patients ADD COLUMN x TEXT')).toContain('ALTER');
    });

    it('should detect CREATE', () => {
      expect(checkDestructiveOperations('CREATE TABLE ih.test (id INT)')).toContain('CREATE');
    });

    it('should not flag safe SELECT queries', () => {
      expect(checkDestructiveOperations('SELECT * FROM ih.patients')).toHaveLength(0);
    });

    it('should detect keywords case-insensitively', () => {
      expect(checkDestructiveOperations('drop TABLE ih.test')).toContain('DROP');
      expect(checkDestructiveOperations('DeLeTe FROM ih.test')).toContain('DELETE');
    });
  });

  describe('validateTablesAgainstAllowList', () => {
    const allowedTables = new Set(['ih.patients', 'patients', 'ih.appointments', 'appointments']);

    it('should allow tables in the allow-list', () => {
      const tables = [
        { schema: 'ih', table: 'patients', alias: null },
        { schema: 'ih', table: 'appointments', alias: 'a' },
      ];

      const disallowed = validateTablesAgainstAllowList(tables, allowedTables);
      expect(disallowed).toHaveLength(0);
    });

    it('should reject tables not in allow-list', () => {
      const tables = [
        { schema: 'ih', table: 'patients', alias: null },
        { schema: 'public', table: 'secrets', alias: null },
      ];

      const disallowed = validateTablesAgainstAllowList(tables, allowedTables);
      expect(disallowed).toContain('public.secrets');
    });

    it('should handle tables without schema', () => {
      const tables = [{ schema: null, table: 'patients', alias: null }];

      const disallowed = validateTablesAgainstAllowList(tables, allowedTables);
      expect(disallowed).toHaveLength(0);
    });
  });

  describe('injectSecurityFilter', () => {
    it('should inject WHERE clause for single practice', () => {
      const parseResult = parseSQL('SELECT * FROM ih.patients');
      expect(parseResult.ast).not.toBeNull();

      const ast = parseResult.ast;
      if (!ast) {
        throw new Error('Expected AST');
      }

      const result = injectSecurityFilter(ast, [42]);

      expect(result.success).toBe(true);
      expect(result.sql.toLowerCase()).toContain('where');
      expect(result.sql).toContain('practice_uid');
      expect(result.sql).toContain('42');
    });

    it('should inject IN clause for multiple practices', () => {
      const parseResult = parseSQL('SELECT * FROM ih.patients');
      expect(parseResult.ast).not.toBeNull();

      const ast = parseResult.ast;
      if (!ast) {
        throw new Error('Expected AST');
      }

      const result = injectSecurityFilter(ast, [1, 2, 3]);

      expect(result.success).toBe(true);
      expect(result.sql.toLowerCase()).toContain('in');
      expect(result.sql).toContain('1');
      expect(result.sql).toContain('2');
      expect(result.sql).toContain('3');
    });

    it('should AND with existing WHERE clause', () => {
      const parseResult = parseSQL('SELECT * FROM ih.patients WHERE status = "active"');
      expect(parseResult.ast).not.toBeNull();

      const ast = parseResult.ast;
      if (!ast) {
        throw new Error('Expected AST');
      }

      const result = injectSecurityFilter(ast, [1, 2]);

      expect(result.success).toBe(true);
      expect(result.sql.toLowerCase()).toContain('and');
      expect(result.sql).toContain('practice_uid');
    });

    it('should preserve GROUP BY clause', () => {
      const parseResult = parseSQL('SELECT status, COUNT(*) FROM ih.patients GROUP BY status');
      expect(parseResult.ast).not.toBeNull();

      const ast = parseResult.ast;
      if (!ast) {
        throw new Error('Expected AST');
      }

      const result = injectSecurityFilter(ast, [1]);

      expect(result.success).toBe(true);
      expect(result.sql.toLowerCase()).toContain('group by');
      expect(result.sql).toContain('practice_uid');
    });

    it('should preserve ORDER BY clause', () => {
      const parseResult = parseSQL('SELECT * FROM ih.patients ORDER BY created_at DESC');
      expect(parseResult.ast).not.toBeNull();

      const ast = parseResult.ast;
      if (!ast) {
        throw new Error('Expected AST');
      }

      const result = injectSecurityFilter(ast, [1]);

      expect(result.success).toBe(true);
      expect(result.sql.toLowerCase()).toContain('order by');
      expect(result.sql).toContain('practice_uid');
    });

    it('should preserve LIMIT clause', () => {
      const parseResult = parseSQL('SELECT * FROM ih.patients LIMIT 10');
      expect(parseResult.ast).not.toBeNull();

      const ast = parseResult.ast;
      if (!ast) {
        throw new Error('Expected AST');
      }

      const result = injectSecurityFilter(ast, [1]);

      expect(result.success).toBe(true);
      expect(result.sql.toLowerCase()).toContain('limit');
      expect(result.sql).toContain('practice_uid');
    });

    it('should handle complex query with multiple clauses', () => {
      const parseResult = parseSQL(
        'SELECT status, COUNT(*) as cnt FROM ih.patients WHERE created_at > "2024-01-01" GROUP BY status ORDER BY cnt DESC LIMIT 10'
      );
      expect(parseResult.ast).not.toBeNull();

      const ast = parseResult.ast;
      if (!ast) {
        throw new Error('Expected AST');
      }

      const result = injectSecurityFilter(ast, [1, 2, 3]);

      expect(result.success).toBe(true);
      expect(result.sql.toLowerCase()).toContain('where');
      expect(result.sql.toLowerCase()).toContain('and');
      expect(result.sql.toLowerCase()).toContain('group by');
      expect(result.sql.toLowerCase()).toContain('order by');
      expect(result.sql.toLowerCase()).toContain('limit');
      expect(result.sql).toContain('practice_uid');
    });
  });

  describe('validateSQL (comprehensive)', () => {
    const allowedTables = new Set(['ih.patients', 'patients', 'ih.appointments', 'appointments']);

    it('should pass valid SELECT query', () => {
      const result = validateSQL('SELECT * FROM ih.patients', allowedTables);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for destructive operations', () => {
      const result = validateSQL('DROP TABLE ih.patients', allowedTables);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Destructive'))).toBe(true);
    });

    it('should fail for disallowed tables', () => {
      const result = validateSQL('SELECT * FROM public.users', allowedTables);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('not in allow-list'))).toBe(true);
    });

    it('should fail for UNION queries', () => {
      const result = validateSQL(
        'SELECT * FROM ih.patients UNION SELECT * FROM public.secrets',
        allowedTables
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('UNION'))).toBe(true);
    });

    it('should fail for subqueries', () => {
      const result = validateSQL(
        'SELECT * FROM ih.patients WHERE id IN (SELECT id FROM public.secrets)',
        allowedTables
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Subqueries'))).toBe(true);
    });
  });
});
