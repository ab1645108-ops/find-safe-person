import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Router, Request, Response, NextFunction } from "express";
import { UserRole, AccountStatus, InvestigatorRequest } from "../src/types";
import { logAudit } from "./audit";
import { db } from "./db";
import {
  ADMIN_CONFIRMATION_EMAIL,
  createAdminConfirmationSession,
  verifyAdminConfirmationCode,
  resendAdminConfirmationCode,
} from "./emailService";

export interface UserEntity {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
  last_login: string | null;
  badgeNumber?: string;
  agency?: string;
  organization?: string;
  phone?: string;
}

// -------------------------------------------------------------
// Cryptographic Password Hashing & Verification (PBKDF2-SHA512)
// -------------------------------------------------------------
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return `pbkdf2:${iterations}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(":");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const originalHash = parts[3];
    const testHash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(testHash, "hex"), Buffer.from(originalHash, "hex"));
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// JWT Token Generator & Verifier (HMAC-SHA256)
// -------------------------------------------------------------
function getSecret(): string {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || "findsafe_secure_session_secret_key_2026";
}

export function generateToken(payload: { userId: string; email: string; role: UserRole }): string {
  const secret = getSecret();
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 86400 * 3; // 3-day validity
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): { userId: string; email: string; role: UserRole; exp: number } | null {
  try {
    const secret = getSecret();
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSignature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
    if (signature !== expectedSignature) return null;
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null; // Token expired
    }
    return decoded;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// User In-Memory Database with Default Seed Accounts
// -------------------------------------------------------------
const USERS_DB: Map<string, UserEntity> = new Map();

function seedUsers() {
  const initialUsers: UserEntity[] = [
    {
      id: "usr_admin_1",
      name: "Admin",
      email: "admin@findsafe.ai",
      password_hash: hashPassword("Admin@1234"),
      role: "ADMIN",
      status: "active",
      badgeNumber: "ADM-010",
      agency: "Operations & Dispatch Command",
      created_at: "2026-09-01T08:00:00Z",
      updated_at: "2026-09-20T12:00:00Z",
      last_login: "2026-09-25T19:30:00Z",
      phone: "+1 (530) 555-0199",
    },
    {
      id: "usr_investigator_1",
      name: "Investigator",
      email: "investigator@findsafe.ai",
      password_hash: hashPassword("Investigator@1234"),
      role: "INVESTIGATOR",
      status: "active",
      badgeNumber: "INV-4108",
      agency: "Special Investigations Unit",
      created_at: "2026-09-05T09:30:00Z",
      updated_at: "2026-09-21T10:15:00Z",
      last_login: "2026-09-25T20:10:00Z",
      phone: "+1 (916) 555-0142",
    },
    {
      id: "usr_citizen_1",
      name: "Public User",
      email: "citizen@findsafe.ai",
      password_hash: hashPassword("Citizen@1234"),
      role: "CITIZEN",
      status: "active",
      organization: "Community Reporting Desk",
      created_at: "2026-09-10T14:20:00Z",
      updated_at: "2026-09-22T11:00:00Z",
      last_login: "2026-09-25T18:45:00Z",
      phone: "+1 (916) 555-0188",
    },
  ];

  const existingDbUsers = db.getUsers();
  for (const user of initialUsers) {
    USERS_DB.set(user.id, user);
    if (!existingDbUsers.some((u: any) => u.id === user.id || (u.email && u.email.toLowerCase() === user.email.toLowerCase()))) {
      db.saveUser(user);
    }
  }

  // Restore all registered accounts from permanent database storage
  for (const dbUser of existingDbUsers) {
    USERS_DB.set(dbUser.id, dbUser);
  }

  // Do not auto-seed dummy investigator requests so that 0 requests are shown when no one has requested access.
  const existingReqs = db.getInvestigatorRequests();
}

seedUsers();

export function sanitizeUser(user: UserEntity): Omit<UserEntity, "password_hash"> {
  const { password_hash, ...safe } = user;
  return safe;
}

export function findUserByEmail(email: string): UserEntity | undefined {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  for (const user of USERS_DB.values()) {
    if (user.email && user.email.trim().toLowerCase() === normalized) {
      return user;
    }
  }
  const dbUser = db.getUserByEmail(normalized);
  if (dbUser) {
    USERS_DB.set(dbUser.id, dbUser);
    return dbUser;
  }
  return undefined;
}

export function findUserById(id: string): UserEntity | undefined {
  if (!id) return undefined;
  const memUser = USERS_DB.get(id);
  if (memUser) return memUser;
  const dbUser = db.getUserById(id);
  if (dbUser) {
    USERS_DB.set(dbUser.id, dbUser);
    return dbUser;
  }
  return undefined;
}

// -------------------------------------------------------------
// Authentication & Role-Based Middleware
// -------------------------------------------------------------
export function extractAuthUser(req: Request): UserEntity | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded && decoded.userId) {
      const user = findUserById(decoded.userId);
      if (user) return user;
    }
  }

  // Fallback to explicit user ID header only if account genuinely exists
  const legacyUserId = req.headers["x-user-id"] as string;
  if (legacyUserId) {
    const user = findUserById(legacyUserId);
    if (user) return user;
  }

  return null;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const user = extractAuthUser(req);
  if (!user) {
    return res.status(401).json({
      error: "Unauthorized: Valid authentication session is required.",
      code: "UNAUTHORIZED",
    });
  }
  if (user.status !== "active") {
    return res.status(403).json({
      error: `Your account is ${user.status}. Please contact an administrator.`,
      code: "ACCOUNT_INACTIVE",
    });
  }
  (req as any).user = sanitizeUser(user);
  (req as any).rawUser = user;
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = extractAuthUser(req);
    if (!user) {
      logAudit(
        { id: "usr_guest", name: "Unauthenticated Request", role: "CITIZEN" },
        "UNAUTHORIZED_ACCESS",
        req.baseUrl + req.path,
        undefined,
        "FORBIDDEN",
        `Access to ${req.method} ${req.originalUrl} rejected: missing or invalid session token.`,
        req
      );
      return res.status(401).json({
        error: "Unauthorized: Please log in to access this resource.",
        code: "UNAUTHORIZED",
      });
    }

    if (user.status !== "active") {
      logAudit(
        { id: user.id, name: user.name, role: user.role },
        "UNAUTHORIZED_ACCESS",
        req.baseUrl + req.path,
        user.id,
        "FORBIDDEN",
        `Access blocked: User account status is ${user.status}.`,
        req
      );
      return res.status(403).json({
        error: `Your account is ${user.status}. Please contact an administrator.`,
        code: "ACCOUNT_INACTIVE",
      });
    }

    // Role check: treat PUBLIC_USER and CITIZEN as interchangeable citizen roles
    const normalizedUserRole = user.role === "PUBLIC_USER" ? "CITIZEN" : user.role;
    const isAuthorized = allowedRoles.some((r) => {
      const normalizedReqRole = r === "PUBLIC_USER" ? "CITIZEN" : r;
      return normalizedReqRole === normalizedUserRole;
    });

    if (!isAuthorized) {
      logAudit(
        { id: user.id, name: user.name, role: user.role },
        "UNAUTHORIZED_ACCESS",
        req.baseUrl + req.path,
        user.id,
        "FORBIDDEN",
        `Access to ${req.method} ${req.originalUrl} blocked: Requires [${allowedRoles.join(", ")}], but user holds role [${user.role}].`,
        req
      );
      return res.status(403).json({
        error: "Forbidden: You do not have permission to access this page or perform this action.",
        code: "FORBIDDEN",
        requiredRoles: allowedRoles,
        currentRole: user.role,
      });
    }

    (req as any).user = sanitizeUser(user);
    (req as any).rawUser = user;
    next();
  };
}

// -------------------------------------------------------------
// Authentication & User Management Express Router
// -------------------------------------------------------------
export function setupAuthRouter(): Router {
  const router = Router();

  // -----------------------------------------------------------
  // 1. User Registration Flow
  // -----------------------------------------------------------
  router.post("/auth/register", (req: Request, res: Response) => {
    try {
      const { name, email, password, confirmPassword } = req.body;

      // Input Validation
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required." });
      }

      const trimmedName = name.trim();
      const trimmedEmail = email.trim().toLowerCase();

      if (trimmedName.length < 2) {
        return res.status(400).json({ error: "Name must be at least 2 characters long." });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ error: "Please enter a valid email address." });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long." });
      }

      if (confirmPassword && password !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match." });
      }

      // Check if email already exists
      if (findUserByEmail(trimmedEmail)) {
        return res.status(409).json({ error: "An account with this email address already exists." });
      }

      // Hash password and assign default CITIZEN role
      const password_hash = hashPassword(password);
      const now = new Date().toISOString();
      const newUser: UserEntity = {
        id: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: trimmedName,
        email: trimmedEmail,
        password_hash,
        role: "CITIZEN",
        status: "active",
        created_at: now,
        updated_at: now,
        last_login: null,
      };

      USERS_DB.set(newUser.id, newUser);
      db.saveUser(newUser);

      // Data Migration: Associate any previously registered cases under this email with the new permanent user account
      const allCases = db.getAllCases({ includeDeleted: true });
      for (const c of allCases) {
        if (c.reportedByUserEmail && c.reportedByUserEmail.toLowerCase() === trimmedEmail) {
          if (!c.reportedByUserId || c.reportedByUserId === 'usr_reporter' || c.reportedByUserId === 'usr_public_1' || c.reportedByUserId === 'usr_citizen') {
            db.updateCase(
              c.id,
              { reportedByUserId: newUser.id, reportedByName: newUser.name },
              { id: newUser.id, name: newUser.name, role: 'CITIZEN' },
              req
            );
          }
        }
      }

      logAudit(
        { id: newUser.id, name: newUser.name, role: newUser.role },
        "USER_REGISTERED",
        "User",
        newUser.id,
        "SUCCESS",
        `New citizen account registered: ${newUser.name} (${newUser.email}). Default role CITIZEN assigned.`,
        req
      );

      const token = generateToken({
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role,
      });

      res.status(201).json({
        success: true,
        message: "Registration successful. Welcome to FindSafe.",
        token,
        user: sanitizeUser(newUser),
      });
    } catch (err: any) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Failed to complete registration." });
    }
  });

  // -----------------------------------------------------------
  // 1B. Investigator Access Request Submission
  // -----------------------------------------------------------
  router.post("/auth/investigator-request", (req: Request, res: Response) => {
    try {
      const {
        name,
        email,
        phone,
        organization,
        investigatorId,
        password,
        confirmPassword,
        additionalInfo,
      } = req.body;

      if (!name || !email || !phone || !organization || !password) {
        return res.status(400).json({
          error: "Full Name, Email, Phone Number, Organization/Department, and Password are required.",
        });
      }

      const trimmedName = name.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPhone = phone.trim();
      const trimmedOrg = organization.trim();
      const trimmedInvId = investigatorId ? investigatorId.trim() : "";

      if (trimmedName.length < 2) {
        return res.status(400).json({ error: "Name must be at least 2 characters long." });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ error: "Please enter a valid email address." });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long." });
      }

      if (confirmPassword && password !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match. Please verify your password confirmation." });
      }

      // Check if email already registered in system
      if (findUserByEmail(trimmedEmail)) {
        return res.status(409).json({ error: "An account or request with this email address already exists." });
      }

      const now = new Date().toISOString();
      const password_hash = hashPassword(password);
      const userId = `usr_inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const newUser: UserEntity = {
        id: userId,
        name: trimmedName,
        email: trimmedEmail,
        password_hash,
        role: "INVESTIGATOR",
        status: "PENDING_APPROVAL",
        badgeNumber: trimmedInvId || undefined,
        agency: trimmedOrg,
        organization: trimmedOrg,
        phone: trimmedPhone,
        created_at: now,
        updated_at: now,
        last_login: null,
      };

      const requestId = `REQ-INV-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
      const newRequest: InvestigatorRequest = {
        id: requestId,
        userId: newUser.id,
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        organization: trimmedOrg,
        investigatorId: trimmedInvId || undefined,
        additionalInfo: additionalInfo ? additionalInfo.trim() : "",
        status: "PENDING",
        requestDate: now,
      };

      USERS_DB.set(newUser.id, newUser);
      db.saveUser(newUser);
      db.saveInvestigatorRequest(newRequest);

      // System notification for Admin
      db.addAlert({
        id: `ALT-REQ-${Date.now().toString().slice(-5)}`,
        type: "CASE_UPDATE",
        severity: "HIGH",
        title: "New Investigator Access Request",
        message: `New Investigator access request received from ${trimmedName}. Please review the request.`,
        timestamp: now,
        isRead: false,
        broadcastChannels: ["Admin Portal Badge", "Dispatch Supervisor Queue"],
        targetAudience: "INVESTIGATORS",
      });

      // Audit Log
      logAudit(
        { id: newUser.id, name: newUser.name, role: "INVESTIGATOR" },
        "INVESTIGATOR_REQUEST_CREATED",
        "InvestigatorRequest",
        newRequest.id,
        "SUCCESS",
        `New Investigator access request submitted by ${newUser.name} (${newUser.email}) from ${trimmedOrg}. Request ID: ${newRequest.id}. Status: PENDING. Waiting for Admin approval.`,
        req
      );

      res.status(201).json({
        success: true,
        requestId: newRequest.id,
        status: "PENDING",
        message: "Your Investigator access request has been submitted and is waiting for Admin approval.",
      });
    } catch (err: any) {
      console.error("Investigator request error:", err);
      res.status(500).json({ error: "Failed to submit investigator access request." });
    }
  });

  // -----------------------------------------------------------
  // 1C. Check Investigator Request Status by Email
  // -----------------------------------------------------------
  router.get("/auth/investigator-requests/status", (req: Request, res: Response) => {
    try {
      const { email } = req.query;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email query parameter is required." });
      }
      const invReq = db.getInvestigatorRequestByEmail(email);
      if (!invReq) {
        return res.json({ status: "NOT_FOUND" });
      }
      res.json({
        status: invReq.status,
        requestId: invReq.id,
        name: invReq.name,
        email: invReq.email,
        organization: invReq.organization,
        requestDate: invReq.requestDate,
        rejectionReason: invReq.rejectionReason,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to query investigator request status." });
    }
  });

  // -----------------------------------------------------------
  // 1D. Forgot Password (Request Reset Token)
  // -----------------------------------------------------------
  router.post("/auth/forgot-password", (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email address is required." });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = findUserByEmail(normalizedEmail);
      let resetToken: string | undefined = undefined;

      if (user) {
        // Secure single-use time-limited token (1 hour)
        resetToken = crypto.randomBytes(24).toString("hex");
        const expiresAt = Date.now() + 60 * 60 * 1000;
        db.savePasswordResetToken(resetToken, user.id, user.email, expiresAt);

        logAudit(
          { id: user.id, name: user.name, role: user.role },
          "PASSWORD_RESET_REQUESTED",
          "User",
          user.id,
          "SUCCESS",
          `Password reset token generated for ${user.email}. Valid for 60 minutes.`,
          req
        );
      } else {
        logAudit(
          { id: "unknown", name: normalizedEmail, role: "CITIZEN" },
          "PASSWORD_RESET_REQUESTED",
          "User",
          undefined,
          "FAILED",
          `Password reset requested for non-existent email ${normalizedEmail}. Safe generic response returned.`,
          req
        );
      }

      // Security best practice: Safe generic response without disclosing email existence
      res.json({
        success: true,
        message: "If this email is registered in our system, a password reset token has been generated.",
        resetToken, // Provided for user convenience and automated testing
      });
    } catch (err: any) {
      console.error("Forgot password error:", err);
      res.status(500).json({ error: "Failed to process password recovery request." });
    }
  });

  // -----------------------------------------------------------
  // 1E. Reset Password (Submit Token & New Password)
  // -----------------------------------------------------------
  router.post("/auth/reset-password", (req: Request, res: Response) => {
    try {
      const { token, newPassword, confirmPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ error: "Reset token and new password are required." });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters long." });
      }

      if (confirmPassword && newPassword !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match." });
      }

      const tokenRecord = db.getPasswordResetToken(token.trim());
      if (!tokenRecord || tokenRecord.used) {
        return res.status(400).json({ error: "Invalid or already used password reset token." });
      }

      if (Date.now() > tokenRecord.expires_at) {
        return res.status(400).json({ error: "Password reset token has expired. Please request a new one." });
      }

      const user = findUserById(tokenRecord.user_id) || findUserByEmail(tokenRecord.email);
      if (!user) {
        return res.status(404).json({ error: "Associated user account not found." });
      }

      // Update password hash
      const newHash = hashPassword(newPassword);
      user.password_hash = newHash;
      user.updated_at = new Date().toISOString();

      USERS_DB.set(user.id, user);
      db.saveUser(user);
      db.markPasswordResetTokenUsed(tokenRecord.token);

      logAudit(
        { id: user.id, name: user.name, role: user.role },
        "PASSWORD_RESET_COMPLETED",
        "User",
        user.id,
        "SUCCESS",
        `Password reset successfully completed for ${user.email}. Token invalidated.`,
        req
      );

      res.json({
        success: true,
        message: "Password reset successfully. You can now log in with your new credentials.",
      });
    } catch (err: any) {
      console.error("Reset password error:", err);
      res.status(500).json({ error: "Failed to reset password." });
    }
  });

  // -----------------------------------------------------------
  // 2. User Login Flow
  // -----------------------------------------------------------
  router.post("/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, expectedRole } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
      }

      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "127.0.0.1";
      const normalizedEmail = email.trim().toLowerCase();
      const lockKey = `${clientIp}:${normalizedEmail}`;

      const user = findUserByEmail(normalizedEmail);

      // Secure generic failure message if user doesn't exist
      if (!user) {
        const attempt = db.recordFailedAttempt(lockKey);
        // Progressive delay to stop rapid automated credential stuffing without locking human users out
        if (attempt.failedAttempts >= 5) {
          const delayMs = Math.min(1000, (attempt.failedAttempts - 4) * 150);
          await new Promise((r) => setTimeout(r, delayMs));
        }
        logAudit(
          { id: "unknown", name: normalizedEmail, role: (expectedRole as UserRole) || "CITIZEN" },
          expectedRole === "INVESTIGATOR" ? "INVESTIGATOR_LOGIN_DENIED" : "LOGIN_FAILED",
          "Session",
          undefined,
          "FAILED",
          `Failed login attempt: Account for ${normalizedEmail} not found from IP ${clientIp}.`,
          req
        );
        return res.status(401).json({
          error: "Invalid email or password.",
          code: "INVALID_CREDENTIALS",
        });
      }

      // Verify password hash
      const isValid = verifyPassword(password, user.password_hash);
      if (!isValid) {
        const attempt = db.recordFailedAttempt(lockKey);
        if (attempt.failedAttempts >= 5) {
          const delayMs = Math.min(1000, (attempt.failedAttempts - 4) * 150);
          await new Promise((r) => setTimeout(r, delayMs));
        }
        logAudit(
          { id: user.id, name: user.name, role: user.role },
          user.role === "INVESTIGATOR" ? "INVESTIGATOR_LOGIN_DENIED" : "LOGIN_FAILED",
          "Session",
          user.id,
          "FAILED",
          `Failed login attempt for ${user.email}: Incorrect password from IP ${clientIp}.`,
          req
        );
        return res.status(401).json({
          error: "Invalid email or password.",
          code: "INVALID_CREDENTIALS",
        });
      }

      // Successful password check - reset rate limiting shield
      db.resetRateLimit(lockKey);

      // Role check for expected portal if specified
      if (expectedRole) {
        const normalizedUserRole = user.role === "PUBLIC_USER" ? "CITIZEN" : user.role;
        const normalizedExpectedRole = expectedRole === "PUBLIC_USER" ? "CITIZEN" : expectedRole;

        if (normalizedExpectedRole !== normalizedUserRole && !(normalizedExpectedRole === "INVESTIGATOR" && user.role === "ADMIN")) {
          if (expectedRole === "ADMIN" && user.role !== "ADMIN") {
            logAudit(
              { id: user.id, name: user.name, role: user.role },
              "UNAUTHORIZED_ACCESS",
              "AdminPortal",
              user.id,
              "FORBIDDEN",
              `Blocked non-admin user ${user.email} from administrator login.`,
              req
            );
            return res.status(403).json({
              error: "Forbidden: This account does not have Administrator privileges.",
              code: "FORBIDDEN_ROLE",
            });
          }

          if (expectedRole === "INVESTIGATOR" && user.role === "CITIZEN") {
            logAudit(
              { id: user.id, name: user.name, role: user.role },
              "INVESTIGATOR_LOGIN_DENIED",
              "Session",
              user.id,
              "FORBIDDEN",
              `Citizen account ${user.email} attempted login via Investigator portal.`,
              req
            );
            return res.status(403).json({
              error: "Access Denied: This account is registered as a Public Citizen. Please use the Public Citizen portal to log in.",
              code: "ROLE_MISMATCH",
            });
          }

          if (expectedRole === "CITIZEN" && user.role === "INVESTIGATOR") {
            logAudit(
              { id: user.id, name: user.name, role: user.role },
              "LOGIN_FAILED",
              "Session",
              user.id,
              "FORBIDDEN",
              `Investigator account ${user.email} attempted login via Public Citizen portal.`,
              req
            );
            return res.status(403).json({
              error: "This account is registered as an Investigator. Please use the Investigator portal to log in.",
              code: "ROLE_MISMATCH",
            });
          }
        }
      }

      // Strict INVESTIGATOR Role & Status verification
      if (user.role === "INVESTIGATOR") {
        if (user.status === "PENDING_APPROVAL" || (user.status as string) === "pending") {
          logAudit(
            { id: user.id, name: user.name, role: user.role },
            "INVESTIGATOR_LOGIN_DENIED",
            "Session",
            user.id,
            "FORBIDDEN",
            `Investigator login denied for ${user.email}: Request status is PENDING admin approval.`,
            req
          );
          return res.status(403).json({
            error: "Your Investigator account is pending Admin approval. You cannot access the Investigator portal until your request is approved.",
            code: "INVESTIGATOR_PENDING",
            status: "PENDING_APPROVAL",
          });
        }

        if (user.status === "REJECTED" || (user.status as string) === "rejected") {
          const invReq = db.getInvestigatorRequestByUserId(user.id) || db.getInvestigatorRequestByEmail(user.email);
          const reason = invReq?.rejectionReason;
          logAudit(
            { id: user.id, name: user.name, role: user.role },
            "INVESTIGATOR_LOGIN_DENIED",
            "Session",
            user.id,
            "FORBIDDEN",
            `Investigator login denied for ${user.email}: Request was REJECTED by Admin.${reason ? ` Reason: ${reason}` : ""}`,
            req
          );
          return res.status(403).json({
            error: "Your Investigator access request has been rejected.",
            rejectionReason: reason || "Invalid investigator information or credentials.",
            code: "INVESTIGATOR_REJECTED",
            status: "REJECTED",
          });
        }

        if (user.status === "suspended" || (user.status as string) === "SUSPENDED") {
          const invReq = db.getInvestigatorRequestByUserId(user.id) || db.getInvestigatorRequestByEmail(user.email);
          logAudit(
            { id: user.id, name: user.name, role: user.role },
            "INVESTIGATOR_LOGIN_DENIED",
            "Session",
            user.id,
            "FORBIDDEN",
            `Investigator login denied for ${user.email}: Access suspended or revoked.`,
            req
          );
          return res.status(403).json({
            error: "Your Investigator access has been suspended or revoked. Please contact the administrator.",
            rejectionReason: invReq?.revocationReason,
            code: "INVESTIGATOR_SUSPENDED",
            status: "SUSPENDED",
          });
        }

        if (user.status !== "active" && (user.status as string) !== "ACTIVE") {
          logAudit(
            { id: user.id, name: user.name, role: user.role },
            "INVESTIGATOR_LOGIN_DENIED",
            "Session",
            user.id,
            "FORBIDDEN",
            `Investigator login denied for ${user.email}: Account status is ${user.status}.`,
            req
          );
          return res.status(403).json({
            error: `Your Investigator account is ${user.status}. Please contact an administrator.`,
            code: "ACCOUNT_INACTIVE",
          });
        }

        // Investigator is APPROVED / ACTIVE
        logAudit(
          { id: user.id, name: user.name, role: user.role },
          "INVESTIGATOR_LOGIN_SUCCESS",
          "Session",
          user.id,
          "SUCCESS",
          `Investigator ${user.name} logged in successfully. Access to Investigator portal granted.`,
          req
        );
      } else {
        // Non-investigator status check
        if (user.status !== "active" && (user.status as string) !== "ACTIVE") {
          logAudit(
            { id: user.id, name: user.name, role: user.role },
            "LOGIN_FAILED",
            "Session",
            user.id,
            "FORBIDDEN",
            `Login rejected for ${user.email}: Account status is ${user.status}.`,
            req
          );
          return res.status(403).json({
            error: `Your account is ${user.status}. Please contact an administrator.`,
            code: "ACCOUNT_INACTIVE",
          });
        }

        logAudit(
          { id: user.id, name: user.name, role: user.role },
          "LOGIN_SUCCESS",
          "Session",
          user.id,
          "SUCCESS",
          `User logged in successfully: ${user.name} (${user.role}).`,
          req
        );
      }

      // Every single admin login sends a confirmation code to ab1645108@gmail.com
      if (user.role === "ADMIN") {
        const adminSession = await createAdminConfirmationSession(user, clientIp);

        logAudit(
          { id: user.id, name: user.name, role: user.role },
          "ADMIN_LOGIN_2FA_REQUIRED",
          "Session",
          user.id,
          "SUCCESS",
          `Admin credentials verified for ${user.email}. Single-use confirmation code dispatched to ${adminSession.destinationEmail}.`,
          req
        );

        return res.json({
          success: true,
          requiresAdmin2FA: true,
          pendingToken: adminSession.pendingToken,
          destinationEmail: adminSession.destinationEmail,
          maskedEmail: adminSession.maskedEmail,
          expiresInSeconds: adminSession.expiresInSeconds,
          devVerificationHint: adminSession.simulated || process.env.NODE_ENV !== "production" ? adminSession.code : undefined,
          message: `A security confirmation code has been dispatched to ${adminSession.destinationEmail}. Please enter the 6-digit code to complete Administrator login.`,
        });
      }

      // Update last_login
      const now = new Date().toISOString();
      user.last_login = now;
      user.updated_at = now;
      db.saveUser(user);

      // Generate JWT token
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.json({
        success: true,
        token,
        user: sanitizeUser(user),
      });
    } catch (err: any) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Authentication service error." });
    }
  });

  // -----------------------------------------------------------
  // 2b. Verify Administrator Login Confirmation Code
  // -----------------------------------------------------------
  router.post("/auth/admin/verify-code", (req: Request, res: Response) => {
    try {
      const { pendingToken, code } = req.body;
      const clientIp = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "127.0.0.1";

      if (!pendingToken || !code) {
        return res.status(400).json({ error: "Pending session token and confirmation code are required." });
      }

      const verifyResult = verifyAdminConfirmationCode(pendingToken, String(code));

      if (!verifyResult.success || !verifyResult.user) {
        logAudit(
          { id: "usr_admin_pending", name: "Administrator Attempt", role: "ADMIN" },
          "ADMIN_2FA_FAILED",
          "Session",
          pendingToken,
          "FAILED",
          `Failed admin confirmation code entry: ${verifyResult.error} (IP: ${clientIp})`,
          req
        );
        return res.status(401).json({
          error: verifyResult.error || "Invalid or expired confirmation code.",
          codeExpired: verifyResult.codeExpired,
          attemptsRemaining: verifyResult.attemptsRemaining,
        });
      }

      const user = verifyResult.user;

      // Update last_login
      const now = new Date().toISOString();
      user.last_login = now;
      user.updated_at = now;
      db.saveUser(user);

      logAudit(
        { id: user.id, name: user.name, role: user.role },
        "ADMIN_LOGIN_SUCCESS",
        "Session",
        user.id,
        "SUCCESS",
        `Administrator ${user.name} successfully verified confirmation code sent to ${ADMIN_CONFIRMATION_EMAIL}. Terminal session granted.`,
        req
      );

      // Generate JWT token
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.json({
        success: true,
        token,
        user: sanitizeUser(user),
      });
    } catch (err: any) {
      console.error("Admin 2FA verify error:", err);
      res.status(500).json({ error: "Security verification service error." });
    }
  });

  // -----------------------------------------------------------
  // 2c. Resend Administrator Login Confirmation Code
  // -----------------------------------------------------------
  router.post("/auth/admin/resend-code", async (req: Request, res: Response) => {
    try {
      const { pendingToken } = req.body;
      const clientIp = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "127.0.0.1";

      if (!pendingToken) {
        return res.status(400).json({ error: "Pending session token is required." });
      }

      const resendResult = await resendAdminConfirmationCode(pendingToken, clientIp);
      if (!resendResult.success) {
        return res.status(400).json({ error: resendResult.error || "Failed to resend confirmation code." });
      }

      logAudit(
        { id: "usr_admin_pending", name: "Administrator", role: "ADMIN" },
        "ADMIN_2FA_RESENT",
        "Session",
        pendingToken,
        "SUCCESS",
        `Admin confirmation code resent to ${ADMIN_CONFIRMATION_EMAIL}.`,
        req
      );

      res.json({
        success: true,
        destinationEmail: resendResult.destinationEmail,
        maskedEmail: resendResult.maskedEmail,
        devVerificationHint: resendResult.simulated || process.env.NODE_ENV !== "production" ? resendResult.code : undefined,
        message: `A fresh confirmation code has been dispatched to ${ADMIN_CONFIRMATION_EMAIL}.`,
      });
    } catch (err: any) {
      console.error("Admin 2FA resend error:", err);
      res.status(500).json({ error: "Security dispatch service error." });
    }
  });

  // -----------------------------------------------------------
  // 3. User Logout Flow
  // -----------------------------------------------------------
  router.post("/auth/logout", (req: Request, res: Response) => {
    const user = extractAuthUser(req);
    if (user) {
      logAudit(
        { id: user.id, name: user.name, role: user.role },
        "LOGOUT",
        "Session",
        user.id,
        "SUCCESS",
        `User logged out: ${user.name}.`,
        req
      );
    }
    res.json({ success: true, message: "Logged out successfully." });
  });

  // -----------------------------------------------------------
  // 4. Current User Session Check (/auth/me)
  // -----------------------------------------------------------
  router.get("/auth/me", authenticate, (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({ user });
  });

  // -----------------------------------------------------------
  // 5. Update Own Profile (/auth/profile)
  // -----------------------------------------------------------
  router.put("/auth/profile", authenticate, (req: Request, res: Response) => {
    try {
      const activeUser = (req as any).rawUser as UserEntity;
      const { name, phone, organization, agency, currentPassword, newPassword } = req.body;

      if (name && name.trim().length >= 2) {
        activeUser.name = name.trim();
      }
      if (phone !== undefined) activeUser.phone = phone.trim();
      if (organization !== undefined) activeUser.organization = organization.trim();
      if (agency !== undefined && activeUser.role !== "CITIZEN") {
        activeUser.agency = agency.trim();
      }

      // Password change if requested
      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ error: "Current password is required to set a new password." });
        }
        if (!verifyPassword(currentPassword, activeUser.password_hash)) {
          return res.status(400).json({ error: "Current password is incorrect." });
        }
        if (newPassword.length < 8) {
          return res.status(400).json({ error: "New password must be at least 8 characters long." });
        }
        activeUser.password_hash = hashPassword(newPassword);
      }

      activeUser.updated_at = new Date().toISOString();

      logAudit(
        { id: activeUser.id, name: activeUser.name, role: activeUser.role },
        "PROFILE_UPDATED",
        "User",
        activeUser.id,
        "SUCCESS",
        `User profile updated for ${activeUser.name}.`,
        req
      );

      res.json({
        success: true,
        message: "Profile updated successfully.",
        user: sanitizeUser(activeUser),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update profile." });
    }
  });

  // ===========================================================
  // ADMIN USER MANAGEMENT ENDPOINTS
  // ===========================================================

  // 6. List all users with search, role, and status filtering
  router.get("/admin/users", requireRole(["ADMIN"]), (req: Request, res: Response) => {
    try {
      const { search, role, status } = req.query;
      let users = Array.from(USERS_DB.values()).map(sanitizeUser);

      if (search && typeof search === "string") {
        const query = search.toLowerCase();
        users = users.filter(
          (u) =>
            u.name.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query) ||
            (u.badgeNumber && u.badgeNumber.toLowerCase().includes(query)) ||
            (u.agency && u.agency.toLowerCase().includes(query))
        );
      }

      if (role && typeof role === "string" && role !== "ALL") {
        users = users.filter((u) => u.role === role);
      }

      if (status && typeof status === "string" && status !== "ALL") {
        users = users.filter((u) => u.status === status);
      }

      // Sort by newest first
      users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      res.json({ users, total: users.length });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to retrieve user list." });
    }
  });

  // 7. Update User Role
  router.put("/admin/users/:id/role", requireRole(["ADMIN"]), (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const actor = (req as any).user;
      const target = USERS_DB.get(id);

      if (!target) {
        return res.status(404).json({ error: "User not found." });
      }

      const validRoles: UserRole[] = ["CITIZEN", "PUBLIC_USER", "INVESTIGATOR", "ADMIN"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role specified: ${role}` });
      }

      // Protect against demoting the last active administrator
      if (target.id === actor.id && role !== "ADMIN") {
        return res.status(400).json({ error: "You cannot demote your own administrator account." });
      }

      const prevRole = target.role;
      target.role = role === "PUBLIC_USER" ? "CITIZEN" : role;
      target.updated_at = new Date().toISOString();
      db.saveUser(target);

      logAudit(
        actor,
        "ROLE_CHANGED",
        "User",
        target.id,
        "SUCCESS",
        `Changed role for user ${target.name} (${target.email}) from ${prevRole} to ${target.role}.`,
        req
      );

      res.json({
        success: true,
        message: `Role successfully updated to ${target.role}.`,
        user: sanitizeUser(target),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update role." });
    }
  });

  // 8. Update User Status (Activate, Deactivate, Suspend)
  router.put("/admin/users/:id/status", requireRole(["ADMIN"]), (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const actor = (req as any).user;
      const target = USERS_DB.get(id);

      if (!target) {
        return res.status(404).json({ error: "User not found." });
      }

      if (!["active", "inactive", "suspended"].includes(status)) {
        return res.status(400).json({ error: "Status must be active, inactive, or suspended." });
      }

      // Prevent administrator from deactivating themselves
      if (target.id === actor.id && status !== "active") {
        return res.status(400).json({ error: "You cannot deactivate or suspend your own administrator account." });
      }

      const prevStatus = target.status;
      target.status = status;
      target.updated_at = new Date().toISOString();
      db.saveUser(target);

      const action = status === "active" ? "ACCOUNT_ACTIVATED" : "ACCOUNT_DEACTIVATED";

      logAudit(
        actor,
        action,
        "User",
        target.id,
        "SUCCESS",
        `Admin ${actor.name} changed account status for ${target.name} from ${prevStatus} to ${status}.`,
        req
      );

      res.json({
        success: true,
        message: `Account status updated to ${status}.`,
        user: sanitizeUser(target),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update account status." });
    }
  });

  // 9. Admin edit user details
  router.put("/admin/users/:id", requireRole(["ADMIN"]), (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, email, badgeNumber, agency, organization, phone } = req.body;
      const actor = (req as any).user;
      const target = USERS_DB.get(id);

      if (!target) {
        return res.status(404).json({ error: "User not found." });
      }

      if (name) target.name = name.trim();
      if (email) target.email = email.trim().toLowerCase();
      if (badgeNumber !== undefined) target.badgeNumber = badgeNumber.trim();
      if (agency !== undefined) target.agency = agency.trim();
      if (organization !== undefined) target.organization = organization.trim();
      if (phone !== undefined) target.phone = phone.trim();

      target.updated_at = new Date().toISOString();

      logAudit(
        actor,
        "USER_PROFILE_ADMIN_EDITED",
        "User",
        target.id,
        "SUCCESS",
        `Admin ${actor.name} edited details for user ${target.name} (${target.id}).`,
        req
      );

      res.json({
        success: true,
        message: "User details updated successfully.",
        user: sanitizeUser(target),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update user." });
    }
  });

  // 9b. Delete user account
  router.delete("/admin/users/:id", requireRole(["ADMIN"]), (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const actor = (req as any).user;

      if (id === actor.id) {
        return res.status(400).json({ error: "Cannot delete your own active administrator account." });
      }

      const target = USERS_DB.get(id) || db.getUserById(id);
      if (!target) {
        return res.status(404).json({ error: "User not found." });
      }

      USERS_DB.delete(id);
      db.deleteUser(id);

      if (target.email) {
        const existingReq = db.getInvestigatorRequestByEmail(target.email);
        if (existingReq) {
          db.deleteInvestigatorRequest(existingReq.id);
        }
      }

      logAudit(
        actor,
        "USER_DELETED",
        "User",
        id,
        "SUCCESS",
        `Admin ${actor.name} deleted user ${target.name} (${target.email}, role: ${target.role}).`,
        req
      );

      res.json({ success: true, message: `User account for ${target.name} permanently deleted.` });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete user account." });
    }
  });

  // ===========================================================
  // ADMIN INVESTIGATOR ACCESS REQUESTS MANAGEMENT
  // ===========================================================

  // 10. List Investigator Access Requests
  router.get("/admin/investigator-requests", requireRole(["ADMIN"]), (req: Request, res: Response) => {
    try {
      const { status } = req.query;
      const actor = (req as any).user;
      const allRequests = db.getInvestigatorRequests();
      let filtered = allRequests;
      if (status && typeof status === "string" && status !== "ALL") {
        filtered = filtered.filter((r) => r.status === status);
      }
      const pendingCount = allRequests.filter((r) => r.status === "PENDING").length;

      logAudit(
        actor,
        "INVESTIGATOR_REQUEST_VIEWED",
        "InvestigatorRequest",
        undefined,
        "SUCCESS",
        `Admin ${actor.name} reviewed investigator access requests queue (${pendingCount} pending).`,
        req
      );

      res.json({
        requests: filtered,
        pendingCount,
        total: allRequests.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to retrieve investigator access requests." });
    }
  });

  // 11. Approve Investigator Access Request
  router.post("/admin/investigator-requests/:id/approve", requireRole(["ADMIN"]), (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const actor = (req as any).user;
      const request = db.getInvestigatorRequestById(id);

      if (!request) {
        return res.status(404).json({ error: "Investigator request not found." });
      }

      const now = new Date().toISOString();
      const updatedReq = db.updateInvestigatorRequest(id, {
        status: "APPROVED",
        approvedDate: now,
        approvedBy: actor.id,
        approvedByName: actor.name,
      });

      // Update target user account in database & memory
      const user = USERS_DB.get(request.userId) || findUserByEmail(request.email);
      if (user) {
        user.status = "active";
        user.role = "INVESTIGATOR";
        user.updated_at = now;
        USERS_DB.set(user.id, user);
        db.saveUser(user);
      }

      // Deliver Notification for Investigator
      db.addAlert({
        id: `ALT-APP-${Date.now().toString().slice(-5)}`,
        type: "CASE_UPDATE",
        severity: "INFO",
        title: "Investigator Request Approved",
        message: "Your Investigator access request has been approved. You can now log in to the Investigator portal.",
        timestamp: now,
        isRead: false,
        broadcastChannels: ["In-App System Notification", "Email Dispatch"],
        targetAudience: "INVESTIGATORS",
      });

      // Log Audit Entry
      logAudit(
        actor,
        "INVESTIGATOR_REQUEST_APPROVED",
        "InvestigatorRequest",
        request.id,
        "SUCCESS",
        `Admin ${actor.name} approved Investigator access request ${request.id} for ${request.name} (${request.email}). Request Status = APPROVED, Account Status = ACTIVE.`,
        req
      );

      res.json({
        success: true,
        message: "Investigator access request approved. Login enabled.",
        request: updatedReq,
      });
    } catch (err: any) {
      console.error("Approve request error:", err);
      res.status(500).json({ error: "Failed to approve investigator request." });
    }
  });

  // 12. Reject Investigator Access Request
  router.post("/admin/investigator-requests/:id/reject", requireRole(["ADMIN"]), (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const actor = (req as any).user;
      const request = db.getInvestigatorRequestById(id);

      if (!request) {
        return res.status(404).json({ error: "Investigator request not found." });
      }

      const now = new Date().toISOString();
      const rejectionReason = reason?.trim() || "Invalid investigator information";

      const updatedReq = db.updateInvestigatorRequest(id, {
        status: "REJECTED",
        rejectedDate: now,
        rejectedBy: actor.id,
        rejectedByName: actor.name,
        rejectionReason,
      });

      // Update target user account in database & memory
      const user = USERS_DB.get(request.userId) || findUserByEmail(request.email);
      if (user) {
        user.status = "REJECTED";
        user.updated_at = now;
        USERS_DB.set(user.id, user);
        db.saveUser(user);
      }

      // Deliver Notification for Investigator
      db.addAlert({
        id: `ALT-REJ-${Date.now().toString().slice(-5)}`,
        type: "CASE_UPDATE",
        severity: "HIGH",
        title: "Investigator Request Rejected",
        message: "Your Investigator access request has been rejected. Please contact the administrator for further information.",
        timestamp: now,
        isRead: false,
        broadcastChannels: ["In-App System Notification", "Email Dispatch"],
        targetAudience: "INVESTIGATORS",
      });

      // Log Audit Entry
      logAudit(
        actor,
        "INVESTIGATOR_REQUEST_REJECTED",
        "InvestigatorRequest",
        request.id,
        "SUCCESS",
        `Admin ${actor.name} rejected Investigator access request ${request.id} for ${request.name} (${request.email}). Reason: ${rejectionReason}. Request Status = REJECTED, Account Status = REJECTED.`,
        req
      );

      res.json({
        success: true,
        message: "Investigator access request rejected.",
        request: updatedReq,
      });
    } catch (err: any) {
      console.error("Reject request error:", err);
      res.status(500).json({ error: "Failed to reject investigator request." });
    }
  });

  // 13. Suspend or Revoke Investigator Access
  router.post("/admin/investigator-requests/:id/revoke", requireRole(["ADMIN"]), (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { reason, actionType } = req.body;
      const actor = (req as any).user;
      
      // Can be request ID or user ID
      let request = db.getInvestigatorRequestById(id);
      if (!request) {
        request = db.getInvestigatorRequestByUserId(id);
      }

      const now = new Date().toISOString();
      const revocationReason = reason?.trim() || "Investigator credentials suspended/revoked by Administrator.";
      const isRevocation = actionType === "revoke";

      let updatedReq = null;
      if (request) {
        updatedReq = db.updateInvestigatorRequest(request.id, {
          status: "CANCELLED",
          revokedDate: now,
          revokedBy: actor.id,
          revokedByName: actor.name,
          revocationReason,
        });
      }

      // Invalidate access & suspend user account
      const targetUserId = request ? request.userId : id;
      const user = USERS_DB.get(targetUserId) || (request ? findUserByEmail(request.email) : undefined);
      if (user) {
        user.status = "suspended";
        user.updated_at = now;
        USERS_DB.set(user.id, user);
        db.saveUser(user);
      }

      const auditAction = isRevocation ? "INVESTIGATOR_ACCESS_REVOKED" : "INVESTIGATOR_ACCESS_SUSPENDED";
      logAudit(
        actor,
        auditAction,
        "InvestigatorRequest",
        request ? request.id : targetUserId,
        "SUCCESS",
        `Admin ${actor.name} ${isRevocation ? "revoked access for" : "suspended"} Investigator ${user ? user.name : id} (${user ? user.email : ''}). Reason: ${revocationReason}. Account status set to SUSPENDED.`,
        req
      );

      res.json({
        success: true,
        message: `Investigator access ${isRevocation ? "revoked" : "suspended"} successfully.`,
        request: updatedReq,
      });
    } catch (err: any) {
      console.error("Revoke access error:", err);
      res.status(500).json({ error: "Failed to suspend/revoke investigator access." });
    }
  });

  // 14. Delete / Remove Investigator Request (especially REJECTED or cancelled requests)
  router.delete("/admin/investigator-requests/:id", requireRole(["ADMIN"]), (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const actor = (req as any).user;

      const request = db.getInvestigatorRequestById(id) || db.getInvestigatorRequestByUserId(id);
      if (!request) {
        return res.status(404).json({ error: "Investigator request not found." });
      }

      db.deleteInvestigatorRequest(request.id);

      // If associated user was in REJECTED state, also clean up the rejected user account
      if (request.userId) {
        const u = USERS_DB.get(request.userId) || db.getUserById(request.userId);
        if (u && (u.status === "REJECTED" || u.status === "inactive")) {
          USERS_DB.delete(u.id);
          db.deleteUser(u.id);
        }
      } else if (request.email) {
        const u = findUserByEmail(request.email);
        if (u && (u.status === "REJECTED" || u.status === "inactive")) {
          USERS_DB.delete(u.id);
          db.deleteUser(u.id);
        }
      }

      logAudit(
        actor,
        "INVESTIGATOR_REQUEST_DELETED",
        "InvestigatorRequest",
        request.id,
        "SUCCESS",
        `Admin ${actor.name} removed investigator request ${request.id} (${request.name}, ${request.email}, status: ${request.status}).`,
        req
      );

      res.json({
        success: true,
        message: `Investigator request ${request.id} (${request.name}) removed successfully.`,
      });
    } catch (err: any) {
      console.error("Delete investigator request error:", err);
      res.status(500).json({ error: "Failed to remove investigator request." });
    }
  });

  // -----------------------------------------------------------
  // 8. Live SQLite Database Status & Integrity Check
  // -----------------------------------------------------------
  router.get("/system/database-info", (_req: Request, res: Response) => {
    try {
      const stats = db.getDbStats();
      res.json({
        success: true,
        stats,
      });
    } catch (err: any) {
      console.error("Database status error:", err);
      res.status(500).json({ error: "Failed to query database statistics." });
    }
  });

  // -----------------------------------------------------------
  // 9. Query Brute-Force Lockout Status
  // -----------------------------------------------------------
  router.get("/auth/lockout-status", (req: Request, res: Response) => {
    try {
      const email = req.query.email as string;
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "127.0.0.1";
      const key = email ? `${clientIp}:${email.trim().toLowerCase()}` : clientIp;
      const status = db.checkRateLimit(key);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to query lockout status." });
    }
  });

  return router;
}
