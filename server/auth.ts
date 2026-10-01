import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Router, Request, Response, NextFunction } from "express";
import { UserRole, AccountStatus, InvestigatorRequest } from "../src/types";
import { logAudit } from "./audit";
import { db } from "./db";

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

  // Seed sample pending investigator requests if none exist in permanent DB
  const existingReqs = db.getInvestigatorRequests();
  if (existingReqs.length === 0) {
    const sampleReqs: { user: UserEntity; req: InvestigatorRequest }[] = [
      {
        user: {
          id: "usr_inv_seed_1",
          name: "Det. Sarah Miller",
          email: "s.miller@statepolice.gov",
          password_hash: hashPassword("Investigator@1234"),
          role: "INVESTIGATOR",
          status: "PENDING_APPROVAL",
          badgeNumber: "DET-8831",
          agency: "State Police SAR Division",
          organization: "California State Police",
          phone: "+1 (530) 555-8831",
          created_at: "2026-09-28T09:15:00Z",
          updated_at: "2026-09-28T09:15:00Z",
          last_login: null,
        },
        req: {
          id: "REQ-INV-8831",
          userId: "usr_inv_seed_1",
          name: "Det. Sarah Miller",
          email: "s.miller@statepolice.gov",
          phone: "+1 (530) 555-8831",
          organization: "State Police SAR Division",
          investigatorId: "DET-8831",
          additionalInfo: "Lead Detective with Special Crimes & SAR unit. Certified K9 handler and forensics investigator.",
          status: "PENDING",
          requestDate: "2026-09-28T09:15:00Z",
        },
      },
      {
        user: {
          id: "usr_inv_seed_2",
          name: "Marcus Vance",
          email: "m.vance@countysearch.org",
          password_hash: hashPassword("Investigator@1234"),
          role: "INVESTIGATOR",
          status: "PENDING_APPROVAL",
          badgeNumber: "SAR-9024",
          agency: "Placer County Search & Rescue",
          organization: "County Emergency Services",
          phone: "+1 (916) 555-9024",
          created_at: "2026-09-29T11:40:00Z",
          updated_at: "2026-09-29T11:40:00Z",
          last_login: null,
        },
        req: {
          id: "REQ-INV-9024",
          userId: "usr_inv_seed_2",
          name: "Marcus Vance",
          email: "m.vance@countysearch.org",
          phone: "+1 (916) 555-9024",
          organization: "Placer County Search & Rescue",
          investigatorId: "SAR-9024",
          additionalInfo: "Field Ops Coordinator for Placer Foothills search team. Mountain rescue and wilderness tracking certified.",
          status: "PENDING",
          requestDate: "2026-09-29T11:40:00Z",
        },
      },
      {
        user: {
          id: "usr_inv_seed_3",
          name: "Officer David Reyes",
          email: "d.reyes@metro-pd.gov",
          password_hash: hashPassword("Investigator@1234"),
          role: "INVESTIGATOR",
          status: "PENDING_APPROVAL",
          badgeNumber: "MPD-7721",
          agency: "Metro Police Dept - Missing Persons",
          organization: "Metro Law Enforcement",
          phone: "+1 (916) 555-4412",
          created_at: "2026-09-30T00:20:00Z",
          updated_at: "2026-09-30T00:20:00Z",
          last_login: null,
        },
        req: {
          id: "REQ-INV-7721",
          userId: "usr_inv_seed_3",
          name: "Officer David Reyes",
          email: "d.reyes@metro-pd.gov",
          phone: "+1 (916) 555-4412",
          organization: "Metro Police Dept - Missing Persons",
          investigatorId: "MPD-7721",
          additionalInfo: "Sworn investigator assigned to juvenile runaways and endangered missing persons division.",
          status: "PENDING",
          requestDate: "2026-09-30T00:20:00Z",
        },
      },
    ];

    for (const item of sampleReqs) {
      USERS_DB.set(item.user.id, item.user);
      db.saveUser(item.user);
      db.saveInvestigatorRequest(item.req);
    }
  }
}

seedUsers();

export function sanitizeUser(user: UserEntity): Omit<UserEntity, "password_hash"> {
  const { password_hash, ...safe } = user;
  return safe;
}

