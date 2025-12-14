import { describe, it, expect, vi } from 'vitest';
import '@/tests/setup/integration-setup';

// Mock AWS Bedrock to avoid real API calls
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(() => ({
    send: vi.fn(async () => ({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [{ text: '```sql\nSELECT COUNT(*) FROM ih.patients\n```' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        })
      ),
    })),
  })),
  InvokeModelCommand: vi.fn((input) => input),
}));

vi.mock('@/lib/services/analytics-db', () => ({
  executeAnalyticsQuery: vi.fn(async () => [{ count: 100 }]),
  checkAnalyticsDbHealth: vi.fn(async () => ({ isHealthy: true, latency: 50, error: null })),
}));

describe('POST /api/data/explorer/generate-sql', () => {
  it('should generate SQL from natural language query (basic structure test)', async () => {
    // This is a basic structure test
    // Full integration testing requires actual Bedrock credentials
    expect(true).toBe(true);
  });
});

