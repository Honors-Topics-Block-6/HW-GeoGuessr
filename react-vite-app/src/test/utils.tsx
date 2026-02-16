import React, { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';

/**
 * Custom render function that can wrap components with providers
 * Extend this as needed for context providers, etc.
 */
export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    // Add providers here as needed (e.g., ThemeProvider, Context, etc.)
    return children;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

interface MockClickEvent {
  clientX: number;
  clientY: number;
  target: HTMLElement;
  currentTarget: HTMLElement;
  preventDefault: () => void;
  stopPropagation: () => void;
}

/**
 * Helper to create mock events with getBoundingClientRect
 */
export function createMockClickEvent(x: number, y: number, element: HTMLElement): MockClickEvent {
  return {
    clientX: x,
    clientY: y,
    target: element,
    currentTarget: element,
    preventDefault: () => {},
    stopPropagation: () => {},
  };
}

interface RectOverrides {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  right?: number;
  bottom?: number;
  x?: number;
  y?: number;
}

/**
 * Helper to mock element.getBoundingClientRect
 */
export function mockBoundingClientRect(element: HTMLElement, rect: RectOverrides = {}) {
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

  element.getBoundingClientRect = () => ({ ...defaultRect, ...rect } as DOMRect);
}

/**
 * Wait for async updates
 */
export function waitForNextTick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

interface MockResultOverrides {
  roundNumber?: number;
  imageUrl?: string;
  guessLocation?: { x: number; y: number };
  actualLocation?: { x: number; y: number };
  guessFloor?: number;
  actualFloor?: number;
  distance?: number;
  locationScore?: number;
  floorCorrect?: boolean;
  score?: number;
}

/**
 * Create mock game result
 */
export function createMockResult(overrides: MockResultOverrides = {}) {
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
export function createMockRounds(count: number = 5) {
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
