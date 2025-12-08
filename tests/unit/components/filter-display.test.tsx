/**
 * FilterDisplay Component Tests
 *
 * Tests for the filter display component that shows active universal filters
 * in fullscreen swipe mode.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import FilterDisplay from '@/components/charts/fullscreen-swipe/filter-display';
import * as SwipeContext from '@/app/fullscreen-swipe-context';
import type { DashboardUniversalFilters } from '@/hooks/use-dashboard-data';

// Mock the context
vi.mock('@/app/fullscreen-swipe-context', () => ({
  useFullscreenSwipe: vi.fn(),
}));

describe('FilterDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockFilters(filters: DashboardUniversalFilters | null) {
    (SwipeContext.useFullscreenSwipe as Mock).mockReturnValue({
      universalFilters: filters,
    });
  }

  describe('no filters', () => {
    it('should return null when universalFilters is null', () => {
      mockFilters(null);
      const { container } = render(<FilterDisplay />);
      expect(container.firstChild).toBeNull();
    });

    it('should return null when no active filters', () => {
      mockFilters({});
      const { container } = render(<FilterDisplay />);
      expect(container.firstChild).toBeNull();
    });

    it('should return null when all filter values are empty', () => {
      // Test with empty object - no filters set
      mockFilters({
        organizationId: null,
        practiceUids: [],
      });
      const { container } = render(<FilterDisplay />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('date range filter', () => {
    it('should display dateRangePreset when set', () => {
      mockFilters({
        dateRangePreset: 'last_30_days',
      });

      render(<FilterDisplay />);

      expect(screen.getByText('last_30_days')).toBeInTheDocument();
    });

    it('should display custom date range presets', () => {
      mockFilters({
        dateRangePreset: 'custom',
      });

      render(<FilterDisplay />);

      expect(screen.getByText('custom')).toBeInTheDocument();
    });
  });

  describe('organization filter', () => {
    it('should display Organization label when organizationId is set', () => {
      mockFilters({
        organizationId: 'org-123',
      });

      render(<FilterDisplay />);

      expect(screen.getByText('Organization')).toBeInTheDocument();
    });
  });

  describe('practice filter', () => {
    it('should display "Practice" for single practice', () => {
      mockFilters({
        practiceUids: [1],
      });

      render(<FilterDisplay />);

      expect(screen.getByText('Practice')).toBeInTheDocument();
    });

    it('should display count for multiple practices', () => {
      mockFilters({
        practiceUids: [1, 2, 3],
      });

      render(<FilterDisplay />);

      expect(screen.getByText('3 Practices')).toBeInTheDocument();
    });

    it('should display count for many practices', () => {
      mockFilters({
        practiceUids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      });

      render(<FilterDisplay />);

      expect(screen.getByText('10 Practices')).toBeInTheDocument();
    });
  });

  describe('provider filter', () => {
    it('should display provider name when set', () => {
      mockFilters({
        providerName: 'Dr. Smith',
      });

      render(<FilterDisplay />);

      expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
    });

    it('should truncate long provider names via CSS', () => {
      mockFilters({
        providerName: 'Dr. Very Long Name That Should Be Truncated',
      });

      render(<FilterDisplay />);

      // The text is still in the DOM, truncation is CSS
      expect(
        screen.getByText('Dr. Very Long Name That Should Be Truncated')
      ).toBeInTheDocument();
    });
  });

  describe('multiple filters', () => {
    it('should display all active filters', () => {
      mockFilters({
        dateRangePreset: 'last_7_days',
        organizationId: 'org-456',
        practiceUids: [1, 2],
        providerName: 'Dr. Jones',
      });

      render(<FilterDisplay />);

      expect(screen.getByText('last_7_days')).toBeInTheDocument();
      expect(screen.getByText('Organization')).toBeInTheDocument();
      expect(screen.getByText('2 Practices')).toBeInTheDocument();
      expect(screen.getByText('Dr. Jones')).toBeInTheDocument();
    });

    it('should only display filters that are set', () => {
      mockFilters({
        dateRangePreset: 'year_to_date',
        providerName: 'Dr. Wilson',
        // No organization or practices
      });

      render(<FilterDisplay />);

      expect(screen.getByText('year_to_date')).toBeInTheDocument();
      expect(screen.getByText('Dr. Wilson')).toBeInTheDocument();
      expect(screen.queryByText('Organization')).not.toBeInTheDocument();
      expect(screen.queryByText('Practice')).not.toBeInTheDocument();
    });
  });

  describe('icons', () => {
    it('should render filter icons', () => {
      mockFilters({
        dateRangePreset: 'last_30_days',
        organizationId: 'org-123',
        practiceUids: [1],
        providerName: 'Dr. Test',
      });

      const { container } = render(<FilterDisplay />);

      // Check for SVG elements (Lucide icons render as SVGs)
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBe(4); // One for each filter type
    });
  });
});

