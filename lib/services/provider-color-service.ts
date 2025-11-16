/**
 * Provider Color Service
 *
 * Assigns and manages persistent color assignments for providers in charts.
 * Uses Tableau's industry-standard 20-color palette for optimal visual distinction.
 *
 * ORGANIZATION SEGREGATION:
 * - Different organizations can assign different colors to the same provider
 * - Falls back to system default if no organization-specific assignment exists
 * - Supports bulk lookups for performance optimization
 */

import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chart_provider_colors } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { COLOR_PALETTES } from './color-palettes';

// Default palette for provider colors (Tableau 20 industry standard)
const PROVIDER_PALETTE_ID = 'tableau20';
const PROVIDER_PALETTE = COLOR_PALETTES.tableau20.colors;

interface ProviderColorAssignment {
  provider_uid: number;
  provider_name: string;
  assigned_color: string;
  is_custom: boolean;
  organization_id?: string;
}

export class ProviderColorService {
  /**
   * Get color for a single provider (auto-assigns if not exists)
   *
   * Lookup order:
   * 1. Organization-specific assignment (if organizationId provided)
   * 2. System-wide default (organization_id = NULL)
   * 3. Auto-assign using deterministic hash
   *
   * @param providerUid - Unique provider identifier
   * @param providerName - Provider name for display
   * @param organizationId - Optional organization ID for org-specific colors
   * @returns Hex color code (#RRGGBB)
   */
  async getProviderColor(
    providerUid: number,
    providerName: string,
    organizationId?: string
  ): Promise<string> {
    try {
      // 1. Check for organization-specific assignment (if org provided)
      if (organizationId) {
        const [orgAssignment] = await db
          .select()
          .from(chart_provider_colors)
          .where(
            and(
              eq(chart_provider_colors.organization_id, organizationId),
              eq(chart_provider_colors.provider_uid, providerUid)
            )
          )
          .limit(1);

        if (orgAssignment) {
          return orgAssignment.assigned_color;
        }
      }

      // 2. Check for system-wide default (organization_id = NULL)
      const [systemAssignment] = await db
        .select()
        .from(chart_provider_colors)
        .where(
          and(
            isNull(chart_provider_colors.organization_id),
            eq(chart_provider_colors.provider_uid, providerUid)
          )
        )
        .limit(1);

      if (systemAssignment) {
        return systemAssignment.assigned_color;
      }

      // 3. Auto-assign using deterministic hash
      const color = this.hashProviderToColor(providerUid);

      // 4. Store system-wide default (async, don't block on failure)
      await this.saveAssignment(providerUid, providerName, color, false, undefined).catch(
        (err) => {
          log.error('Failed to save provider color assignment', err, {
            providerUid,
            providerName,
            color,
            organizationId,
            operation: 'getProviderColor',
            component: 'provider-color-service',
          });
        }
      );

      return color;
    } catch (error) {
      log.error('Error fetching provider color', error as Error, {
        providerUid,
        providerName,
        organizationId,
        operation: 'getProviderColor',
        component: 'provider-color-service',
      });

      // Fallback to deterministic hash (always works)
      return this.hashProviderToColor(providerUid);
    }
  }

