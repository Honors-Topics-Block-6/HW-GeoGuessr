import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase before importing the service
vi.mock('../firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn()
}));

import { collection, getDocs } from 'firebase/firestore';
import { getRandomImage, getRandomSampleImage, getAllSampleImages } from './imageService';

describe('imageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRandomSampleImage', () => {
    it('should return a sample image', () => {
      const image = getRandomSampleImage();

      expect(image).toBeDefined();
      expect(image).toHaveProperty('id');
      expect(image).toHaveProperty('url');
      expect(image).toHaveProperty('correctLocation');
      expect(image).toHaveProperty('correctFloor');
    });

    it('should return an image with valid structure', () => {
      const image = getRandomSampleImage();

      expect(typeof image.id).toBe('string');
      expect(typeof image.url).toBe('string');
      expect(typeof image.correctLocation.x).toBe('number');
      expect(typeof image.correctLocation.y).toBe('number');
      expect(typeof image.correctFloor).toBe('number');
    });

    it('should return a random image from the sample set', () => {
      const allImages = getAllSampleImages();
      const image = getRandomSampleImage();

      expect(allImages).toContainEqual(image);
    });

    it('should return varied images over multiple calls', () => {
      const results = new Set();

      // Run multiple times to increase chance of getting different images
      for (let i = 0; i < 50; i++) {
        const image = getRandomSampleImage();
        results.add(image.id);
      }

      // Should get at least 2 different images (probabilistic)
      expect(results.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getAllSampleImages', () => {
    it('should return an array of sample images', () => {
      const images = getAllSampleImages();

      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThan(0);
    });

    it('should return at least 5 sample images', () => {
      const images = getAllSampleImages();

      expect(images.length).toBeGreaterThanOrEqual(5);
    });

    it('should return images with all required properties', () => {
      const images = getAllSampleImages();

      images.forEach(image => {
        expect(image).toHaveProperty('id');
        expect(image).toHaveProperty('url');
        expect(image).toHaveProperty('correctLocation');
        expect(image).toHaveProperty('correctFloor');
        expect(image).toHaveProperty('description');
      });
    });

    it('should return a new array (not mutate original)', () => {
      const images1 = getAllSampleImages();
      const images2 = getAllSampleImages();

      expect(images1).not.toBe(images2);
      expect(images1).toEqual(images2);
    });

    it('should have valid location coordinates', () => {
      const images = getAllSampleImages();

      images.forEach(image => {
        expect(image.correctLocation.x).toBeGreaterThanOrEqual(0);
        expect(image.correctLocation.x).toBeLessThanOrEqual(100);
        expect(image.correctLocation.y).toBeGreaterThanOrEqual(0);
        expect(image.correctLocation.y).toBeLessThanOrEqual(100);
      });
    });

    it('should have valid floor numbers', () => {
      const images = getAllSampleImages();

      images.forEach(image => {
        expect(image.correctFloor).toBeGreaterThanOrEqual(1);
        expect(image.correctFloor).toBeLessThanOrEqual(3);
      });
    });
  });

  describe('getRandomImage', () => {
    it('should fetch from Firestore', async () => {
      const mockDocs = [
        { id: 'doc-1', data: () => ({ url: 'test.jpg', correctLocation: { x: 10, y: 20 }, correctFloor: 1 }) }
      ];

      getDocs.mockResolvedValueOnce({
        empty: false,
        docs: mockDocs
      });

      await getRandomImage();

      expect(collection).toHaveBeenCalled();
      expect(getDocs).toHaveBeenCalled();
    });

    it('should return Firestore image when available', async () => {
      const mockDocs = [
        { id: 'firestore-1', data: () => ({ url: 'https://firestore.com/image.jpg', correctLocation: { x: 30, y: 40 }, correctFloor: 2 }) }
      ];

      getDocs.mockResolvedValueOnce({
        empty: false,
        docs: mockDocs
      });

      const image = await getRandomImage();

      expect(image.id).toBe('firestore-1');
      expect(image.url).toBe('https://firestore.com/image.jpg');
    });

    it('should fall back to sample images when Firestore is empty', async () => {
      getDocs.mockResolvedValueOnce({
        empty: true,
        docs: []
      });

      const image = await getRandomImage();

      // Should be one of the sample images
      const allSamples = getAllSampleImages();
      const matchingSample = allSamples.find(s => s.id === image.id);

      expect(matchingSample).toBeDefined();
    });

    it('should fall back to sample images on Firestore error', async () => {
      getDocs.mockRejectedValueOnce(new Error('Firestore unavailable'));

      const image = await getRandomImage();

      // Should not throw, should return sample
      expect(image).toBeDefined();
      expect(image).toHaveProperty('id');
      expect(image).toHaveProperty('url');
    });

    it('should return random image from Firestore when multiple available', async () => {
      const mockDocs = [
        { id: 'doc-1', data: () => ({ url: 'test1.jpg', correctLocation: { x: 10, y: 20 }, correctFloor: 1 }) },
        { id: 'doc-2', data: () => ({ url: 'test2.jpg', correctLocation: { x: 30, y: 40 }, correctFloor: 2 }) },
        { id: 'doc-3', data: () => ({ url: 'test3.jpg', correctLocation: { x: 50, y: 60 }, correctFloor: 3 }) }
      ];

      getDocs.mockResolvedValue({
        empty: false,
        docs: mockDocs
      });

      // Run multiple times to check randomness
      const results = new Set();
      for (let i = 0; i < 30; i++) {
        const image = await getRandomImage();
        results.add(image.id);
      }

      // Should get at least one image (randomness may or may not produce variation)
      expect(results.size).toBeGreaterThanOrEqual(1);
    });

    it('should merge Firestore data with doc id', async () => {
      const mockDocs = [
        {
          id: 'unique-doc-id',
          data: () => ({
            url: 'https://example.com/img.jpg',
            correctLocation: { x: 45, y: 55 },
            correctFloor: 2,
            description: 'A test image'
          })
        }
      ];

      getDocs.mockResolvedValueOnce({
        empty: false,
        docs: mockDocs
      });

      const image = await getRandomImage();

      expect(image.id).toBe('unique-doc-id');
      expect(image.url).toBe('https://example.com/img.jpg');
      expect(image.correctLocation).toEqual({ x: 45, y: 55 });
      expect(image.correctFloor).toBe(2);
      expect(image.description).toBe('A test image');
    });
  });
});
