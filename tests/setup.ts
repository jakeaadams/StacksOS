/**
 * Vitest Test Setup
 * 
 * Global test configuration and mocks
 */

import { vi } from "vitest";

// Mock Next.js request/response for API route testing
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map()),
}));

// Mock console to reduce noise during tests
const originalConsole = { ...console };
beforeAll(() => {
  console.log = vi.fn();
  console.info = vi.fn();
  console.debug = vi.fn();
});

afterAll(() => {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
});

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});
