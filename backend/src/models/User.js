const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

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
    // Notifications
    pushTokens: [{
      token: { type: String, required: true },
      platform: { type: String, enum: ['ios', 'android', 'web'] },
      lastActive: { type: Date, default: Date.now },
      isEnabled: { type: Boolean, default: true }
    }],
    notificationsEnabled: { type: Boolean, default: true },
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
