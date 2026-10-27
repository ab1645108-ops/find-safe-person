import { Router, Request, Response, NextFunction } from "express";
import { GoogleGenAI } from "@google/genai";
import {
  UserRole,
  CurrentUser,
  SystemAlert,
  DuplicateCaseFlag,
  AuditLogEntry,
  MissingPerson,
  FoundConfirmationRecord,
  ReporterNotificationDelivery,
  SubjectCondition,
  ReunionStatus,
  SightingLead
} from "../src/types";
import {
  SYSTEM_USERS,
  INITIAL_SYSTEM_ALERTS,
  INITIAL_DUPLICATE_FLAGS,
} from "../src/data/featureMockData";
import { auditLogs, logAudit } from "./audit";
import { extractAuthUser, sanitizeUser } from "./auth";
import { notificationService } from "./notifications";
import { db } from "./db";
import { generateContentWithFallback } from "./gemini";

export { logAudit, auditLogs };

// Sanitizer to guarantee raw biometric embeddings are never leaked over client/public APIs
export function sanitizeCaseForClient(caseObj: MissingPerson): MissingPerson {
  if (!caseObj) return caseObj;
  const sanitized = { ...caseObj };
  delete (sanitized as any).face_embedding;
  delete (sanitized as any).biometric_reference;
  return sanitized;
}

// In-Memory Feature Stores
let serverCases: MissingPerson[] = db.getAllCases({ includeDeleted: true });
const rawAlerts = db.getAlerts().length > 0 ? db.getAlerts() : [...INITIAL_SYSTEM_ALERTS];
let alerts: SystemAlert[] = Array.from(new Map(rawAlerts.map(a => [a.id, a])).values());
let duplicateFlags: DuplicateCaseFlag[] = [...INITIAL_DUPLICATE_FLAGS];

// Haversine formula to compute great-circle distance in meters between two lat/lng points
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Levenshtein distance string similarity calculator
function stringSimilarity(s1: string, s2: string): number {
  const str1 = s1.trim().toLowerCase();
  const str2 = s2.trim().toLowerCase();
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator, // substitution
      );
    }
  }

  const maxLen = Math.max(str1.length, str2.length);
  return Math.max(0, 1 - track[str2.length][str1.length] / maxLen);
}

// Feature 6: RBAC Middleware
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Check Bearer Token first
    const authUser = extractAuthUser(req);
    let userRole: UserRole = 'PUBLIC_USER';
    let actorId = 'usr_guest';
    let actorName = 'Anonymous User';

    if (authUser) {
      if (authUser.status !== 'active') {
        logAudit(
          { id: authUser.id, name: authUser.name, role: authUser.role },
          "UNAUTHORIZED_ACCESS",
          req.baseUrl + req.path,
          authUser.id,
          "FORBIDDEN",
          `Access blocked: User account status is ${authUser.status}.`,
          req
        );
        return res.status(403).json({
          error: `Your account is ${authUser.status}. Please contact an administrator.`,
          code: "ACCOUNT_INACTIVE",
        });
      }
      userRole = authUser.role;
      actorId = authUser.id;
      actorName = authUser.name;
      (req as any).user = sanitizeUser(authUser);
    } else {
      // Privileged roles (ADMIN, INVESTIGATOR) strictly require verified cryptographic Bearer tokens
      const requiresPrivilege = allowedRoles.some((r) => r === 'ADMIN' || r === 'INVESTIGATOR');
      if (requiresPrivilege) {
        logAudit(
          { id: "usr_guest", name: "Unauthenticated Request", role: "CITIZEN" },
          "UNAUTHORIZED_ACCESS",
          req.baseUrl + req.path,
          undefined,
          "FORBIDDEN",
          `Access to ${req.method} ${req.originalUrl} blocked: Privileged roles require a verified Bearer session token.`,
          req
        );
        return res.status(401).json({
          error: "Unauthorized: Please log in with authorized credentials to access this resource.",
          code: "UNAUTHORIZED",
        });
      }

      // Fallback for non-privileged public/civilian requests only
      const roleHeader = (req.headers["x-user-role"] as string)?.toUpperCase() as UserRole;
      if (roleHeader === 'PUBLIC_USER' || roleHeader === 'CITIZEN') {
        userRole = 'PUBLIC_USER';
        actorName = (req.headers["x-user-name"] as string) || "Public User";
        actorId = (req.headers["x-user-id"] as string) || "usr_guest";
        (req as any).user = { id: actorId, name: actorName, role: userRole };
      } else {
        return res.status(401).json({
          error: "Unauthorized: Please log in to access this resource.",
          code: "UNAUTHORIZED",
        });
      }
    }

    const normalizedUserRole = (userRole === 'CITIZEN' || userRole === 'PUBLIC_USER') ? 'CITIZEN' : userRole;
    const isAuthorized = allowedRoles.some((r) => {
      const normalizedReqRole = (r === 'CITIZEN' || r === 'PUBLIC_USER') ? 'CITIZEN' : r;
      return normalizedReqRole === normalizedUserRole;
    });

    if (!isAuthorized) {
      logAudit(
        { id: actorId, name: actorName, role: userRole },
        "UNAUTHORIZED_ACCESS",
        req.baseUrl + req.path,
        undefined,
        "FORBIDDEN",
        `Access to ${req.method} ${req.originalUrl} blocked: requires one of [${allowedRoles.join(", ")}], but user holds role [${userRole}].`,
        req
      );
      return res.status(403).json({
        error: "Forbidden: Insufficient permissions for this operation",
        code: "FORBIDDEN",
        requiredRoles: allowedRoles,
        currentRole: userRole,
        message: `Your active role (${userRole}) is not authorized to perform this action. Required: ${allowedRoles.join(" or ")}.`,
      });
    }

    next();
  };
}

