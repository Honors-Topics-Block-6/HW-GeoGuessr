import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase before importing the service
vi.mock('../firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((...args) => args),
  where: vi.fn((...args) => args)
}));

import { collection, getDocs } from 'firebase/firestore';
import { getRandomImage, getAllApprovedImages, getAllSampleImages } from './imageService';

describe('imageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('getAllApprovedImages', () => {
    it('should fetch from both images and submissions collections', async () => {
      const mockImagesDocs = [
        { id: 'img-1', data: () => ({ url: 'img1.jpg', correctLocation: { x: 10, y: 20 }, correctFloor: 1 }) }
      ];
      const mockSubmissionsDocs = [
        { id: 'sub-1', data: () => ({ photoURL: 'sub1.jpg', location: { x: 30, y: 40 }, floor: 2, photoName: 'Submitted image' }) }
      ];

      getDocs
        .mockResolvedValueOnce({ docs: mockImagesDocs })
        .mockResolvedValueOnce({ docs: mockSubmissionsDocs });

      const result = await getAllApprovedImages();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('img-1');
      expect(result[1].id).toBe('sub-1');
      expect(result[1].url).toBe('sub1.jpg');
      expect(result[1].correctLocation).toEqual({ x: 30, y: 40 });
      expect(result[1].correctFloor).toBe(2);
    });

    it('should return empty array on error', async () => {
      getDocs.mockRejectedValueOnce(new Error('Firestore unavailable'));

      const result = await getAllApprovedImages();

      expect(result).toEqual([]);
    });
  });

  describe('getRandomImage', () => {
    it('should fetch from Firestore', async () => {
      const mockImagesDocs = [
        { id: 'doc-1', data: () => ({ url: 'test.jpg', correctLocation: { x: 10, y: 20 }, correctFloor: 1 }) }
      ];

      getDocs
        .mockResolvedValueOnce({ docs: mockImagesDocs })
        .mockResolvedValueOnce({ docs: [] });

      await getRandomImage();

      expect(collection).toHaveBeenCalled();
      expect(getDocs).toHaveBeenCalled();
    });

    it('should return an approved image', async () => {
      const mockImagesDocs = [
        { id: 'firestore-1', data: () => ({ url: 'https://firestore.com/image.jpg', correctLocation: { x: 30, y: 40 }, correctFloor: 2 }) }
      ];

      getDocs
        .mockResolvedValueOnce({ docs: mockImagesDocs })
        .mockResolvedValueOnce({ docs: [] });

      const image = await getRandomImage();

      expect(image.id).toBe('firestore-1');
      expect(image.url).toBe('https://firestore.com/image.jpg');
    });

    it('should return null when no approved images exist', async () => {
      getDocs
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: [] });

      const image = await getRandomImage();

      expect(image).toBeNull();
    });

    it('should return null on Firestore error', async () => {
      getDocs.mockRejectedValueOnce(new Error('Firestore unavailable'));

      const image = await getRandomImage();

      expect(image).toBeNull();
    });

    it('should return random image when multiple available', async () => {
      const mockImagesDocs = [
        { id: 'doc-1', data: () => ({ url: 'test1.jpg', correctLocation: { x: 10, y: 20 }, correctFloor: 1 }) },
        { id: 'doc-2', data: () => ({ url: 'test2.jpg', correctLocation: { x: 30, y: 40 }, correctFloor: 2 }) },
        { id: 'doc-3', data: () => ({ url: 'test3.jpg', correctLocation: { x: 50, y: 60 }, correctFloor: 3 }) }
      ];

      getDocs
        .mockResolvedValue({ docs: mockImagesDocs });

      // Run multiple times to check randomness
      const results = new Set();
      for (let i = 0; i < 30; i++) {
        const image = await getRandomImage();
        results.add(image.id);
      }

      // Should get at least one image
      expect(results.size).toBeGreaterThanOrEqual(1);
    });

    it('should include approved submissions in the pool', async () => {
      const mockImagesDocs = [];
      const mockSubmissionsDocs = [
        { id: 'sub-1', data: () => ({ photoURL: 'submitted.jpg', location: { x: 45, y: 55 }, floor: 2, photoName: 'A submitted image' }) }
      ];

      getDocs
        .mockResolvedValueOnce({ docs: mockImagesDocs })
        .mockResolvedValueOnce({ docs: mockSubmissionsDocs });

      const image = await getRandomImage();

      expect(image.id).toBe('sub-1');
      expect(image.url).toBe('submitted.jpg');
      expect(image.correctLocation).toEqual({ x: 45, y: 55 });
      expect(image.correctFloor).toBe(2);
    });

    it('should merge Firestore data with doc id', async () => {
      const mockImagesDocs = [
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

      getDocs
        .mockResolvedValueOnce({ docs: mockImagesDocs })
        .mockResolvedValueOnce({ docs: [] });

      const image = await getRandomImage();

      expect(image.id).toBe('unique-doc-id');
      expect(image.url).toBe('https://example.com/img.jpg');
      expect(image.correctLocation).toEqual({ x: 45, y: 55 });
      expect(image.correctFloor).toBe(2);
      expect(image.description).toBe('A test image');
    });
  });
});
