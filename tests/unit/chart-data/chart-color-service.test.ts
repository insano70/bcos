/**
 * Unit tests for ChartColorService
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getColorPalette,
  adjustColorOpacity,
  getColorByIndex,
  generateColorArray,
  applyColorsWithHover,
} from '@/lib/utils/chart-data/services/chart-color-service';

// Mock the color palette service
vi.mock('@/lib/services/color-palettes', () => ({
  getPaletteColors: (paletteId: string) => {
    const palettes: Record<string, string[]> = {
      default: ['#FF0000', '#00FF00', '#0000FF'],
      vibrant: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
    };
    return palettes[paletteId] || palettes.default;
  },
}));

describe('ChartColorService', () => {
  describe('getColorPalette', () => {
    it('should return color palette for given ID', () => {
      const colors = getColorPalette('default');
      expect(colors).toHaveLength(3);
      expect(colors[0]).toBe('#FF0000');
    });

    it('should return default palette when no ID specified', () => {
      const colors = getColorPalette();
      expect(colors).toHaveLength(3);
    });
  });

  describe('adjustColorOpacity', () => {
    it('should adjust opacity for RGB colors', () => {
      const result = adjustColorOpacity('rgb(255, 0, 0)', 0.5);
      expect(result).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('should convert hex to RGBA', () => {
      const result = adjustColorOpacity('#FF0000', 0.5);
      expect(result).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('should handle lowercase hex', () => {
      const result = adjustColorOpacity('#ff0000', 0.8);
      expect(result).toBe('rgba(255, 0, 0, 0.8)');
    });

    it('should handle hex without hash', () => {
      const result = adjustColorOpacity('00FF00', 0.3);
      expect(result).toBe('rgba(0, 255, 0, 0.3)');
    });

    it('should handle full opacity', () => {
      const result = adjustColorOpacity('#0000FF', 1.0);
      expect(result).toBe('rgba(0, 0, 255, 1)');
    });

    it('should handle zero opacity', () => {
      const result = adjustColorOpacity('#000000', 0);
      expect(result).toBe('rgba(0, 0, 0, 0)');
    });
  });

  describe('getColorByIndex', () => {
    it('should return color at index', () => {
      const color = getColorByIndex('default', 0);
      expect(color).toBe('#FF0000');
    });

    it('should wrap around for large indices', () => {
      const color = getColorByIndex('default', 3); // Index 3, length 3 -> wraps to 0
      expect(color).toBe('#FF0000');
    });

    it('should return default palette for invalid palette', () => {
      const color = getColorByIndex('nonexistent', 0);
      // Falls back to default palette in mock
      expect(color).toBe('#FF0000');
    });
  });

  describe('generateColorArray', () => {
    it('should generate array of specified count', () => {
      const colors = generateColorArray('default', 5);
      expect(colors).toHaveLength(5);
    });

    it('should wrap around palette', () => {
      const colors = generateColorArray('default', 5); // Palette has 3 colors
      expect(colors[0]).toBe('#FF0000');
      expect(colors[3]).toBe('#FF0000'); // Wrapped
    });

    it('should handle count of zero', () => {
      const colors = generateColorArray('default', 0);
      expect(colors).toHaveLength(0);
    });
  });

  describe('applyColorsWithHover', () => {
    it('should return background and hover colors', () => {
      const result = applyColorsWithHover('default', 2);
      
      expect(result.backgroundColor).toHaveLength(2);
      expect(result.hoverBackgroundColor).toHaveLength(2);
    });

    it('should apply opacity to hover colors', () => {
      const result = applyColorsWithHover('default', 1);
      
      expect(result.backgroundColor[0]).toBe('#FF0000');
      expect(result.hoverBackgroundColor[0]).toContain('rgba');
      expect(result.hoverBackgroundColor[0]).toContain('0.8');
    });

    it('should handle multiple colors', () => {
      const result = applyColorsWithHover('default', 4);
      
      expect(result.backgroundColor).toHaveLength(4);
      expect(result.hoverBackgroundColor).toHaveLength(4);
      
      // Check each hover color has opacity
      result.hoverBackgroundColor.forEach(color => {
        expect(color).toContain('rgba');
      });
    });
  });
});

