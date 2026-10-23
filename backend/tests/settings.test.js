const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const MissedReport = require('../src/models/MissedReport');
const {
  changePassword,
  getSettings,
  updateSettings,
  deleteAccount,
  getAppInfo,
} = require('../src/controllers/auth.controller');

// Helper to mock express res object
const mockResponse = () => {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data) => {
    res.data = data;
    return res;
  });
  return res;
};

describe('Resident Settings & Preferences Backend Tests', () => {
  describe('User Model Settings Schema Defaults', () => {
    it('initializes default settings and auth metadata properly', () => {
      const user = new User({
        name: 'Maria Santos',
        email: 'maria@example.com',
        password: 'password123',
        role: 'resident',
      });

      expect(user.settings.theme).toBe('system');
      expect(user.settings.language).toBe('en');
      expect(user.settings.notifications.pushEnabled).toBe(true);
      expect(user.settings.notifications.collectionReminders).toBe(true);
      expect(user.settings.notifications.scheduleUpdates).toBe(true);
      expect(user.settings.notifications.announcements).toBe(true);
      expect(user.settings.notifications.reminderMinutesBefore).toBe(30);
      expect(user.notificationsEnabled).toBe(true);
      expect(user.authProvider).toBe('local');
      expect(user.isPasswordSet).toBe(true);
    });

    it('allows customized theme and language settings', () => {
      const user = new User({
        name: 'Juan Dela Cruz',
        email: 'juan@example.com',
        password: 'password123',
        role: 'resident',
        settings: {
          theme: 'dark',
          language: 'fil',
          notifications: {
            pushEnabled: false,
            collectionReminders: false,
            reminderMinutesBefore: 60,
          },
        },
      });

      expect(user.settings.theme).toBe('dark');
      expect(user.settings.language).toBe('fil');
      expect(user.settings.notifications.pushEnabled).toBe(false);
      expect(user.settings.notifications.collectionReminders).toBe(false);
      expect(user.settings.notifications.scheduleUpdates).toBe(true); // default preserved
      expect(user.settings.notifications.reminderMinutesBefore).toBe(60);
    });
  });

  describe('changePassword Controller', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('rejects passwords shorter than 6 characters', async () => {
      const req = {
        user: { _id: new mongoose.Types.ObjectId() },
        body: { currentPassword: 'password123', newPassword: '123' },
      };
      const res = mockResponse();

      await changePassword(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toMatch(/at least 6 characters/i);
    });

    it('rejects if current password is missing for a user with password set', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        authProvider: 'local',
        isPasswordSet: true,
        matchPassword: jest.fn(),
        save: jest.fn(),
      };
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser),
      });

      const req = {
        user: { _id: mockUser._id },
        body: { newPassword: 'newValidPassword123' },
      };
      const res = mockResponse();

      await changePassword(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toMatch(/Current password is required/i);
    });

    it('rejects if current password does not match', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        authProvider: 'local',
        isPasswordSet: true,
        matchPassword: jest.fn().mockResolvedValue(false),
        save: jest.fn(),
      };
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser),
      });

      const req = {
        user: { _id: mockUser._id },
        body: { currentPassword: 'wrongPassword123', newPassword: 'newValidPassword123' },
      };
      const res = mockResponse();

      await changePassword(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toMatch(/Current password is incorrect/i);
    });

    it('successfully changes password with valid credentials', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        authProvider: 'local',
        isPasswordSet: true,
        password: 'oldPasswordHash',
        matchPassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser),
      });

      const req = {
        user: { _id: mockUser._id },
        body: { currentPassword: 'oldPassword123', newPassword: 'brandNewPassword123' },
      };
      const res = mockResponse();

      await changePassword(req, res);
      expect(res.statusCode).toBe(200);
      expect(mockUser.password).toBe('brandNewPassword123');
      expect(mockUser.isPasswordSet).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();
      expect(res.data.data.message).toMatch(/Password changed successfully/i);
    });

    it('allows Google user setting initial password without current password', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        authProvider: 'google',
        isPasswordSet: false,
        password: 'randomGooglePassword',
        matchPassword: jest.fn(),
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser),
      });

      const req = {
        user: { _id: mockUser._id },
        body: { newPassword: 'myChosenGoogleUserPassword123' },
      };
      const res = mockResponse();

      await changePassword(req, res);
      expect(res.statusCode).toBe(200);
      expect(mockUser.password).toBe('myChosenGoogleUserPassword123');
      expect(mockUser.isPasswordSet).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('Settings Controllers (getSettings & updateSettings)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('getSettings returns structured user preferences and profile details', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Maria Santos',
        email: 'maria@example.com',
        phone: '09123456789',
        barangay: 'Triangulo',
        location: 'Zone 1',
        authProvider: 'local',
        isPasswordSet: true,
        notificationsEnabled: true,
        settings: {
          theme: 'dark',
          language: 'fil',
          notifications: {
            pushEnabled: true,
            collectionReminders: true,
            scheduleUpdates: false,
            announcements: true,
            reminderMinutesBefore: 45,
          },
        },
      };

      jest.spyOn(User, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      const req = { user: { _id: mockUser._id } };
      const res = mockResponse();

      await getSettings(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.data.data.settings.theme).toBe('dark');
      expect(res.data.data.settings.language).toBe('fil');
      expect(res.data.data.settings.notifications.reminderMinutesBefore).toBe(45);
      expect(res.data.data.settings.notifications.scheduleUpdates).toBe(false);
      expect(res.data.data.email).toBe('maria@example.com');
      expect(res.data.data.barangay).toBe('Triangulo');
    });

    it('updateSettings rejects invalid theme options', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        settings: { theme: 'system', language: 'en', notifications: {} },
        save: jest.fn(),
      };
      jest.spyOn(User, 'findById').mockResolvedValue(mockUser);

      const req = {
        user: { _id: mockUser._id },
        body: { theme: 'neon-glow' },
      };
      const res = mockResponse();

      await updateSettings(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toMatch(/Invalid theme option/i);
    });

    it('updateSettings successfully updates theme and notifications', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        settings: {
          theme: 'light',
          language: 'en',
          notifications: {
            pushEnabled: true,
            collectionReminders: true,
            scheduleUpdates: true,
            announcements: true,
            reminderMinutesBefore: 30,
          },
        },
        pushTokens: [{ token: 'ExponentPushToken[123]', isEnabled: true }],
        notificationsEnabled: true,
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(User, 'findById').mockResolvedValue(mockUser);

      const req = {
        user: { _id: mockUser._id },
        body: {
          theme: 'dark',
          language: 'fil',
          notifications: {
            pushEnabled: false,
            collectionReminders: false,
          },
        },
      };
      const res = mockResponse();

      await updateSettings(req, res);
      expect(res.statusCode).toBe(200);
      expect(mockUser.settings.theme).toBe('dark');
      expect(mockUser.settings.language).toBe('fil');
      expect(mockUser.settings.notifications.pushEnabled).toBe(false);
      expect(mockUser.settings.notifications.collectionReminders).toBe(false);
      expect(mockUser.notificationsEnabled).toBe(false);
      expect(mockUser.pushTokens[0].isEnabled).toBe(false);
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('getAppInfo Controller', () => {
    it('returns official SWMO hotline, waste guidelines, and app information', async () => {
      const req = {};
      const res = mockResponse();

      await getAppInfo(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.data.data.app.name).toBe('Resiklean');
      expect(res.data.data.swmoContact.hotlines.length).toBeGreaterThan(0);
      expect(res.data.data.wasteSegregationGuide.length).toBe(4);
      expect(res.data.data.wasteSegregationGuide.map((g) => g.category)).toEqual(
        expect.arrayContaining(['biodegradable', 'non-biodegradable', 'recyclable', 'special-hazardous'])
      );
      expect(res.data.data.faqs.length).toBeGreaterThan(0);
    });
  });

  describe('deleteAccount Controller', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('deletes user account and soft-marks related complaints', async () => {
      const userId = new mongoose.Types.ObjectId();
      jest.spyOn(User, 'findByIdAndDelete').mockResolvedValue({ _id: userId });
      jest.spyOn(MissedReport, 'updateMany').mockResolvedValue({ modifiedCount: 2 });

      const req = { user: { _id: userId } };
      const res = mockResponse();

      await deleteAccount(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.data.data.message).toMatch(/Account deleted successfully/i);
      expect(MissedReport.updateMany).toHaveBeenCalledWith(
        { residentId: userId },
        { $set: { isResidentDeleted: true } }
      );
    });
  });
});
