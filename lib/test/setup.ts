import '@testing-library/jest-dom';

// Global test setup
beforeEach(() => {
  // Reset any mocks or test state here
});

// Mock environment variables for tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
