import { vi } from 'vitest';

// Mock Firebase Firestore functions
export const mockGetDocs = vi.fn();
export const mockCollection = vi.fn();

// Mock Firebase database
export const db = {};

// Mock Firestore functions
vi.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  getDocs: (...args) => mockGetDocs(...args),
}));

// Reset mocks helper
export const resetFirebaseMocks = () => {
  mockGetDocs.mockReset();
  mockCollection.mockReset();
};

// Helper to create mock Firestore documents
export const createMockDoc = (id, data) => ({
  id,
  data: () => data,
});

// Helper to create mock Firestore snapshot
export const createMockSnapshot = (docs = []) => ({
  empty: docs.length === 0,
  docs: docs.map(({ id, data }) => createMockDoc(id, data)),
});
