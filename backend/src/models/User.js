const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const { isValidBirthday } = require('../utils/birthday');

const ROLES = ['resident', 'collector', 'staff', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role:     { type: String, enum: ROLES, required: true },
    // Resident-specific
    barangay: { type: String },
    home_segment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
    location: { type: String, trim: true },  // canonical location from CollectionLocation
    phone:    { type: String, trim: true },
    // Collector-specific
    assignedRouteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
    // Staff / Collector profile fields
    employeeId: { type: String, trim: true },
    contact:    { type: String, trim: true },
    shift:      { type: String, enum: ['day', 'night'], default: 'day' },
    profilePhotoUrl: { type: String },
    birthday: { type: String, select: false, validate: { validator: isValidBirthday, message: 'Enter a valid birthday, not a future date.' } },
    identityPhoto: { type: new mongoose.Schema({ publicId: String, format: String }, { _id: false }), select: false },
    // Notifications
    pushTokens: [{
      token: { type: String, required: true },
      platform: { type: String, enum: ['ios', 'android', 'web'] },
      lastActive: { type: Date, default: Date.now },
      isEnabled: { type: Boolean, default: true }
    }],
    notificationsEnabled: { type: Boolean, default: true },
    // Authentication Metadata
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    isPasswordSet: { type: Boolean, default: true },
    // Incremented after password recovery so every token issued before recovery stops working.
    authVersion: { type: Number, default: 0 },
    passwordResetHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    passwordResetRequestedAt: { type: Date, select: false },
    passwordResetFormat: { type: String, enum: ['legacy', 'six-digit'], select: false },
    passwordResetAttempts: { type: Number, select: false },
    // Only accounts provisioned from the administrator dashboard opt into this
    // gate. Keeping the default false preserves access for legacy and resident
    // accounts created through the public registration flow.
    emailVerificationRequired: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    emailVerificationHash: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    emailVerificationRequestedAt: { type: Date, select: false },
    emailVerificationFormat: { type: String, select: false },
    emailVerificationAttempts: { type: Number, select: false },
    // Resident / User Preferences & Settings
    settings: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      language: { type: String, enum: ['en', 'fil'], default: 'en' },
      notifications: {
        pushEnabled: { type: Boolean, default: true },
        collectionReminders: { type: Boolean, default: true },
        announcements: { type: Boolean, default: true },
        reminderMinutesBefore: { type: Number, default: 30 }
      }
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare plain password against hash
userSchema.methods.matchPassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
