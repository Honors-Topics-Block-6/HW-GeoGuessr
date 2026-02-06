import { vi } from 'vitest';

// Sample test images
export const mockImages = [
  {
    id: 'test-1',
    url: 'https://example.com/image1.jpg',
    correctLocation: { x: 25, y: 35 },
    correctFloor: 1,
    description: 'Test image 1'
  },
  {
    id: 'test-2',
    url: 'https://example.com/image2.jpg',
    correctLocation: { x: 50, y: 50 },
    correctFloor: 2,
    description: 'Test image 2'
  },
  {
    id: 'test-3',
    url: 'https://example.com/image3.jpg',
    correctLocation: { x: 75, y: 65 },
    correctFloor: 3,
    description: 'Test image 3'
  }
];

// Mock functions
export const mockGetRandomImage = vi.fn();
export const mockGetRandomSampleImage = vi.fn();
export const mockGetAllSampleImages = vi.fn();

// Setup default implementations
export const setupImageServiceMocks = () => {
  mockGetRandomImage.mockResolvedValue(mockImages[0]);
  mockGetRandomSampleImage.mockReturnValue(mockImages[0]);
  mockGetAllSampleImages.mockReturnValue([...mockImages]);
};

// Reset mocks helper
export const resetImageServiceMocks = () => {
  mockGetRandomImage.mockReset();
  mockGetRandomSampleImage.mockReset();
  mockGetAllSampleImages.mockReset();
  setupImageServiceMocks();
};

// Initialize default mocks
setupImageServiceMocks();