  /**
   * Bulk fetch colors for multiple providers (performance optimization)
   *
   * Use this for chart rendering with many providers to avoid N+1 queries.
   * Returns organization-specific colors if organizationId provided, otherwise system defaults.
   *
   * @param providers - Array of {provider_uid, provider_name}
   * @param organizationId - Optional organization ID for org-specific colors
   * @returns Map of provider_uid → color (#RRGGBB)
   */
  async getBulkProviderColors(
    providers: Array<{ provider_uid: number; provider_name: string }>,
    organizationId?: string
  ): Promise<Map<number, string>> {
    const colorMap = new Map<number, string>();

    if (providers.length === 0) {
      return colorMap;
    }

    try {
      const providerUids = providers.map((p) => p.provider_uid);

      // Build WHERE clause: org-specific OR system default
      const whereClause = organizationId
        ? or(
            and(
              eq(chart_provider_colors.organization_id, organizationId),
              inArray(chart_provider_colors.provider_uid, providerUids)
            ),
            and(
              isNull(chart_provider_colors.organization_id),
              inArray(chart_provider_colors.provider_uid, providerUids)
            )
          )
        : and(
            isNull(chart_provider_colors.organization_id),
            inArray(chart_provider_colors.provider_uid, providerUids)
          );

      // 1. Fetch existing assignments in bulk
      const existingColors = await db.select().from(chart_provider_colors).where(whereClause);

      // 2. Build priority map: org-specific > system default
      const orgColors = new Map<number, string>();
      const systemColors = new Map<number, string>();

      for (const assignment of existingColors) {
        if (assignment.organization_id === organizationId) {
          orgColors.set(assignment.provider_uid, assignment.assigned_color);
        } else if (assignment.organization_id === null) {
          systemColors.set(assignment.provider_uid, assignment.assigned_color);
        }
      }

      // 3. Merge with priority: org-specific > system
      for (const uid of providerUids) {
        const orgColor = orgColors.get(uid);
        if (orgColor !== undefined) {
          colorMap.set(uid, orgColor);
        } else {
          const systemColor = systemColors.get(uid);
          if (systemColor !== undefined) {
            colorMap.set(uid, systemColor);
          }
        }
      }

      // 4. Identify missing providers (no assignment at all)
      const missingProviders = providers.filter((p) => !colorMap.has(p.provider_uid));

      // 5. Auto-assign colors for missing providers
      const newAssignments: typeof chart_provider_colors.$inferInsert[] = [];

      for (const provider of missingProviders) {
        const color = this.hashProviderToColor(provider.provider_uid);
        colorMap.set(provider.provider_uid, color);

        // Store as system default (organization_id = NULL)
        newAssignments.push({
          provider_uid: provider.provider_uid,
          provider_name: provider.provider_name,
          assigned_color: color,
          color_palette_id: PROVIDER_PALETTE_ID,
          is_custom: false,
          organization_id: null,
        });
      }

      // 6. Bulk insert new assignments (async, don't block rendering)
      if (newAssignments.length > 0) {
        db.insert(chart_provider_colors)
          .values(newAssignments)
          .onConflictDoNothing()
          .catch((err) => {
            log.error('Failed to bulk save provider colors', err, {
              count: newAssignments.length,
              organizationId,
              operation: 'getBulkProviderColors',
              component: 'provider-color-service',
            });
          });
      }

      log.info('Bulk provider colors fetched', {
        totalProviders: providers.length,
        existingCount: existingColors.length,
        newCount: newAssignments.length,
        organizationId,
        operation: 'getBulkProviderColors',
        component: 'provider-color-service',
      });

      return colorMap;
    } catch (error) {
      log.error('Error in bulk provider color fetch', error as Error, {
        providerCount: providers.length,
        organizationId,
        operation: 'getBulkProviderColors',
        component: 'provider-color-service',
      });

      // Fallback: Use deterministic hashing for all
      for (const provider of providers) {
        colorMap.set(provider.provider_uid, this.hashProviderToColor(provider.provider_uid));
      }

      return colorMap;
    }
  }

  /**
   * Update provider color (manual override)
   *
   * Creates or updates an organization-specific color assignment.
   * If organizationId is null, updates system default.
   *
   * @param providerUid - Provider to update
   * @param providerName - Provider name
   * @param newColor - New hex color code (#RRGGBB)
   * @param organizationId - Optional organization ID
   * @param updatedBy - User ID making the change
   */
  async updateProviderColor(
    providerUid: number,
    providerName: string,
    newColor: string,
    organizationId: string | undefined,
    updatedBy: string
  ): Promise<void> {
    // Check if assignment exists
    const existingWhere = organizationId
      ? and(
          eq(chart_provider_colors.organization_id, organizationId),
          eq(chart_provider_colors.provider_uid, providerUid)
        )
      : and(
          isNull(chart_provider_colors.organization_id),
          eq(chart_provider_colors.provider_uid, providerUid)
        );

    const [existing] = await db
      .select()
      .from(chart_provider_colors)
      .where(existingWhere)
      .limit(1);

    if (existing) {
      // Update existing
      await db
        .update(chart_provider_colors)
        .set({
          assigned_color: newColor,
          is_custom: true,
          updated_at: new Date(),
          updated_by: updatedBy,
        })
        .where(eq(chart_provider_colors.provider_color_id, existing.provider_color_id));
    } else {
      // Insert new
      await db.insert(chart_provider_colors).values({
        provider_uid: providerUid,
        provider_name: providerName,
        assigned_color: newColor,
        color_palette_id: PROVIDER_PALETTE_ID,
        is_custom: true,
        organization_id: organizationId || null,
        created_by: updatedBy,
        updated_by: updatedBy,
      });
    }

    log.info('Provider color updated', {
      providerUid,
      newColor,
      organizationId,
      updatedBy,
      operation: 'updateProviderColor',
      component: 'provider-color-service',
    });
  }