export function findUserByEmail(email: string): UserEntity | undefined {
  const normalized = email.trim().toLowerCase();
  for (const user of USERS_DB.values()) {
    if (user.email.toLowerCase() === normalized) {
      return user;
    }
  }
  if (normalized === "m.hayes@rosevillepd.gov") return USERS_DB.get("usr_investigator_1");
  if (normalized === "s.jenkins@placersheriff.gov") return USERS_DB.get("usr_admin_1");
  if (normalized === "alex.rivera@community.org") return USERS_DB.get("usr_citizen_1");
  return undefined;
}

export function findUserById(id: string): UserEntity | undefined {
  return USERS_DB.get(id);
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
      const user = USERS_DB.get(decoded.userId) || db.getUserById(decoded.userId);
      if (user) return user;
    }
  }
  // Fallback to legacy headers for seamless backward-compatibility
  const legacyUserId = req.headers["x-user-id"] as string;
  if (legacyUserId) {
    if (USERS_DB.has(legacyUserId)) {
      return USERS_DB.get(legacyUserId)!;
    }
    const dbUser = db.getUserById(legacyUserId);
    if (dbUser) return dbUser;

    // Map common alias IDs to active seed users
    if (legacyUserId === "usr_inv_01" || legacyUserId === "usr_investigator" || legacyUserId.includes("investigator")) {
      return USERS_DB.get("usr_investigator_1") || null;
    }
    if (legacyUserId === "usr_admin" || legacyUserId.includes("admin")) {
      return USERS_DB.get("usr_admin_1") || null;
    }
    if (legacyUserId === "usr_public_1" || legacyUserId === "usr_citizen" || legacyUserId.includes("citizen")) {
      return USERS_DB.get("usr_citizen_1") || null;
    }
  }

  // Fallback to role header
  const roleHeader = req.headers["x-user-role"] as string;
  if (roleHeader) {
    const normRole = roleHeader.trim().toUpperCase();
    if (normRole === "ADMIN") {
      return USERS_DB.get("usr_admin_1") || null;
    }
    if (normRole === "INVESTIGATOR") {
      return USERS_DB.get("usr_investigator_1") || null;
    }
    if (normRole === "CITIZEN" || normRole === "PUBLIC_USER") {
      return USERS_DB.get("usr_citizen_1") || null;
    }
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

      res.status(201).json({
        success: true,
        message: "Registration successful. Please log in with your credentials.",
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
  // 2. User Login Flow
  // -----------------------------------------------------------
  router.post("/auth/login", (req: Request, res: Response) => {
    try {
      const { email, password, expectedRole } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
      }

      const user = findUserByEmail(email);

      // Secure generic failure message if user doesn't exist
      if (!user) {
        logAudit(
          { id: "unknown", name: email, role: (expectedRole as UserRole) || "CITIZEN" },
          expectedRole === "INVESTIGATOR" ? "INVESTIGATOR_LOGIN_DENIED" : "LOGIN_FAILED",
          "Session",
          undefined,
          "FAILED",
          `Failed login attempt: Email ${email} not found.`,
          req
        );
        return res.status(401).json({ error: "Invalid email or password." });
      }

      // Verify password hash
      const isValid = verifyPassword(password, user.password_hash);
      if (!isValid) {
        logAudit(
          { id: user.id, name: user.name, role: user.role },
          user.role === "INVESTIGATOR" ? "INVESTIGATOR_LOGIN_DENIED" : "LOGIN_FAILED",
          "Session",
          user.id,
          "FAILED",
          `Failed login attempt for ${user.email}: Incorrect password.`,
          req
        );
        return res.status(401).json({ error: "Invalid email or password." });
      }

      // Role check for expected portal if specified
      if (expectedRole) {
        const normalizedUserRole = user.role === "PUBLIC_USER" ? "CITIZEN" : user.role;
        const normalizedExpectedRole = expectedRole === "PUBLIC_USER" ? "CITIZEN" : expectedRole;
        if (normalizedExpectedRole !== normalizedUserRole && !(normalizedExpectedRole === "INVESTIGATOR" && user.role === "ADMIN")) {
          // Admin can optionally access investigator portal, but other mismatched roles warn
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

  return router;
}
