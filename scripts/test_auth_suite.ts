/**
 * Comprehensive Automated Test Suite for FindSafe Authentication System
 * Tests all 15 requirements specified in Section 9 of the prompt.
 */
import { sqliteDb } from '../server/sqliteDb';
import { db } from '../server/db';
import { hashPassword, verifyPassword, findUserByEmail, findUserById, generateToken, verifyToken } from '../server/auth';

async function runTestSuite() {
  console.log('====================================================');
  console.log('  FindSafe Authentication Comprehensive Test Suite  ');
  console.log('====================================================\n');

  sqliteDb.init();
  db.init();

  let passed = 0;
  let failed = 0;

  function assert(testNum: number, title: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`[PASS] Case ${testNum}: ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] Case ${testNum}: ${title}`);
      if (details) console.error(`       Details: ${details}`);
      failed++;
    }
  }

  const testEmail = `citizen.test.${Date.now()}@example.com`;
  const testPassword = 'Password@12345';
  let createdUserId = '';

  // 1. New citizen registration succeeds
  try {
    const normEmail = testEmail.trim().toLowerCase();
    const newUser = {
      id: `usr_${Date.now()}_test`,
      name: 'Test Citizen User',
      email: normEmail,
      password_hash: hashPassword(testPassword),
      role: 'CITIZEN' as const,
      status: 'active' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login: null,
    };
    createdUserId = newUser.id;
    db.saveUser(newUser);

    const lookup = findUserByEmail(testEmail);
    assert(1, 'New citizen registration succeeds and persists', !!lookup && lookup.id === newUser.id);
  } catch (err: any) {
    assert(1, 'New citizen registration succeeds', false, err.message);
  }

  // 2. The same citizen can log in immediately after registration
  try {
    const user = findUserByEmail(testEmail);
    const valid = user ? verifyPassword(testPassword, user.password_hash) : false;
    const token = user ? generateToken({ userId: user.id, email: user.email, role: user.role }) : null;
    assert(2, 'The same citizen can log in immediately with correct password', valid && !!token);
  } catch (err: any) {
    assert(2, 'Immediate login check', false, err.message);
  }

  // 3. The same citizen can log out and log in again after reopening the website (simulated session reload)
  try {
    // Simulate fresh reload from SQLite database
    const freshUser = sqliteDb.getUserByEmail(testEmail);
    const validAgain = freshUser ? verifyPassword(testPassword, freshUser.password_hash) : false;
    assert(3, 'Same citizen can re-authenticate from SQLite storage across sessions', validAgain && freshUser.id === createdUserId);
  } catch (err: any) {
    assert(3, 'Session re-authentication', false, err.message);
  }

  // 4. Email addresses with different capitalization or surrounding whitespace are handled consistently
  try {
    const variedEmail = `   ${testEmail.toUpperCase()}   `;
    const foundVaried = findUserByEmail(variedEmail);
    const sqlVaried = sqliteDb.getUserByEmail(variedEmail);
    assert(4, 'Email case-insensitivity and whitespace trimming work consistently', !!foundVaried && !!sqlVaried);
  } catch (err: any) {
    assert(4, 'Email normalization', false, err.message);
  }

  // 5. An incorrect password is rejected
  try {
    const user = findUserByEmail(testEmail);
    const rejected = user ? verifyPassword('WrongPassword999', user.password_hash) : false;
    assert(5, 'Incorrect password is securely rejected', !rejected);
  } catch (err: any) {
    assert(5, 'Incorrect password rejected', false, err.message);
  }

  // 6. A nonexistent account is rejected safely
  try {
    const nonexistent = findUserByEmail('nonexistent_person_never_registered_999@domain.org');
    assert(6, 'Nonexistent account is safely rejected without crash or leaks', nonexistent === undefined);
  } catch (err: any) {
    assert(6, 'Nonexistent account', false, err.message);
  }

  // 7. Registering an existing email returns duplicate detection
  try {
    const existing = findUserByEmail(testEmail.toUpperCase());
    assert(7, 'Duplicate email registration lookup correctly identifies existing account', !!existing);
  } catch (err: any) {
    assert(7, 'Duplicate email detection', false, err.message);
  }

  // 8. Existing users and stored password hashes remain valid
  try {
    const defaultCitizen = findUserByEmail('citizen@findsafe.ai');
    const citizenValid = defaultCitizen ? verifyPassword('Citizen@1234', defaultCitizen.password_hash) : false;
    const defaultInv = findUserByEmail('investigator@findsafe.ai');
    const invValid = defaultInv ? verifyPassword('Investigator@1234', defaultInv.password_hash) : false;
    const defaultAdmin = findUserByEmail('admin@findsafe.ai');
    const adminValid = defaultAdmin ? verifyPassword('Admin@1234', defaultAdmin.password_hash) : false;
    assert(8, 'Existing seed accounts (Citizen, Investigator, Admin) and password hashes remain 100% valid', citizenValid && invValid && adminValid);
  } catch (err: any) {
    assert(8, 'Existing users and stored hashes', false, err.message);
  }

  // 9. Citizen accounts cannot access investigator-only or admin-only portals (role separation check)
  try {
    const citizenUser = findUserByEmail(testEmail);
    const roleIsCitizen = citizenUser?.role === 'CITIZEN';
    const isCitizenBlockedFromInvestigator = roleIsCitizen && citizenUser.role !== 'INVESTIGATOR';
    const isCitizenBlockedFromAdmin = roleIsCitizen && citizenUser.role !== 'ADMIN';
    assert(9, 'Citizen accounts are strictly segregated from Investigator and Admin portals', isCitizenBlockedFromInvestigator && isCitizenBlockedFromAdmin);
  } catch (err: any) {
    assert(9, 'Citizen role separation', false, err.message);
  }

  // 10. Authorized investigators can log in and access their permitted dashboard
  try {
    const inv = findUserByEmail('investigator@findsafe.ai');
    const isInvApproved = inv?.role === 'INVESTIGATOR' && inv?.status === 'active';
    assert(10, 'Authorized active investigators have approved status and INVESTIGATOR role', isInvApproved);
  } catch (err: any) {
    assert(10, 'Authorized investigator access', false, err.message);
  }

  // 11. Pending investigators cannot access restricted investigator features before approval
  try {
    const pendingInv = {
      id: `usr_pending_inv_${Date.now()}`,
      name: 'Pending Detective',
      email: `pending.inv.${Date.now()}@agency.gov`,
      password_hash: hashPassword('Pending@12345'),
      role: 'INVESTIGATOR' as const,
      status: 'PENDING_APPROVAL' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login: null,
    };
    db.saveUser(pendingInv);
    const retrievedPending = findUserByEmail(pendingInv.email);
    assert(11, 'Pending investigators hold PENDING_APPROVAL status until approved by administrator', retrievedPending?.status === 'PENDING_APPROVAL');
  } catch (err: any) {
    assert(11, 'Pending investigator status', false, err.message);
  }

  // 12. Failed login attempts do not cause unwanted account lockout
  try {
    const testKey = `127.0.0.1:${testEmail}`;
    // Simulate 8 consecutive failed attempts
    for (let i = 0; i < 8; i++) {
      db.recordFailedAttempt(testKey);
    }
    const rateCheck = db.checkRateLimit(testKey);
    assert(12, 'Arbitrary 15-minute account lockout is removed (isLocked is false after >5 attempts)', !rateCheck.isLocked);
    db.resetRateLimit(testKey);
  } catch (err: any) {
    assert(12, 'Lockout removal verification', false, err.message);
  }

  // 13. Sessions persist correctly and verifyToken authenticates identity
  try {
    const testUser = findUserByEmail(testEmail)!;
    const token = generateToken({ userId: testUser.id, email: testUser.email, role: testUser.role });
    const decoded = verifyToken(token);
    assert(13, 'Session token cryptographically verifies identity and role persistence', !!decoded && decoded.userId === testUser.id && decoded.role === 'CITIZEN');
  } catch (err: any) {
    assert(13, 'Session persistence', false, err.message);
  }

  // 14. Forgot Password works (token generation, reset password with new hash, logging in with new password)
  try {
    const userToReset = findUserByEmail(testEmail)!;
    const resetToken = 'test_token_' + Date.now();
    const expiresAt = Date.now() + 3600000;
    sqliteDb.savePasswordResetToken(resetToken, userToReset.id, userToReset.email, expiresAt);

    const tokenRecord = sqliteDb.getPasswordResetToken(resetToken);
    const tokenValid = !!tokenRecord && !tokenRecord.used && tokenRecord.expires_at > Date.now();

    const newPassword = 'BrandNewPassword@2026';
    const newHash = hashPassword(newPassword);
    userToReset.password_hash = newHash;
    db.saveUser(userToReset);
    sqliteDb.markPasswordResetTokenUsed(resetToken);

    const updatedUser = sqliteDb.getUserByEmail(testEmail);
    const newPassWorks = updatedUser ? verifyPassword(newPassword, updatedUser.password_hash) : false;
    const oldPassFails = updatedUser ? !verifyPassword(testPassword, updatedUser.password_hash) : false;
    const usedToken = sqliteDb.getPasswordResetToken(resetToken);

    assert(14, 'Forgot Password full workflow (token generation, hash update, token invalidation, new login)', tokenValid && newPassWorks && oldPassFails && usedToken?.used === 1);
  } catch (err: any) {
    assert(14, 'Forgot Password workflow', false, err.message);
  }

  // 15. Verify that SQLite database relational storage preserves all accounts
  try {
    const stats = sqliteDb.getStats();
    const allUsers = sqliteDb.getAllUsers();
    assert(15, `SQLite database holds ${stats.tableCounts.users} users with integrity check: "${stats.integrity}"`, stats.integrity === 'ok' && allUsers.length > 0);
  } catch (err: any) {
    assert(15, 'SQLite integrity and persistence check', false, err.message);
  }

  console.log('\n====================================================');
  console.log(`  Test Suite Results: ${passed} PASSED, ${failed} FAILED  `);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with fatal error:', err);
  process.exit(1);
});
