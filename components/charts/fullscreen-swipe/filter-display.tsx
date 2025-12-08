'use client';

/**
 * Filter Display Component
 *
 * Displays active universal filters in a compact format.
 * Shows date range, organization, practice, and provider filters.
 *
 * Note: Uses DashboardUniversalFilters type properties:
 * - dateRangePreset (string) - not dateRange
 * - organizationId (string)
 * - practiceUids (number[]) - not practiceId
 * - providerName (string) - not providerId
 */

import { useFullscreenSwipe } from '@/app/fullscreen-swipe-context';
import { Calendar, Building2, Stethoscope, User } from 'lucide-react';

export default function FilterDisplay() {
  const { universalFilters } = useFullscreenSwipe();

  if (!universalFilters) return null;

  const hasActiveFilters =
    universalFilters.dateRangePreset ||
    universalFilters.organizationId ||
    (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) ||
    universalFilters.providerName;

  if (!hasActiveFilters) return null;

  return (
    <div className="flex flex-wrap gap-2 text-xs text-white/80 mt-1">
      {universalFilters.dateRangePreset && (
        <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
          <Calendar className="w-3 h-3" />
          <span>{universalFilters.dateRangePreset}</span>
        </div>
      )}

      {universalFilters.organizationId && (
        <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
          <Building2 className="w-3 h-3" />
          <span className="truncate max-w-[100px]">Organization</span>
        </div>
      )}

      {universalFilters.practiceUids && universalFilters.practiceUids.length > 0 && (
        <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
          <Stethoscope className="w-3 h-3" />
          <span className="truncate max-w-[100px]">
            {universalFilters.practiceUids.length === 1
              ? 'Practice'
              : `${universalFilters.practiceUids.length} Practices`}
          </span>
        </div>
      )}

      {universalFilters.providerName && (
        <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
          <User className="w-3 h-3" />
          <span className="truncate max-w-[100px]">{universalFilters.providerName}</span>
        </div>
      )}
    </div>
  );
}

