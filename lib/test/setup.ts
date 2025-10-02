import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';

// Global test setup
beforeEach(() => {
  // Reset any mocks or test state here
});

// Mock environment variables for tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
