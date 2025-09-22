import { describe, it, expect } from 'vitest'
import {
  getTemplateDefaultColors,
  hexToRgb,
  hexToRgba,
  darkenColor,
  generateSSRColorStyles,
  generateColorCSS,
  getColorStyles
} from '@/lib/utils/color-utils'

describe('color-utils', () => {
  describe('getTemplateDefaultColors', () => {
    it('should return correct colors for classic-professional template', () => {
      const colors = getTemplateDefaultColors('classic-professional')
      expect(colors).toEqual({
        primary: '#00AEEF',
        secondary: '#FFFFFF',
        accent: '#44C0AE'
      })
    })

    it('should return correct colors for modern-minimalist template', () => {
      const colors = getTemplateDefaultColors('modern-minimalist')
      expect(colors).toEqual({
        primary: '#00AEEF',
        secondary: '#FFFFFF',
        accent: '#44C0AE'
      })
    })

    it('should return correct colors for tidy-professional template', () => {
      const colors = getTemplateDefaultColors('tidy-professional')
      expect(colors).toEqual({
        primary: '#2174EA',
        secondary: '#F8FAFC',
        accent: '#5696FF'
      })
    })

    it('should return fallback colors for unknown template', () => {
      const colors = getTemplateDefaultColors('unknown-template')
      expect(colors).toEqual({
        primary: '#00AEEF',
        secondary: '#FFFFFF',
        accent: '#44C0AE'
      })
    })

    it('should return fallback colors for empty string', () => {
      const colors = getTemplateDefaultColors('')
      expect(colors).toEqual({
        primary: '#00AEEF',
        secondary: '#FFFFFF',
        accent: '#44C0AE'
      })
    })
  })

  describe('hexToRgb', () => {
    it('should convert valid hex color to RGB', () => {
      expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 })
      expect(hexToRgb('#00FF00')).toEqual({ r: 0, g: 255, b: 0 })
      expect(hexToRgb('#0000FF')).toEqual({ r: 0, g: 0, b: 255 })
      expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 })
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    })

    it('should handle hex colors without # prefix', () => {
      expect(hexToRgb('FF0000')).toEqual({ r: 255, g: 0, b: 0 })
    })

    it('should handle mixed case hex colors', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
      expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 })
      expect(hexToRgb('#Ff0000')).toEqual({ r: 255, g: 0, b: 0 })
    })

    it('should return null for invalid hex colors', () => {
      expect(hexToRgb('#GGG')).toBeNull()
      expect(hexToRgb('#12345')).toBeNull()
      expect(hexToRgb('#1234567')).toBeNull()
      expect(hexToRgb('invalid')).toBeNull()
      expect(hexToRgb('#12')).toBeNull()
      expect(hexToRgb('#12345')).toBeNull()
    })

    it('should handle edge case hex values', () => {
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
      expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 })
      expect(hexToRgb('#808080')).toEqual({ r: 128, g: 128, b: 128 })
    })
  })

  describe('hexToRgba', () => {
    it('should convert hex to rgba with opacity', () => {
      expect(hexToRgba('#FF0000', 1)).toBe('rgba(255, 0, 0, 1)')
      expect(hexToRgba('#00FF00', 0.5)).toBe('rgba(0, 255, 0, 0.5)')
      expect(hexToRgba('#0000FF', 0)).toBe('rgba(0, 0, 255, 0)')
    })

    it('should handle edge opacity values', () => {
      expect(hexToRgba('#FF0000', 0)).toBe('rgba(255, 0, 0, 0)')
      expect(hexToRgba('#FF0000', 1)).toBe('rgba(255, 0, 0, 1)')
      expect(hexToRgba('#FF0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
    })

    it('should return original hex for invalid input', () => {
      expect(hexToRgba('#GGG', 0.5)).toBe('#GGG')
      expect(hexToRgba('invalid', 0.5)).toBe('invalid')
    })
  })

  describe('darkenColor', () => {
    it('should darken colors by specified percentage', () => {
      expect(darkenColor('#FFFFFF', 0)).toBe('#ffffff')
      expect(darkenColor('#FFFFFF', 50)).toBe('#808080')
      expect(darkenColor('#FFFFFF', 100)).toBe('#000000')
    })

    it('should handle different color inputs', () => {
      expect(darkenColor('#FF0000', 25)).toBe('#bf0000')
      expect(darkenColor('#00FF00', 25)).toBe('#00bf00')
      expect(darkenColor('#0000FF', 25)).toBe('#0000bf')
    })

    it('should handle edge cases', () => {
      expect(darkenColor('#000000', 50)).toBe('#000000')
      expect(darkenColor('#FFFFFF', 0)).toBe('#ffffff')
    })

    it('should return original color for invalid input', () => {
      expect(darkenColor('#GGG', 25)).toBe('#GGG')
      expect(darkenColor('invalid', 25)).toBe('invalid')
    })
  })

  describe('generateSSRColorStyles', () => {
    const testColors = {
      primary: '#2174EA',
      secondary: '#F8FAFC',
      accent: '#5696FF'
    }

    it('should generate correct CSS custom properties', () => {
      const styles = generateSSRColorStyles(testColors)

      expect(styles['--color-primary']).toBe('#2174EA')
      expect(styles['--color-secondary']).toBe('#F8FAFC')
      expect(styles['--color-accent']).toBe('#5696FF')
      expect(styles['--color-primary-600']).toBe('#2174EA')
    })

    it('should generate opacity variants', () => {
      const styles = generateSSRColorStyles(testColors)

      expect(styles['--color-primary-50']).toBe('rgba(33, 116, 234, 0.05)')
      expect(styles['--color-primary-100']).toBe('rgba(33, 116, 234, 0.1)')
      expect(styles['--color-primary-200']).toBe('rgba(33, 116, 234, 0.2)')
    })

    it('should generate darkened variants', () => {
      const styles = generateSSRColorStyles(testColors)

      expect(styles['--color-primary-700']).toBe('#1e68d3')
      expect(styles['--color-primary-800']).toBe('#1a5dbb')
      expect(styles['--color-accent-700']).toBe('#4d87e6')
    })

    it('should handle invalid colors gracefully', () => {
      const invalidColors = {
        primary: '#invalid',
        secondary: '#F8FAFC',
        accent: '#5696FF'
      }

      const styles = generateSSRColorStyles(invalidColors)
      expect(styles['--color-primary-50']).toBe('#invalid')
    })
  })

  describe('generateColorCSS', () => {
    const testColors = {
      primary: '#2174EA',
      secondary: '#F8FAFC',
      accent: '#5696FF'
    }

    it('should generate valid CSS with custom properties', () => {
      const css = generateColorCSS(testColors)

      expect(css).toContain(':root {')
      expect(css).toContain('--color-primary: #2174EA')
      expect(css).toContain('--color-secondary: #F8FAFC')
      expect(css).toContain('--color-accent: #5696FF')
    })

    it('should include RGB values for CSS functions', () => {
      const css = generateColorCSS(testColors)

      expect(css).toContain('--color-primary-rgb: 33, 116, 234')
      expect(css).toContain('--color-secondary-rgb: 248, 250, 252')
      expect(css).toContain('--color-accent-rgb: 86, 150, 255')
    })

    it('should include derived color variants', () => {
      const css = generateColorCSS(testColors)

      expect(css).toContain('--color-primary-50: rgba(var(--color-primary-rgb), 0.05)')
      expect(css).toContain('--color-primary-600: var(--color-primary)')
      expect(css).toContain('--color-secondary-100: var(--color-secondary)')
    })

    it('should handle invalid colors with fallback RGB values', () => {
      const invalidColors = {
        primary: '#invalid',
        secondary: '#F8FAFC',
        accent: '#5696FF'
      }

      const css = generateColorCSS(invalidColors)
      expect(css).toContain('--color-primary-rgb: 37, 99, 235') // fallback
    })
  })

  describe('getColorStyles', () => {
    const testColors = {
      primary: '#2174EA',
      secondary: '#F8FAFC',
      accent: '#5696FF'
    }

    it('should generate primary color styles', () => {
      const styles = getColorStyles(testColors)

      expect(styles.primary).toEqual({
        backgroundColor: '#2174EA',
        color: 'white'
      })

      expect(styles.primaryText).toEqual({
        color: '#2174EA'
      })

      expect(styles.primaryBorder).toEqual({
        borderColor: '#2174EA',
        color: '#2174EA'
      })
    })

    it('should generate secondary color styles', () => {
      const styles = getColorStyles(testColors)

      expect(styles.secondary).toEqual({
        backgroundColor: '#F8FAFC'
      })

      expect(styles.secondaryText).toEqual({
        color: '#F8FAFC'
      })
    })

    it('should generate accent color styles', () => {
      const styles = getColorStyles(testColors)

      expect(styles.accent).toEqual({
        backgroundColor: '#5696FF',
        color: 'white'
      })

      expect(styles.accentText).toEqual({
        color: '#5696FF'
      })

      expect(styles.accentBorder).toEqual({
        borderColor: '#5696FF',
        color: '#5696FF'
      })
    })

    it('should generate background variants', () => {
      const styles = getColorStyles(testColors)

      expect(styles.primaryBg50).toEqual({
        backgroundColor: 'rgba(33, 116, 234, 0.05)'
      })

      expect(styles.primaryBg100).toEqual({
        backgroundColor: 'rgba(33, 116, 234, 0.1)'
      })
    })

    it('should generate gradient styles', () => {
      const styles = getColorStyles(testColors)

      expect(styles.primaryGradient.background).toContain('linear-gradient')
      expect(styles.primaryGradient.background).toContain('rgba(33, 116, 234, 0.05)')
      expect(styles.primaryGradient.background).toContain('rgba(33, 116, 234, 0.1)')
    })

    it('should handle invalid colors gracefully', () => {
      const invalidColors = {
        primary: '#invalid',
        secondary: '#F8FAFC',
        accent: '#5696FF'
      }

      const styles = getColorStyles(invalidColors)
      expect(styles.primary.backgroundColor).toBe('#invalid')
    })
  })
})
