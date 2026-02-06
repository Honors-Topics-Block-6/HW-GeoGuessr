import { render } from '@testing-library/react';

/**
 * Custom render function that can wrap components with providers
 * Extend this as needed for context providers, etc.
 */
export function renderWithProviders(ui, options = {}) {
  function Wrapper({ children }) {
    // Add providers here as needed (e.g., ThemeProvider, Context, etc.)
    return children;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Helper to create mock events with getBoundingClientRect
 */
export function createMockClickEvent(x, y, element) {
  const rect = {
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
  };

  return {
    clientX: x,
    clientY: y,
    target: element,
    currentTarget: element,
    preventDefault: () => {},
    stopPropagation: () => {},
  };
}

/**
 * Helper to mock element.getBoundingClientRect
 */
export function mockBoundingClientRect(element, rect = {}) {
  const defaultRect = {
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
  };

  element.getBoundingClientRect = () => ({ ...defaultRect, ...rect });
}

/**
 * Wait for async updates
 */
export function waitForNextTick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Create mock game result
 */
export function createMockResult(overrides = {}) {
  return {
    roundNumber: 1,
    imageUrl: 'https://example.com/image.jpg',
    guessLocation: { x: 30, y: 40 },
    actualLocation: { x: 35, y: 45 },
    guessFloor: 2,
    actualFloor: 2,
    distance: 7.07,
    locationScore: 3500,
    floorCorrect: true,
    score: 3500,
    ...overrides
  };
}

/**
 * Create multiple mock rounds
 */
export function createMockRounds(count = 5) {
  return Array.from({ length: count }, (_, i) => createMockResult({
    roundNumber: i + 1,
    score: 3000 + Math.floor(Math.random() * 2000),
    locationScore: 3000 + Math.floor(Math.random() * 2000),
    floorCorrect: Math.random() > 0.3
  }));
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
