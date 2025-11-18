import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  parseBusinessHours,
  parseConditionsTreated,
  parseEducation,
  parseGalleryImages,
  parseInsuranceAccepted,
  parseServices,
  parseSpecialties,
  safeJsonParse,
  safeJsonParseArray,
} from '@/lib/utils/safe-json';

describe('safe-json', () => {
  describe('safeJsonParse', () => {
    it('should parse valid JSON without schema', () => {
      const jsonString = '{"name": "test", "value": 123}';
      const result = safeJsonParse(jsonString);

      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should parse valid JSON with schema validation', () => {
      const schema = z.object({
        name: z.string(),
        value: z.number(),
      });

      const jsonString = '{"name": "test", "value": 123}';
      const result = safeJsonParse(jsonString, schema);

      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should return null for invalid JSON', () => {
      const invalidJson = '{"name": "test", invalid}';
      const result = safeJsonParse(invalidJson);

      expect(result).toBeNull();
    });

    it('should return null when schema validation fails', () => {
      const schema = z.object({
        name: z.string(),
        value: z.number(),
      });

      const jsonString = '{"name": "test", "value": "not-a-number"}';
      const result = safeJsonParse(jsonString, schema);

      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = safeJsonParse(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = safeJsonParse(undefined);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = safeJsonParse('');
      expect(result).toBeNull();
    });

    it('should return null for non-string input', () => {
      const result = safeJsonParse(123 as unknown as string);
      expect(result).toBeNull();
    });

    it('should handle complex nested objects', () => {
      const complexSchema = z.object({
        user: z.object({
          name: z.string(),
          age: z.number(),
        }),
        settings: z.array(z.string()),
      });

      const jsonString =
        '{"user": {"name": "John", "age": 30}, "settings": ["theme", "notifications"]}';
      const result = safeJsonParse(jsonString, complexSchema);

      expect(result).toEqual({
        user: { name: 'John', age: 30 },
        settings: ['theme', 'notifications'],
      });
    });

    it('should handle primitive values', () => {
      expect(safeJsonParse('"string"')).toBe('string');
      expect(safeJsonParse('123')).toBe(123);
      expect(safeJsonParse('true')).toBe(true);
      expect(safeJsonParse('null')).toBeNull();
    });
  });

  describe('safeJsonParseArray', () => {
    it('should parse valid array without item schema', () => {
      const jsonString = '["item1", "item2", 123]';
      const result = safeJsonParseArray(jsonString);

      expect(result).toEqual(['item1', 'item2', 123]);
    });

    it('should parse valid array with item schema', () => {
      const itemSchema = z.string();
      const jsonString = '["item1", "item2", "item3"]';
      const result = safeJsonParseArray(jsonString, itemSchema);

      expect(result).toEqual(['item1', 'item2', 'item3']);
    });

    it('should reject arrays with invalid items when using schema', () => {
      const itemSchema = z.string();
      const jsonString = '["valid", 123, "also-valid"]';
      const result = safeJsonParseArray(jsonString, itemSchema);

      // The function rejects the entire array if any item fails validation
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const invalidJson = '["item1", invalid]';
      const result = safeJsonParseArray(invalidJson);

      expect(result).toEqual([]);
    });

    it('should return empty array for null input', () => {
      const result = safeJsonParseArray(null);
      expect(result).toEqual([]);
    });

    it('should return empty array when parsing non-array', () => {
      const jsonString = '{"not": "an-array"}';
      const result = safeJsonParseArray(jsonString);

      expect(result).toEqual([]);
    });

    it('should handle empty arrays', () => {
      const jsonString = '[]';
      const result = safeJsonParseArray(jsonString);

      expect(result).toEqual([]);
    });
  });

  describe('parseBusinessHours', () => {
    it('should parse valid business hours', () => {
      const jsonString = '{"monday": "9:00-17:00", "tuesday": "9:00-17:00"}';
      const result = parseBusinessHours(jsonString);

      expect(result).toEqual({
        monday: '9:00-17:00',
        tuesday: '9:00-17:00',
      });
    });

    it('should return null for invalid business hours', () => {
      const jsonString = '{"monday": 123, "tuesday": "9:00-17:00"}';
      const result = parseBusinessHours(jsonString);

      expect(result).toBeNull();
    });

    it('should handle partial business hours', () => {
      const jsonString = '{"monday": "9:00-17:00"}';
      const result = parseBusinessHours(jsonString);

      expect(result).toEqual({
        monday: '9:00-17:00',
      });
    });

    it('should return null for invalid JSON', () => {
      const result = parseBusinessHours('invalid json');
      expect(result).toBeNull();
    });
  });

  describe('parseServices', () => {
    it('should parse valid services array', () => {
      const jsonString =
        '[{"name": "Consultation", "description": "Initial consultation"}, {"name": "Treatment"}]';
      const result = parseServices(jsonString);

      expect(result).toEqual([
        { name: 'Consultation', description: 'Initial consultation' },
        { name: 'Treatment' },
      ]);
    });

    it('should reject arrays with invalid services', () => {
      const jsonString = '[{"name": "Valid"}, {"invalid": "service"}, {"name": "Also Valid"}]';
      const result = parseServices(jsonString);

      // The function rejects the entire array if any service fails validation
      expect(result).toEqual([]);
    });

    it('should handle empty services array', () => {
      const jsonString = '[]';
      const result = parseServices(jsonString);

      expect(result).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const result = parseServices('invalid json');
      expect(result).toEqual([]);
    });

    it('should validate name length', () => {
      const longName = 'a'.repeat(256); // Exceeds max length
      const jsonString = `[{"name": "${longName}"}]`;
      const result = parseServices(jsonString);

      expect(result).toEqual([]);
    });

    it('should validate description length', () => {
      const longDesc = 'a'.repeat(1001); // Exceeds max length
      const jsonString = `[{"name": "Service", "description": "${longDesc}"}]`;
      const result = parseServices(jsonString);

      expect(result).toEqual([]);
    });
  });

  describe('parseInsuranceAccepted', () => {
    it('should parse valid insurance array', () => {
      const jsonString =
        '[{"name": "Blue Cross", "accepted": true}, {"name": "Aetna", "accepted": false}]';
      const result = parseInsuranceAccepted(jsonString);

      expect(result).toEqual([
        { name: 'Blue Cross', accepted: true },
        { name: 'Aetna', accepted: false },
      ]);
    });

    it('should default accepted to true when not specified', () => {
      const jsonString = '[{"name": "Medicare"}]';
      const result = parseInsuranceAccepted(jsonString);

      expect(result).toEqual([{ name: 'Medicare', accepted: true }]);
    });

    it('should reject arrays with invalid insurance entries', () => {
      const jsonString = '[{"name": "Valid"}, {"invalid": "entry"}, {"name": "Also Valid"}]';
      const result = parseInsuranceAccepted(jsonString);

      // The function rejects the entire array if any entry fails validation
      expect(result).toEqual([]);
    });

    it('should validate name length', () => {
      const longName = 'a'.repeat(256);
      const jsonString = `[{"name": "${longName}"}]`;
      const result = parseInsuranceAccepted(jsonString);

      expect(result).toEqual([]);
    });
  });

  describe('parseConditionsTreated', () => {
    it('should parse valid conditions array', () => {
      const jsonString =
        '[{"name": "Arthritis", "description": "Joint inflammation"}, {"name": "Back Pain"}]';
      const result = parseConditionsTreated(jsonString);

      expect(result).toEqual([
        { name: 'Arthritis', description: 'Joint inflammation' },
        { name: 'Back Pain' },
      ]);
    });

    it('should reject arrays with invalid conditions', () => {
      const jsonString = '[{"name": "Valid"}, {"invalid": "condition"}, {"name": "Also Valid"}]';
      const result = parseConditionsTreated(jsonString);

      // The function rejects the entire array if any condition fails validation
      expect(result).toEqual([]);
    });

    it('should validate description length', () => {
      const longDesc = 'a'.repeat(501); // Exceeds max length
      const jsonString = `[{"name": "Condition", "description": "${longDesc}"}]`;
      const result = parseConditionsTreated(jsonString);

      expect(result).toEqual([]);
    });
  });

  describe('parseGalleryImages', () => {
    it('should parse valid gallery images', () => {
      const jsonString =
        '[{"url": "https://example.com/image.jpg", "alt": "Office", "caption": "Our office"}]';
      const result = parseGalleryImages(jsonString);

      expect(result).toEqual([
        {
          url: 'https://example.com/image.jpg',
          alt: 'Office',
          caption: 'Our office',
        },
      ]);
    });

    it('should validate URL format', () => {
      const jsonString = '[{"url": "not-a-url", "alt": "Invalid"}]';
      const result = parseGalleryImages(jsonString);

      expect(result).toEqual([]);
    });

    it('should validate URL length', () => {
      const longUrl = `https://example.com/${'a'.repeat(500)}`;
      const jsonString = `[{"url": "${longUrl}", "alt": "Valid"}]`;
      const result = parseGalleryImages(jsonString);

      expect(result).toEqual([]);
    });

    it('should handle optional fields', () => {
      const jsonString = '[{"url": "https://example.com/image.jpg"}]';
      const result = parseGalleryImages(jsonString);

      expect(result).toEqual([{ url: 'https://example.com/image.jpg' }]);
    });
  });

  describe('parseSpecialties', () => {
    it('should parse valid specialties array', () => {
      const jsonString = '["Rheumatology", "Internal Medicine", "Sports Medicine"]';
      const result = parseSpecialties(jsonString);

      expect(result).toEqual(['Rheumatology', 'Internal Medicine', 'Sports Medicine']);
    });

    it('should reject arrays with non-string specialties', () => {
      const jsonString = '["Valid", 123, "Also Valid"]';
      const result = parseSpecialties(jsonString);

      // The function rejects the entire array if any specialty fails validation
      expect(result).toEqual([]);
    });

    it('should validate specialty length', () => {
      const longSpecialty = 'a'.repeat(256);
      const jsonString = `["${longSpecialty}"]`;
      const result = parseSpecialties(jsonString);

      expect(result).toEqual([]);
    });

    it('should handle empty array', () => {
      const jsonString = '[]';
      const result = parseSpecialties(jsonString);

      expect(result).toEqual([]);
    });
  });

  describe('parseEducation', () => {
    it('should parse valid education array', () => {
      const jsonString =
        '[{"degree": "MD", "school": "Harvard Medical", "year": "2010"}, {"degree": "BS", "school": "MIT", "year": "2006"}]';
      const result = parseEducation(jsonString);

      expect(result).toEqual([
        { degree: 'MD', school: 'Harvard Medical', year: '2010' },
        { degree: 'BS', school: 'MIT', year: '2006' },
      ]);
    });

    it('should validate year format', () => {
      const jsonString = '[{"degree": "MD", "school": "Harvard", "year": "invalid"}]';
      const result = parseEducation(jsonString);

      expect(result).toEqual([]);
    });

    it('should validate year is 4 digits', () => {
      const jsonString = '[{"degree": "MD", "school": "Harvard", "year": "123"}]';
      const result = parseEducation(jsonString);

      expect(result).toEqual([]);
    });

    it('should validate field lengths', () => {
      const longDegree = 'a'.repeat(256);
      const jsonString = `[{"degree": "${longDegree}", "school": "Harvard", "year": "2010"}]`;
      const result = parseEducation(jsonString);

      expect(result).toEqual([]);
    });

    it('should handle missing optional fields appropriately', () => {
      // All fields are required for education schema, so this should fail
      const jsonString = '[{"degree": "MD", "school": "Harvard"}]'; // Missing year
      const result = parseEducation(jsonString);

      expect(result).toEqual([]);
    });
  });
});