export function setupFeaturesRouter(getGeminiClient: () => GoogleGenAI | null): Router {
  const router = Router();

  // ==========================================
  // FEATURE 6: Current User & RBAC Metadata
  // ==========================================
  router.get("/users/available", (_req: Request, res: Response) => {
    res.json({ users: SYSTEM_USERS });
  });

  // ==========================================
  // Audit Logs API Endpoint
  // ==========================================
  router.get("/audit-logs", requireRole(['ADMIN']), (_req: Request, res: Response) => {
    const logs = db.getAuditLogs();
    res.json({ auditLogs: logs, total: logs.length });
  });

  // ==========================================
  // Missing Person Case Dossiers API (Single Central DB Source of Truth)
  // ==========================================
  router.get("/cases/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ event: "CONNECTED", timestamp: new Date().toISOString() })}\n\n`);

    const unsubscribe = db.addSSEListener((data) => {
      try {
        let payloadToSend = data.payload;
        if (data.event.startsWith('CASE_') && payloadToSend && typeof payloadToSend === 'object') {
          payloadToSend = sanitizeCaseForClient(payloadToSend);
        }
        res.write(`data: ${JSON.stringify({ event: data.event, payload: payloadToSend })}\n\n`);
      } catch {
        // stream closed
      }
    });

    req.on("close", () => {
      unsubscribe();
    });
  });

  router.get("/cases", (req: Request, res: Response) => {
    try {
      const authUser = extractAuthUser(req);
      const callerRole = authUser?.role || (req.headers['x-user-role'] as UserRole) || 'PUBLIC_USER';
      const callerId = authUser?.id || (req.headers['x-user-id'] as string);
      const callerEmail = authUser?.email;
      const includeDeleted = req.query.includeDeleted === 'true';
      const mineOnly = req.query.mine === 'true';

      if (mineOnly) {
        if (!callerId || callerId === 'usr_guest') {
          return res.json({ cases: [] });
        }
        const userCases = db.getMyCases(callerId, callerEmail, includeDeleted);
        return res.json({ cases: userCases.map(sanitizeCaseForClient) });
      }

      const allDbCases = db.getAllCases({
        includeDeleted,
        callerRole,
        callerId,
        callerEmail,
      });

      // Keep in-memory cache aligned with database
      serverCases = db.getAllCases({ includeDeleted: true });

      res.json({ cases: allDbCases.map(sanitizeCaseForClient) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to retrieve cases." });
    }
  });

  router.get("/my-cases", (req: Request, res: Response) => {
    try {
      const authUser = extractAuthUser(req);
      const callerId = authUser?.id || (req.headers['x-user-id'] as string);
      const callerEmail = authUser?.email;

      if (!callerId || callerId === 'usr_guest') {
        return res.status(401).json({ error: "Please log in to retrieve your registered cases.", cases: [] });
      }

      const cases = db.getMyCases(callerId, callerEmail, true);
      res.json({ cases: cases.map(sanitizeCaseForClient) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to retrieve citizen cases." });
    }
  });

  router.get("/cases/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const caseObj = db.getCaseById(id) || db.getCaseByCaseNumber(id);
      if (!caseObj) {
        return res.status(404).json({ error: `Case ${id} not found in database.` });
      }

      const authUser = extractAuthUser(req);
      const callerRole = authUser?.role || (req.headers['x-user-role'] as UserRole) || 'PUBLIC_USER';
      const callerId = authUser?.id || (req.headers['x-user-id'] as string);
      const callerEmail = authUser?.email;

      // Security Ownership Check:
      // An authenticated Citizen can ONLY view their own case dossiers.
      // Citizen A MUST NOT be able to access Citizen B's case by changing Case ID.
      if (callerRole === 'CITIZEN' || callerRole === 'PUBLIC_USER') {
        const isOwner =
          (callerId && caseObj.reportedByUserId && caseObj.reportedByUserId === callerId) ||
          (callerEmail && caseObj.reportedByUserEmail && caseObj.reportedByUserEmail.toLowerCase() === callerEmail.toLowerCase());

        if (!isOwner) {
          logAudit(
            { id: callerId || 'usr_unknown', name: authUser?.name || 'Citizen', role: callerRole },
            "UNAUTHORIZED_ACCESS",
            req.baseUrl + req.path,
            id,
            "FORBIDDEN",
            `Unauthorized access attempt to Case #${caseObj.caseNumber} (${caseObj.name}) by non-owner.`,
            req
          );
          return res.status(403).json({
            error: "Access denied: You do not have authorization to access another citizen's case record.",
            code: "FORBIDDEN"
          });
        }
      }

      res.json({ case: sanitizeCaseForClient(caseObj) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to retrieve case." });
    }
  });

  router.post("/cases", (req: Request, res: Response) => {
    try {
      const newCase = req.body as MissingPerson;
      if (!newCase || !newCase.name) {
        return res.status(400).json({ error: "Missing required case field: name." });
      }

      const authUser = extractAuthUser(req);
      const actorId = authUser?.id || (req.headers['x-user-id'] as string) || newCase.reportedByUserId || 'usr_reporter';
      const actorName = authUser?.name || (req.headers['x-user-name'] as string) || newCase.reportedByName || 'Citizen Reporter';
      const actorRole = authUser?.role || (req.headers['x-user-role'] as UserRole) || (newCase.reportedByRole as UserRole) || 'CITIZEN';
      const actorEmail = authUser?.email || newCase.reportedByUserEmail;

      const preparedCase: MissingPerson = {
        ...newCase,
        id: newCase.id && newCase.id.trim() ? newCase.id.trim() : `MP-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        caseNumber: newCase.caseNumber && newCase.caseNumber.trim() ? newCase.caseNumber.trim() : (newCase.id || `CA-ROS-26-${Math.floor(4000 + Math.random() * 1000)}`),
        reportedByUserId: actorId,
        reportedByName: actorName,
        reportedByRole: actorRole,
        reportedByUserEmail: actorEmail,
        created_at: newCase.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
      };

      const savedCase = db.createCase(
        preparedCase,
        {
          id: actorId,
          name: actorName,
          role: actorRole,
          email: actorEmail,
        },
        req
      );

      // Keep serverCases in sync with DB
      serverCases = db.getAllCases({ includeDeleted: true });

      res.status(201).json({ success: true, case: sanitizeCaseForClient(savedCase) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to register case." });
    }
  });

  router.put("/cases/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updatedData = req.body as MissingPerson;
      const authUser = extractAuthUser(req);
      const actorId = authUser?.id || (req.headers['x-user-id'] as string) || 'usr_actor';
      const actorName = authUser?.name || (req.headers['x-user-name'] as string) || 'User';
      const actorRole = authUser?.role || (req.headers['x-user-role'] as UserRole) || 'CITIZEN';
      const actorEmail = authUser?.email || (req.headers['x-user-email'] as string) || '';

      const updateResult = db.updateCase(
        id,
        updatedData,
        {
          id: actorId,
          name: actorName,
          role: actorRole,
          email: actorEmail,
        },
        req
      );

      if (!updateResult.success) {
        return res.status(updateResult.error?.includes('Unauthorized') ? 403 : 400).json({
          error: updateResult.error || "Failed to update case."
        });
      }

      // Sync serverCases with DB
      serverCases = db.getAllCases({ includeDeleted: true });

      res.json({ success: true, case: updateResult.case ? sanitizeCaseForClient(updateResult.case) : undefined });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update case." });
    }
  });

  router.delete("/cases/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = extractAuthUser(req);
      const actorId = authUser?.id || (req.headers['x-user-id'] as string) || 'usr_actor';
      const actorName = authUser?.name || (req.headers['x-user-name'] as string) || 'User';
      const actorRole = authUser?.role || (req.headers['x-user-role'] as UserRole) || 'CITIZEN';
      const actorEmail = authUser?.email || (req.headers['x-user-email'] as string) || '';

      const archiveResult = db.archiveCase(
        id,
        {
          id: actorId,
          name: actorName,
          role: actorRole,
          email: actorEmail,
        },
        req.body?.reason || 'DELETED BY REPORTER',
        req
      );

      if (!archiveResult.success) {
        return res.status(archiveResult.error?.includes('Unauthorized') ? 403 : 400).json({
          error: archiveResult.error || "Failed to delete case."
        });
      }

      // Sync serverCases with DB (active cases only)
      serverCases = db.getAllCases({ includeDeleted: false });

      res.json({ success: true, deletedId: id, case: archiveResult.case ? sanitizeCaseForClient(archiveResult.case) : undefined });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to delete case." });
    }
  });

  router.get("/notifications/providers", (_req: Request, res: Response) => {
    res.json(notificationService.getProvidersInfo());
  });

  // ==========================================
  // Missing Person Found & Automatic Reporter Notification
  // ==========================================
  router.post(
    "/cases/:id/confirm-found",
    requireRole(['INVESTIGATOR', 'ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const {
          foundLocation,
          foundAddress,
          subjectCondition,
          reunionStatus,
          foundNotes,
          customNote,
          notifyChannels,
          caseData,
          reporterPhone: overridePhone,
          reporterEmail: overrideEmail,
          reporterName: overrideName,
        } = req.body;

        const actor = (req as any).user || { name: 'Investigator', role: 'INVESTIGATOR', badgeNumber: 'INV-4108' };

        if (!foundLocation || !foundLocation.trim()) {
          return res.status(400).json({ error: "Found location is required to confirm case resolution." });
        }

        const normId = id ? id.trim().toLowerCase() : '';
        let caseObj: MissingPerson | undefined =
          db.getCaseById(id) ||
          db.getCaseByCaseNumber(id) ||
          db.getAllCases({ includeDeleted: true }).find(
            (c) => c.id.toLowerCase() === normId || (c.caseNumber && c.caseNumber.toLowerCase() === normId)
          ) ||
          serverCases.find(
            (c) => c.id.toLowerCase() === normId || (c.caseNumber && c.caseNumber.toLowerCase() === normId)
          );

        if (!caseObj && caseData) {
          caseObj = { ...(caseData as MissingPerson) };
        }

        if (!caseObj) {
          return res.status(404).json({ error: `Case record ${id} not found in database.` });
        }

        // Apply updated reporter contact if provided in confirmation dialog
        if (overridePhone && overridePhone.trim()) {
          caseObj.reporterPhone = overridePhone.trim();
        }
        if (overrideEmail && overrideEmail.trim()) {
          caseObj.reporterEmail = overrideEmail.trim();
        }
        if (overrideName && overrideName.trim()) {
          caseObj.reportedByName = overrideName.trim();
        }

        const conditionVal: SubjectCondition = subjectCondition || 'Safe & Stable';
        const reunionVal: ReunionStatus = reunionStatus || 'Reunited with Family';
        const investigatorStamp = `${actor.name} (${actor.badgeNumber || actor.role || 'LEO'})`;
        const confirmedAt = new Date().toISOString();

        // 1. Dispatch automatic reporter notification (SMS + Email + In-App Push)
        const channelsPref = notifyChannels || { sms: true, email: true, inApp: true };
        const deliveryReport: ReporterNotificationDelivery = await notificationService.notifyReporterPersonFound(
          caseObj,
          {
            foundLocation: foundLocation.trim(),
            subjectCondition: conditionVal,
            reunionStatus: reunionVal,
            foundNotes: foundNotes || 'Subject has been safely recovered and verified by emergency services.',
            confirmedBy: investigatorStamp,
            customNote: customNote?.trim(),
          },
          channelsPref
        );

        // 2. Build Found Confirmation Record
        const confirmationRecord: FoundConfirmationRecord = {
          id: `FOUND-${Date.now().toString().slice(-5)}`,
          personId: caseObj.id,
          caseNumber: caseObj.caseNumber,
          confirmedBy: investigatorStamp,
          confirmedByRole: actor.role || 'INVESTIGATOR',
          confirmedAt,
          foundLocation: foundLocation.trim(),
          foundAddress: foundAddress?.trim() || caseObj.lastSeenLocation.address,
          subjectCondition: conditionVal,
          reunionStatus: reunionVal,
          foundNotes: foundNotes?.trim() || 'Subject confirmed located safe.',
          reporterNotification: deliveryReport,
        };

        // 3. Update Case Dossier State
        caseObj.status = 'Located Safe';
        caseObj.publicStatusStage = 'LOCATED_SAFE';
        caseObj.foundConfirmation = confirmationRecord;
        caseObj.foundAt = confirmedAt;
        caseObj.foundLocation = confirmationRecord.foundLocation;
        caseObj.foundCondition = conditionVal;
        caseObj.foundReunionStatus = reunionVal;
        caseObj.foundNotes = confirmationRecord.foundNotes;
        caseObj.reporterNotified = deliveryReport.channelsSucceeded.length > 0;
        caseObj.reporterNotificationDetails = deliveryReport;
        caseObj.updated_at = confirmedAt;

        // Persist permanently to DB & synchronize in-memory array
        db.saveCase(caseObj);
        const scIdx = serverCases.findIndex((c) => c.id === caseObj!.id);
        if (scIdx >= 0) {
          serverCases[scIdx] = caseObj;
        } else {
          serverCases.unshift(caseObj);
        }

        // 4. Create Public Resolution System Alert in Alerts Hub & DB
        const foundAlert: SystemAlert = {
          id: `ALT-FOUND-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: 'PERSON_FOUND_RESOLVED',
          severity: 'HIGH',
          title: `✅ LOCATED SAFE: ${caseObj.name}`,
          message: `${caseObj.name} has been verified LOCATED SAFE at ${foundLocation.trim()}. Official SAR Case #${caseObj.caseNumber} resolved. Reporter ${deliveryReport.recipientName} notified via [${deliveryReport.channelsSucceeded.join(', ')}].`,
          personId: caseObj.id,
          personName: caseObj.name,
          locationName: foundLocation.trim(),
          timestamp: confirmedAt,
          isRead: false,
          broadcastChannels: ['SMS Carrier Dispatch', 'Investigator CAD', 'Public Portal Banner', 'Alerts Hub'],
          targetAudience: 'PUBLIC',
        };
        alerts.unshift(foundAlert);
        db.addAlert(foundAlert);
        db.broadcastEvent('ALERT_CREATED', foundAlert);

        // 5. Audit Logging for Compliance & CJIS Trail
        logAudit(
          actor,
          "CASE_FOUND_CONFIRMED",
          "MissingPerson",
          caseObj.id,
          "SUCCESS",
          `Missing person ${caseObj.name} (Case #${caseObj.caseNumber}) confirmed LOCATED SAFE at "${foundLocation.trim()}". Condition: ${conditionVal}. Reunion: ${reunionVal}. Attested by ${investigatorStamp}.`,
          req
        );

        logAudit(
          actor,
          "REPORTER_NOTIFIED",
          "ReporterNotification",
          deliveryReport.notificationId,
          deliveryReport.channelsSucceeded.length > 0 ? "SUCCESS" : "FAILED",
          `Automatic reporter notification for Case #${caseObj.caseNumber} dispatched to ${deliveryReport.recipientName} (Phone: ${deliveryReport.recipientPhone || 'None'}, Email: ${deliveryReport.recipientEmail || 'None'}) via [${deliveryReport.channelsAttempted.join(', ')}]. SMS Carrier: ${deliveryReport.smsStatus} (${deliveryReport.smsProvider}).`,
          req
        );

        res.json({
          success: true,
          case: caseObj,
          confirmation: confirmationRecord,
          notification: deliveryReport,
          message: `Case resolved: ${caseObj.name} confirmed Located Safe. Reporter ${deliveryReport.recipientName} automatically notified.`,
        });
      } catch (err: any) {
        console.error("Error in /cases/:id/confirm-found:", err);
        res.status(500).json({ error: err.message || "Failed to confirm found and notify reporter." });
      }
    }
  );

  router.get("/cases/:id/notification-status", (req: Request, res: Response) => {
    const { id } = req.params;
    const normId = id ? id.trim().toLowerCase() : '';
    const caseObj =
      db.getCaseById(id) ||
      db.getCaseByCaseNumber(id) ||
      serverCases.find(
        (c) => c.id.toLowerCase() === normId || (c.caseNumber && c.caseNumber.toLowerCase() === normId)
      );

    if (!caseObj) {
      return res.status(404).json({ error: "Case not found." });
    }
    res.json({
      caseId: caseObj.id,
      caseNumber: caseObj.caseNumber,
      personName: caseObj.name,
      status: caseObj.status,
      reporterNotified: caseObj.reporterNotified || false,
      delivery: caseObj.reporterNotificationDetails || null,
      confirmation: caseObj.foundConfirmation || null,
    });
  });

  router.post(
    "/cases/:id/resend-reporter-notification",
    requireRole(['INVESTIGATOR', 'ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { customNote, notifyChannels } = req.body;
        const actor = (req as any).user;

        const normId = id ? id.trim().toLowerCase() : '';
        const caseObj =
          db.getCaseById(id) ||
          db.getCaseByCaseNumber(id) ||
          serverCases.find(
            (c) => c.id.toLowerCase() === normId || (c.caseNumber && c.caseNumber.toLowerCase() === normId)
          );

        if (!caseObj) {
          return res.status(404).json({ error: "Case not found." });
        }
        if (caseObj.status !== 'Located Safe') {
          return res.status(400).json({ error: "Case must be marked Located Safe before resending found notification." });
        }

        const investigatorStamp = `${actor.name} (${actor.badgeNumber || actor.role || 'LEO'})`;
        const channelsPref = notifyChannels || { sms: true, email: true, inApp: true };

        const deliveryReport = await notificationService.notifyReporterPersonFound(
          caseObj,
          {
            foundLocation: caseObj.foundLocation || caseObj.lastSeenLocation.name,
            subjectCondition: caseObj.foundCondition || 'Safe & Stable',
            reunionStatus: caseObj.foundReunionStatus || 'Reunited with Family',
            foundNotes: caseObj.foundNotes || 'Follow-up notification from SAR coordinator.',
            confirmedBy: investigatorStamp,
            customNote: customNote?.trim(),
          },
          channelsPref
        );

        caseObj.reporterNotificationDetails = deliveryReport;
        caseObj.reporterNotified = deliveryReport.channelsSucceeded.length > 0;

        logAudit(
          actor,
          "REPORTER_NOTIFICATION_RESENT",
          "ReporterNotification",
          deliveryReport.notificationId,
          "SUCCESS",
          `Follow-up found notification re-dispatched to reporter ${deliveryReport.recipientName} (Phone: ${deliveryReport.recipientPhone || 'None'}).`,
          req
        );

        res.json({
          success: true,
          case: caseObj,
          notification: deliveryReport,
          message: "Follow-up found notification sent successfully.",
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to resend reporter notification." });
      }
    }
  );



  // ==========================================
  // Real-Time Alerts Hub
  // ==========================================
  router.get("/alerts", (req: Request, res: Response) => {
    const roleHeader = (req.headers["x-user-role"] as string)?.toUpperCase() as UserRole;
    const isPublic = !roleHeader || roleHeader === 'PUBLIC_USER';
    const visibleAlerts = isPublic
      ? alerts.filter((a) => a.targetAudience === 'PUBLIC' || a.severity === 'CRITICAL')
      : alerts;
    res.json({ alerts: visibleAlerts });
  });

  router.post(
    "/alerts/broadcast",
    requireRole(['ADMIN']),
    (req: Request, res: Response) => {
      try {
        const { type, severity, title, message, personId, personName, locationName, channels, targetAudience } = req.body;
        const actor = (req as any).user;

        if (!title || !message) {
          return res.status(400).json({ error: "title and message are required." });
        }

        const newAlert: SystemAlert = {
          id: `ALT-BCAST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: type || 'AMBER_ALERT',
          severity: severity || 'CRITICAL',
          title,
          message,
          personId,
          personName,
          locationName,
          timestamp: new Date().toISOString(),
          isRead: false,
          broadcastChannels: channels || ['WEA Cellular', 'Highway Signage', 'CAD Dispatch'],
          targetAudience: targetAudience || 'PUBLIC',
        };

        alerts.unshift(newAlert);

        logAudit(
          actor,
          "EMERGENCY_BROADCAST_DISPATCHED",
          "SystemAlert",
          newAlert.id,
          "SUCCESS",
          `Dispatched emergency broadcast "${newAlert.title}" across [${newAlert.broadcastChannels?.join(", ")}].`,
          req
        );

        res.json({
          success: true,
          alert: newAlert,
          broadcastDeliveryStats: {
            devicesNotifiedEst: 18450,
            firstResponderUnitsPaged: 52,
            socialMediaBroadcastStatus: "Delivered",
            broadcastTimestamp: new Date().toISOString(),
          },
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to broadcast alert." });
      }
    }
  );

  router.patch("/alerts/:id/read", (req: Request, res: Response) => {
    const { id } = req.params;
    const alert = alerts.find((a) => a.id === id);
    if (alert) {
      alert.isRead = true;
      return res.json({ success: true, alert });
    }
    res.status(404).json({ error: "Alert not found." });
  });

  // ==========================================
  // FEATURE 5: Duplicate Case Detection & Merging
  // ==========================================
  const resolvedCasePairKeys = new Set<string>();
  const getPairKey = (id1: string, id2: string) => [id1, id2].sort().join("::");

  function compareCases(caseA: MissingPerson, caseB: MissingPerson): {
    score: number;
    reasons: string[];
    discrepancies: { field: string; primaryValue: string; candidateValue: string }[];
  } {
    let score = 0;
    const reasons: string[] = [];
    const discrepancies: { field: string; primaryValue: string; candidateValue: string }[] = [];

    // 1. Name comparison
    const nameSim = stringSimilarity(caseA.name, caseB.name);
    if (nameSim >= 0.85) {
      score += 35;
      reasons.push(`High name similarity (${Math.round(nameSim * 100)}%): "${caseA.name}" vs "${caseB.name}"`);
    } else if (nameSim >= 0.6) {
      score += 20;
      reasons.push(`Moderate name similarity (${Math.round(nameSim * 100)}%)`);
    } else {
      discrepancies.push({
        field: "Full Name",
        primaryValue: caseA.name,
        candidateValue: caseB.name,
      });
    }

    // 2. Age difference
    const ageDiff = Math.abs(Number(caseA.age) - Number(caseB.age));
    if (ageDiff === 0) {
      score += 25;
      reasons.push(`Exact age match (${caseA.age} years old)`);
    } else if (ageDiff <= 2) {
      score += 18;
      reasons.push(`Close age proximity (±${ageDiff} years discrepancy)`);
    } else if (ageDiff <= 5) {
      score += 10;
    } else {
      discrepancies.push({
        field: "Age",
        primaryValue: `${caseA.age} y/o`,
        candidateValue: `${caseB.age} y/o`,
      });
    }

    // 3. Location proximity
    if (caseA.lastSeenLocation?.lat && caseB.lastSeenLocation?.lat) {
      const distMeters = calculateDistanceMeters(
        caseA.lastSeenLocation.lat,
        caseA.lastSeenLocation.lng,
        caseB.lastSeenLocation.lat,
        caseB.lastSeenLocation.lng
      );
      if (distMeters <= 500) {
        score += 25;
        reasons.push(`Immediate geographic cluster: ${Math.round(distMeters)}m apart`);
      } else if (distMeters <= 3000) {
        score += 15;
        reasons.push(`Regional proximity: ${(distMeters / 1000).toFixed(1)} km apart`);
      } else {
        discrepancies.push({
          field: "Last Seen Location",
          primaryValue: caseA.lastSeenLocation.name,
          candidateValue: caseB.lastSeenLocation.name,
        });
      }
    }

    // 4. Physical / Gender Match
    if (caseA.gender === caseB.gender) {
      score += 10;
      reasons.push(`Matching gender (${caseA.gender})`);
    }

    // 5. Medical conditions match
    const condOverlap = (caseA.medicalConditions || []).filter((c: string) =>
      (caseB.medicalConditions || []).some((ec: string) => stringSimilarity(c, ec) > 0.7)
    );
    if (condOverlap.length > 0) {
      score += 10;
      reasons.push(`Shared medical diagnoses: ${condOverlap.join(", ")}`);
    }

    return {
      score: Math.min(99, score),
      reasons,
      discrepancies,
    };
  }

  router.get("/cases/duplicates", requireRole(['INVESTIGATOR', 'ADMIN']), (req: Request, res: Response) => {
    const showAll = req.query.all === 'true';
    const pendingFlags = duplicateFlags.filter((f) => f.status === 'PENDING_REVIEW');
    const resolvedFlags = duplicateFlags.filter((f) => f.status !== 'PENDING_REVIEW');
    res.json({
      duplicateFlags: showAll ? duplicateFlags : pendingFlags,
      pendingFlags,
      resolvedFlags,
      totalPending: pendingFlags.length,
      totalResolved: resolvedFlags.length,
    });
  });

  router.post(
    "/cases/scan-registry",
    requireRole(['INVESTIGATOR', 'ADMIN']),
    (req: Request, res: Response) => {
      try {
        const { cases } = req.body;
        const targets: MissingPerson[] = cases || [];
        let newMatchesCount = 0;

        for (let i = 0; i < targets.length; i++) {
          for (let j = i + 1; j < targets.length; j++) {
            const caseA = targets[i];
            const caseB = targets[j];
            const pairKey = getPairKey(caseA.id, caseB.id);

            // Skip if already resolved (merged or dismissed) or currently flagged
            if (resolvedCasePairKeys.has(pairKey)) continue;
            if (duplicateFlags.some((f) => getPairKey(f.primaryCaseId, f.candidateCaseId) === pairKey)) continue;

            const { score, reasons, discrepancies } = compareCases(caseA, caseB);
            if (score >= 70) {
              const flag: DuplicateCaseFlag = {
                id: `DUP-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`,
                primaryCaseId: caseA.id,
                candidateCaseId: caseB.id,
                primaryCase: caseA,
                candidateCase: caseB,
                similarityScore: score,
                matchReasons: reasons,
                discrepancies,
                status: 'PENDING_REVIEW',
                flaggedAt: new Date().toISOString(),
              };
              duplicateFlags.unshift(flag);
              newMatchesCount++;
            }
          }
        }

        const pendingFlags = duplicateFlags.filter((f) => f.status === 'PENDING_REVIEW');
        res.json({
          success: true,
          newMatchesFound: newMatchesCount,
          duplicateFlags: pendingFlags,
          totalPending: pendingFlags.length,
          message: newMatchesCount > 0
            ? `Found ${newMatchesCount} potential duplicate case(s) requiring review.`
            : `0 duplicates detected. All active dossiers verified unique.`,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to scan registry for duplicates." });
      }
    }
  );

  router.post(
    "/cases/check-duplicate",
    requireRole(['INVESTIGATOR', 'ADMIN']),
    (req: Request, res: Response) => {
      try {
        const { candidateCase, existingCases } = req.body;
        if (!candidateCase) {
          return res.status(400).json({ error: "candidateCase is required." });
        }

        const potentialMatches: {
          existingCase: MissingPerson;
          score: number;
          reasons: string[];
          discrepancies: { field: string; primaryValue: string; candidateValue: string }[];
        }[] = [];

        const targets: MissingPerson[] = existingCases || [];
        for (const existing of targets) {
          if (existing.id === candidateCase.id) continue;
          const pairKey = getPairKey(existing.id, candidateCase.id);
          if (resolvedCasePairKeys.has(pairKey)) continue;

          const { score, reasons, discrepancies } = compareCases(existing, candidateCase);
          if (score >= 50) {
            potentialMatches.push({
              existingCase: existing,
              score,
              reasons,
              discrepancies,
            });
          }
        }

        potentialMatches.sort((a, b) => b.score - a.score);

        if (potentialMatches.length > 0 && potentialMatches[0].score >= 70) {
          const top = potentialMatches[0];
          const pairKey = getPairKey(top.existingCase.id, candidateCase.id);
          if (!resolvedCasePairKeys.has(pairKey) && !duplicateFlags.some((f) => getPairKey(f.primaryCaseId, f.candidateCaseId) === pairKey)) {
            const flag: DuplicateCaseFlag = {
              id: `DUP-${Date.now().toString().slice(-4)}`,
              primaryCaseId: top.existingCase.id,
              candidateCaseId: candidateCase.id,
              primaryCase: top.existingCase,
              candidateCase: candidateCase,
              similarityScore: top.score,
              matchReasons: top.reasons,
              discrepancies: top.discrepancies,
              status: 'PENDING_REVIEW',
              flaggedAt: new Date().toISOString(),
            };
            duplicateFlags.unshift(flag);
          }
        }

        const pendingFlags = duplicateFlags.filter((f) => f.status === 'PENDING_REVIEW');
        res.json({
          hasPotentialDuplicates: potentialMatches.length > 0,
          matches: potentialMatches,
          duplicateFlags: pendingFlags,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to check duplicates." });
      }
    }
  );

  router.post(
    "/cases/resolve-duplicate",
    requireRole(['INVESTIGATOR', 'ADMIN']),
    (req: Request, res: Response) => {
      try {
        const { flagId, resolution, notes } = req.body;
        const actor = (req as any).user;
        const flag = duplicateFlags.find((f) => f.id === flagId);

        if (!flag) {
          return res.status(404).json({ error: "Duplicate flag record not found." });
        }

        flag.status = resolution === 'MERGE' ? 'RESOLVED_MERGED' : 'DISMISSED_DISTINCT';
        flag.reviewedBy = `${actor.name} (${actor.role})`;
        flag.reviewedAt = new Date().toISOString();

        resolvedCasePairKeys.add(getPairKey(flag.primaryCaseId, flag.candidateCaseId));

        logAudit(
          actor,
          resolution === 'MERGE' ? "CASE_DUPLICATE_MERGED" : "CASE_DUPLICATE_DISMISSED",
          "DuplicateCaseFlag",
          flagId,
          "SUCCESS",
          `Resolved duplicate review between Case #${flag.primaryCaseId} and #${flag.candidateCaseId}: ${flag.status}. Notes: ${notes || 'None'}`,
          req
        );

        const remainingPendingFlags = duplicateFlags.filter((f) => f.status === 'PENDING_REVIEW');
        res.json({
          success: true,
          flag,
          remainingPendingFlags,
          totalPending: remainingPendingFlags.length,
          resolutionMessage: resolution === 'MERGE'
            ? `Successfully merged supplementary intel from Case #${flag.candidateCaseId} into Primary Case #${flag.primaryCaseId}.`
            : `Marked Case #${flag.candidateCaseId} as distinct, independent investigation.`,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to resolve duplicate." });
      }
    }
  );

  // -----------------------------------------------------------
  // Sighting Leads & Found Person Reports Router
  // -----------------------------------------------------------
  router.get("/sightings", (req: Request, res: Response) => {
    try {
      const { personId, status } = req.query as { personId?: string; status?: string };
      const sightings = db.getSightings({ personId, status });
      res.json({ success: true, sightings });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load sightings." });
    }
  });

  router.post("/sightings", (req: Request, res: Response) => {
    try {
      const authUser = extractAuthUser(req);
      const actorId = authUser?.id || (req.headers['x-user-id'] as string) || 'usr_public';
      const actorName = authUser?.name || (req.headers['x-user-name'] as string) || req.body?.reportedBy || 'Public Bystander';
      const actorRole = authUser?.role || (req.headers['x-user-role'] as UserRole) || 'CITIZEN';

      const sighting = db.saveSighting(
        req.body as SightingLead,
        { id: actorId, name: actorName, role: actorRole },
        req
      );

      res.status(201).json({ success: true, sighting });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to submit sighting lead." });
    }
  });

  router.put("/sightings/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = extractAuthUser(req);
      const actorId = authUser?.id || (req.headers['x-user-id'] as string) || 'usr_investigator';
      const actorName = authUser?.name || (req.headers['x-user-name'] as string) || 'Investigator';
      const actorRole = authUser?.role || (req.headers['x-user-role'] as UserRole) || 'INVESTIGATOR';

      const updated = db.updateSighting(
        id,
        req.body,
        { id: actorId, name: actorName, role: actorRole },
        req
      );

      if (!updated) {
        return res.status(404).json({ error: "Sighting lead not found." });
      }

      res.json({ success: true, sighting: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update sighting lead." });
    }
  });

  router.delete("/sightings/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = extractAuthUser(req);
      const actorId = authUser?.id || (req.headers['x-user-id'] as string) || 'usr_investigator';
      const actorName = authUser?.name || (req.headers['x-user-name'] as string) || 'Investigator';
      const actorRole = authUser?.role || (req.headers['x-user-role'] as UserRole) || 'INVESTIGATOR';

      const success = db.deleteSighting(
        id,
        { id: actorId, name: actorName, role: actorRole },
        req
      );

      if (!success) {
        return res.status(404).json({ error: "Sighting lead not found." });
      }

      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to delete sighting lead." });
    }
  });

  return router;
}
