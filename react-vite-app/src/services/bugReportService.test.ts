import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase before importing the service
vi.mock('../firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  doc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn((...args: unknown[]) => args),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' }))
}));

import { addDoc, getDocs, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import {
  submitBugReport,
  getBugReportsByUser,
  updateBugReportStatus,
  addAdminNote,
  subscribeToBugReports,
  captureEnvironment,
  VALID_CATEGORIES,
  VALID_SEVERITIES,
  VALID_STATUSES
} from './bugReportService';
import type { BugReportCategory, BugReportSeverity, BugReportStatus } from './bugReportService';

const mockedAddDoc = vi.mocked(addDoc);
const mockedGetDocs = vi.mocked(getDocs);
const mockedGetDoc = vi.mocked(getDoc);
const mockedUpdateDoc = vi.mocked(updateDoc);
const mockedOnSnapshot = vi.mocked(onSnapshot);

describe('bugReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('captureEnvironment', () => {
    it('should return an object with environment properties', () => {
      const env = captureEnvironment();

      expect(env).toHaveProperty('userAgent');
      expect(env).toHaveProperty('platform');
      expect(env).toHaveProperty('language');
      expect(env).toHaveProperty('screenWidth');
      expect(env).toHaveProperty('screenHeight');
      expect(env).toHaveProperty('windowWidth');
      expect(env).toHaveProperty('windowHeight');
      expect(env).toHaveProperty('timestamp');
    });

    it('should return a valid ISO timestamp', () => {
      const env = captureEnvironment();
      const date = new Date(env.timestamp);

      expect(date.toString()).not.toBe('Invalid Date');
    });

    it('should return numeric screen dimensions', () => {
      const env = captureEnvironment();

      expect(typeof env.screenWidth).toBe('number');
      expect(typeof env.screenHeight).toBe('number');
      expect(typeof env.windowWidth).toBe('number');
      expect(typeof env.windowHeight).toBe('number');
    });
  });

  describe('constants', () => {
    it('should export valid categories', () => {
      expect(VALID_CATEGORIES).toContain('gameplay');
      expect(VALID_CATEGORIES).toContain('ui');
      expect(VALID_CATEGORIES).toContain('performance');
      expect(VALID_CATEGORIES).toContain('map');
      expect(VALID_CATEGORIES).toContain('multiplayer');
      expect(VALID_CATEGORIES).toContain('other');
    });

    it('should export valid severities', () => {
      expect(VALID_SEVERITIES).toContain('low');
      expect(VALID_SEVERITIES).toContain('medium');
      expect(VALID_SEVERITIES).toContain('high');
      expect(VALID_SEVERITIES).toContain('critical');
    });

    it('should export valid statuses', () => {
      expect(VALID_STATUSES).toContain('open');
      expect(VALID_STATUSES).toContain('in-progress');
      expect(VALID_STATUSES).toContain('resolved');
      expect(VALID_STATUSES).toContain('wont-fix');
      expect(VALID_STATUSES).toContain('closed');
    });
  });

  describe('submitBugReport', () => {
    const validReport = {
      userId: 'user-123',
      username: 'TestUser',
      userEmail: 'test@example.com',
      title: 'Test Bug',
      category: 'gameplay' as BugReportCategory,
      severity: 'medium' as BugReportSeverity,
      description: 'This is a test bug description.',
      stepsToReproduce: '1. Do this\n2. Do that',
      screenshot: null,
      environment: { userAgent: 'test', platform: 'test', language: 'en', screenWidth: 1920, screenHeight: 1080, windowWidth: 1920, windowHeight: 1080, timestamp: new Date().toISOString() }
    };

    it('should submit a valid bug report', async () => {
      mockedAddDoc.mockResolvedValueOnce({ id: 'new-report-id' } as never);

      const id = await submitBugReport(validReport);

      expect(id).toBe('new-report-id');
      expect(mockedAddDoc).toHaveBeenCalledTimes(1);
    });

    it('should throw if title is empty', async () => {
      await expect(
        submitBugReport({ ...validReport, title: '' })
      ).rejects.toThrow('Title is required.');
    });

    it('should throw if title is whitespace only', async () => {
      await expect(
        submitBugReport({ ...validReport, title: '   ' })
      ).rejects.toThrow('Title is required.');
    });

    it('should throw if title exceeds 100 characters', async () => {
      await expect(
        submitBugReport({ ...validReport, title: 'a'.repeat(101) })
      ).rejects.toThrow('100 characters or less');
    });

    it('should throw if userId is missing', async () => {
      await expect(
        submitBugReport({ ...validReport, userId: '' })
      ).rejects.toThrow('User ID is required.');
    });

    it('should throw if username is missing', async () => {
      await expect(
        submitBugReport({ ...validReport, username: '' })
      ).rejects.toThrow('Username is required.');
    });

    it('should throw for invalid category', async () => {
      await expect(
        submitBugReport({ ...validReport, category: 'invalid' as BugReportCategory })
      ).rejects.toThrow('valid category');
    });

    it('should throw for invalid severity', async () => {
      await expect(
        submitBugReport({ ...validReport, severity: 'extreme' as BugReportSeverity })
      ).rejects.toThrow('valid severity');
    });

    it('should throw if description is empty', async () => {
      await expect(
        submitBugReport({ ...validReport, description: '' })
      ).rejects.toThrow('Description is required.');
    });

    it('should throw if description exceeds 2000 characters', async () => {
      await expect(
        submitBugReport({ ...validReport, description: 'a'.repeat(2001) })
      ).rejects.toThrow('2000 characters or less');
    });

    it('should throw if steps to reproduce exceed 1000 characters', async () => {
      await expect(
        submitBugReport({ ...validReport, stepsToReproduce: 'a'.repeat(1001) })
      ).rejects.toThrow('1000 characters or less');
    });

    it('should enforce rate limiting for the same user', async () => {
      mockedAddDoc.mockResolvedValue({ id: 'report-1' } as never);

      // First submission should work
      await submitBugReport({ ...validReport, userId: 'rate-limit-user' });

      // Second immediate submission should be rejected
      await expect(
        submitBugReport({ ...validReport, userId: 'rate-limit-user' })
      ).rejects.toThrow('Please wait');
    });

    it('should allow submissions from different users', async () => {
      mockedAddDoc.mockResolvedValue({ id: 'report-x' } as never);

      await submitBugReport({ ...validReport, userId: 'userA' });
      const id = await submitBugReport({ ...validReport, userId: 'userB' });

      expect(id).toBe('report-x');
    });
  });

  describe('getBugReportsByUser', () => {
    it('should return empty array if userId is falsy', async () => {
      const result = await getBugReportsByUser('');
      expect(result).toEqual([]);
    });

    it('should return reports for a user', async () => {
      const mockDocs = [
        { id: 'report-1', data: () => ({ title: 'Bug 1', status: 'open', severity: 'low' }) },
        { id: 'report-2', data: () => ({ title: 'Bug 2', status: 'resolved', severity: 'high' }) }
      ];

      mockedGetDocs.mockResolvedValueOnce({ docs: mockDocs } as never);

      const reports = await getBugReportsByUser('user-123');

      expect(reports).toHaveLength(2);
      expect(reports[0].id).toBe('report-1');
      expect(reports[0].title).toBe('Bug 1');
      expect(reports[1].id).toBe('report-2');
    });
  });

  describe('updateBugReportStatus', () => {
    it('should throw if reportId is missing', async () => {
      await expect(
        updateBugReportStatus('', 'resolved', 'admin-1', 'Admin')
      ).rejects.toThrow('Report ID is required.');
    });

    it('should throw for invalid status', async () => {
      await expect(
        updateBugReportStatus('report-1', 'invalid-status' as BugReportStatus, 'admin-1', 'Admin')
      ).rejects.toThrow('Invalid status value.');
    });

    it('should throw if adminUid is missing', async () => {
      await expect(
        updateBugReportStatus('report-1', 'resolved', '', 'Admin')
      ).rejects.toThrow('Admin UID is required.');
    });

    it('should update the report status', async () => {
      mockedUpdateDoc.mockResolvedValueOnce(undefined as never);

      await updateBugReportStatus('report-1', 'resolved', 'admin-1', 'Admin');

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe('addAdminNote', () => {
    it('should throw if reportId is missing', async () => {
      await expect(
        addAdminNote('', 'admin-1', 'Admin', 'A note')
      ).rejects.toThrow('Report ID is required.');
    });

    it('should throw if adminUid is missing', async () => {
      await expect(
        addAdminNote('report-1', '', 'Admin', 'A note')
      ).rejects.toThrow('Admin UID is required.');
    });

    it('should throw if note is empty', async () => {
      await expect(
        addAdminNote('report-1', 'admin-1', 'Admin', '')
      ).rejects.toThrow('Note cannot be empty.');
    });

    it('should throw if note exceeds 500 characters', async () => {
      await expect(
        addAdminNote('report-1', 'admin-1', 'Admin', 'a'.repeat(501))
      ).rejects.toThrow('500 characters or less');
    });

    it('should throw if report is not found', async () => {
      mockedGetDoc.mockResolvedValueOnce({ exists: () => false } as never);

      await expect(
        addAdminNote('report-1', 'admin-1', 'Admin', 'A note')
      ).rejects.toThrow('Bug report not found.');
    });

    it('should add a note to an existing report', async () => {
      mockedGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ adminNotes: [] })
      } as never);
      mockedUpdateDoc.mockResolvedValueOnce(undefined as never);

      await addAdminNote('report-1', 'admin-1', 'AdminUser', 'Test note');

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const updateCall = mockedUpdateDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
      const adminNotes = updateCall.adminNotes as Array<{ adminUid: string; adminUsername: string; note: string }>;
      expect(adminNotes).toHaveLength(1);
      expect(adminNotes[0].adminUid).toBe('admin-1');
      expect(adminNotes[0].adminUsername).toBe('AdminUser');
      expect(adminNotes[0].note).toBe('Test note');
    });

    it('should append to existing notes', async () => {
      const existingNotes = [{ adminUid: 'admin-0', adminUsername: 'OldAdmin', note: 'Old note', createdAt: '2024-01-01' }];
      mockedGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ adminNotes: existingNotes })
      } as never);
      mockedUpdateDoc.mockResolvedValueOnce(undefined as never);

      await addAdminNote('report-1', 'admin-1', 'NewAdmin', 'New note');

      const updateCall = mockedUpdateDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
      const adminNotes = updateCall.adminNotes as Array<{ note: string }>;
      expect(adminNotes).toHaveLength(2);
      expect(adminNotes[0].note).toBe('Old note');
      expect(adminNotes[1].note).toBe('New note');
    });
  });

  describe('subscribeToBugReports', () => {
    it('should call onSnapshot and return an unsubscribe function', () => {
      const mockUnsubscribe = vi.fn();
      mockedOnSnapshot.mockReturnValueOnce(mockUnsubscribe as never);

      const callback = vi.fn();
      const unsubscribe = subscribeToBugReports(callback);

      expect(mockedOnSnapshot).toHaveBeenCalledTimes(1);
      expect(typeof unsubscribe).toBe('function');
    });
  });
});
