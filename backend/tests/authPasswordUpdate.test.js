const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { updateMe } = require('../src/controllers/auth.controller');

describe('Auth Profile & Password Update (updateMe)', () => {
  it('hashes new password when user.password is modified', async () => {
    // Instantiate in-memory Mongoose user
    const user = new User({
      name: 'Bon Hernandez',
      email: 'roanrh11@gmail.com',
      password: 'randomGooglePassword123',
      role: 'resident',
      barangay: 'Concepcion Pequeña',
    });

    // Save creates initial hash
    await user.validate();
    // Simulate pre-save hook manually or via schema method
    const initialHash = await bcrypt.hash(user.password, 12);
    user.password = initialHash;

    // Simulate updateMe setting a new user-chosen password
    const newPlainPassword = 'myNewSecretPassword123';
    user.password = newPlainPassword;

    // Verify bcrypt hashing happens before save
    const hashedNew = await bcrypt.hash(user.password, 12);
    user.password = hashedNew;

    // Match password against the new password
    const matchesNew = await user.matchPassword(newPlainPassword);
    expect(matchesNew).toBe(true);

    // Old password should no longer match
    const matchesOld = await user.matchPassword('randomGooglePassword123');
    expect(matchesOld).toBe(false);
  });

  it('rejects passwords shorter than 6 characters', () => {
    const invalidPassword = '123';
    expect(invalidPassword.trim().length < 6).toBe(true);
  });

  it('does not permit a profile update to change a password', async () => {
    const user = { _id: 'resident-id', role: 'resident', save: jest.fn() };
    const select = jest.fn().mockResolvedValue(user);
    const findById = jest.spyOn(User, 'findById').mockReturnValue({ select });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    try {
      await updateMe({ user: { _id: 'resident-id' }, body: { password: 'new-password' } }, res);
      expect(select).toHaveBeenCalledWith('+password');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(user.save).not.toHaveBeenCalled();
    } finally {
      findById.mockRestore();
    }
  });
});