  /**
   * Reset provider to auto-assigned color
   *
   * @param providerUid - Provider to reset
   * @param organizationId - Optional organization ID
   */
  async resetProviderColor(
    providerUid: number,
    organizationId: string | undefined
  ): Promise<void> {
    const autoColor = this.hashProviderToColor(providerUid);

    const whereClause = organizationId
      ? and(
          eq(chart_provider_colors.organization_id, organizationId),
          eq(chart_provider_colors.provider_uid, providerUid)
        )
      : and(
          isNull(chart_provider_colors.organization_id),
          eq(chart_provider_colors.provider_uid, providerUid)
        );

    await db
      .update(chart_provider_colors)
      .set({
        assigned_color: autoColor,
        is_custom: false,
        updated_at: new Date(),
      })
      .where(whereClause);

    log.info('Provider color reset to auto-assigned', {
      providerUid,
      autoColor,
      organizationId,
      operation: 'resetProviderColor',
      component: 'provider-color-service',
    });
  }

  /**
   * Get all provider color assignments for an organization (for admin UI)
   *
   * @param organizationId - Optional organization ID (null = system defaults)
   * @returns List of provider color assignments
   */
  async getAllProviderColors(
    organizationId?: string
  ): Promise<ProviderColorAssignment[]> {
    const whereClause = organizationId
      ? eq(chart_provider_colors.organization_id, organizationId)
      : isNull(chart_provider_colors.organization_id);

    const results = await db
      .select()
      .from(chart_provider_colors)
      .where(whereClause)
      .orderBy(chart_provider_colors.provider_name);

    return results.map((r) => {
      const assignment: ProviderColorAssignment = {
        provider_uid: r.provider_uid,
        provider_name: r.provider_name,
        assigned_color: r.assigned_color,
        is_custom: r.is_custom ?? false,
      };

      // Only include organization_id if it's not null
      if (r.organization_id !== null) {
        assignment.organization_id = r.organization_id;
      }

      return assignment;
    });
  }

  /**
   * Deterministic hash: provider_uid → Tableau palette color
   *
   * Uses modulo to ensure even distribution across 20 colors.
   * Same provider_uid always returns same color.
   *
   * @param providerUid - Provider UID
   * @returns Hex color code (#RRGGBB)
   */
  private hashProviderToColor(providerUid: number): string {
    const index = providerUid % PROVIDER_PALETTE.length;
    return PROVIDER_PALETTE[index] || '#1f77b4'; // Fallback to first Tableau color (blue)
  }

  /**
   * Save color assignment to database
   *
   * @param providerUid - Provider UID
   * @param providerName - Provider name
   * @param color - Hex color code
   * @param isCustom - Whether this is a manual assignment
   * @param organizationId - Optional organization ID
   */
  private async saveAssignment(
    providerUid: number,
    providerName: string,
    color: string,
    isCustom: boolean,
    organizationId: string | undefined
  ): Promise<void> {
    await db
      .insert(chart_provider_colors)
      .values({
        provider_uid: providerUid,
        provider_name: providerName,
        assigned_color: color,
        color_palette_id: PROVIDER_PALETTE_ID,
        is_custom: isCustom,
        organization_id: organizationId || null,
      })
      .onConflictDoNothing();
  }
}

// Singleton instance
export const providerColorService = new ProviderColorService();
