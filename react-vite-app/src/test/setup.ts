/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firestore to prevent runtime errors in unit tests.
// Individual tests can override these mocks when they need specific behavior.
vi.mock('firebase/firestore', () => {
  const Timestamp = {
    now: () => ({
      toMillis: () => Date.now(),
    }),
  };

  const makeSnapshot = (data: unknown = null) => ({
    exists: () => data !== null && data !== undefined,
    data: () => data,
    id: 'mock-id',
  });

  return {
    Timestamp,
    doc: (...args: unknown[]) => ({ __type: 'doc', args }),
    collection: (...args: unknown[]) => ({ __type: 'collection', args }),
    query: (...args: unknown[]) => ({ __type: 'query', args }),
    where: (...args: unknown[]) => ({ __type: 'where', args }),
    orderBy: (...args: unknown[]) => ({ __type: 'orderBy', args }),
    onSnapshot: (_ref: unknown, onNext: (snap: unknown) => void, _onError?: (err: unknown) => void) => {
      onNext(makeSnapshot(null));
      return () => {};
    },
    getDoc: async () => makeSnapshot(null),
    getDocs: async () => ({ empty: true, docs: [] as unknown[] }),
    addDoc: async () => ({ id: 'mock-doc-id' }),
    setDoc: async () => {},
    updateDoc: async () => {},
    deleteDoc: async () => {},
    arrayUnion: (...items: unknown[]) => ({ __type: 'arrayUnion', items }),
    arrayRemove: (...items: unknown[]) => ({ __type: 'arrayRemove', items }),
    increment: (n: number) => ({ __type: 'increment', n }),
    serverTimestamp: () => ({ __type: 'serverTimestamp' }),
  };
});

// Mock daily goals hook to avoid Firestore access in unit tests
vi.mock('../hooks/useDailyGoals', () => ({
  useDailyGoals: vi.fn(() => ({
    goals: [],
    allCompleted: false,
    bonusXpAwarded: false,
    bonusXpAmount: 0,
    loading: false,
    error: null,
    refreshGoals: vi.fn(async () => {}),
    recordProgress: vi.fn(async () => ({ updated: false, allCompleted: false })),
    claimBonusXp: vi.fn(async () => 0),
    GOAL_TYPES: {}
  }))
}));

// Mock matchMedia for components that use it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as unknown as typeof IntersectionObserver;

// Mock ResizeObserver — stores callback so tests can trigger it
(global as Record<string, unknown>)._resizeObserverInstances = [];
global.ResizeObserver = class ResizeObserver {
  _callback: ResizeObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(callback: ResizeObserverCallback) {
    this._callback = callback;
    ((global as Record<string, unknown>)._resizeObserverInstances as ResizeObserver[]).push(this);
  }
} as unknown as typeof ResizeObserver;

// Suppress console errors during tests (optional - can be removed if you want to see all errors)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Filter out known React warnings
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('ReactDOM.render is no longer supported') ||
       args[0].includes('Warning: An update to'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Reset all mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});
