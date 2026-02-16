import { vi } from 'vitest';

// Mock Firebase Firestore functions
export const mockGetDocs = vi.fn();
export const mockCollection = vi.fn();

// Mock Firebase database
export const db = {};

// Mock Firestore functions
vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));

// Reset mocks helper
export const resetFirebaseMocks = (): void => {
  mockGetDocs.mockReset();
  mockCollection.mockReset();
};

interface MockDocData {
  [key: string]: unknown;
}

// Helper to create mock Firestore documents
export const createMockDoc = (id: string, data: MockDocData) => ({
  id,
  data: () => data,
});

// Helper to create mock Firestore snapshot
export const createMockSnapshot = (docs: Array<{ id: string; data: MockDocData }> = []) => ({
  empty: docs.length === 0,
  docs: docs.map(({ id, data }) => createMockDoc(id, data)),
});
