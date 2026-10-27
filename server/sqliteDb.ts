import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const DB_DIR = path.resolve(process.cwd(), 'server', 'data');
const SQLITE_FILE = path.join(DB_DIR, 'findsafe.db');
const JSON_FILE = path.join(DB_DIR, 'database.json');

export interface DatabaseStats {
  engine: string;
  version: string;
  filePath: string;
  fileSizeBytes: number;
  integrity: string;
  tableCounts: {
    users: number;
    cases: number;
    investigator_requests: number;
    sightings: number;
    audit_logs: number;
    system_alerts: number;
    auth_rate_limits: number;
  };
  lastUpdated: string;
}

class SqliteStorage {
  private db: DatabaseSync | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  public init() {
    if (this.isInitialized && this.db) return;

    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }

      this.db = new DatabaseSync(SQLITE_FILE);
      this.createTables();
      this.migrateFromJsonIfEmpty();
      this.isInitialized = true;
      console.log(`[SQLite Database] Successfully connected to persistent SQLite database at ${SQLITE_FILE}`);
    } catch (err) {
      console.error('[SQLite Database] Initialization error:', err);
    }
  }

  private createTables() {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        badge_number TEXT,
        agency TEXT,
        organization TEXT,
        phone TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login TEXT,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        case_number TEXT UNIQUE,
        first_name TEXT,
        last_name TEXT,
        status TEXT,
        priority TEXT,
        reported_by_user_id TEXT,
        reported_by_user_email TEXT,
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS investigator_requests (
        id TEXT PRIMARY KEY,
        email TEXT,
        user_id TEXT,
        status TEXT,
        request_date TEXT,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sightings (
        id TEXT PRIMARY KEY,
        person_id TEXT,
        status TEXT,
        created_at TEXT,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT,
        actor_role TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        status TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS system_alerts (
        id TEXT PRIMARY KEY,
        type TEXT,
        created_at TEXT,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_rate_limits (
        rate_key TEXT PRIMARY KEY,
        failed_attempts INTEGER DEFAULT 0,
        locked_until INTEGER DEFAULT 0,
        last_attempt INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number);
      CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_sightings_person ON sightings(person_id);
      CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens(token);
    `);
  }

  private migrateFromJsonIfEmpty() {
    if (!this.db) return;

    try {
      const userCountRow = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
      const caseCountRow = this.db.prepare('SELECT COUNT(*) as count FROM cases').get() as { count: number };

      if (userCountRow.count === 0 && caseCountRow.count === 0 && fs.existsSync(JSON_FILE)) {
        console.log('[SQLite Database] Empty database detected. Migrating initial data from database.json...');
        const raw = fs.readFileSync(JSON_FILE, 'utf-8');
        const parsed = JSON.parse(raw);

        // Migrate users
        if (Array.isArray(parsed.users)) {
          const insertUser = this.db.prepare(`
            INSERT OR REPLACE INTO users (id, name, email, password_hash, role, status, badge_number, agency, organization, phone, created_at, updated_at, last_login, data_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const u of parsed.users) {
            insertUser.run(
              u.id || `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              u.name || 'User',
              (u.email || '').toLowerCase(),
              u.password_hash || '',
              u.role || 'CITIZEN',
              u.status || 'active',
              u.badgeNumber || null,
              u.agency || null,
              u.organization || null,
              u.phone || null,
              u.created_at || new Date().toISOString(),
              u.updated_at || new Date().toISOString(),
              u.last_login || null,
              JSON.stringify(u)
            );
          }
        }

        // Migrate cases
        if (Array.isArray(parsed.cases)) {
          const insertCase = this.db.prepare(`
            INSERT OR REPLACE INTO cases (id, case_number, first_name, last_name, status, priority, reported_by_user_id, reported_by_user_email, is_deleted, created_at, updated_at, data_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const c of parsed.cases) {
            insertCase.run(
              c.id,
              c.caseNumber || null,
              c.firstName || null,
              c.lastName || null,
              c.status || 'MISSING',
              c.priority || 'MEDIUM',
              c.reportedByUserId || null,
              (c.reportedByUserEmail || '').toLowerCase(),
              c.is_deleted ? 1 : 0,
              c.reportedDate || new Date().toISOString(),
              c.lastUpdated || new Date().toISOString(),
              JSON.stringify(c)
            );
          }
        }

        // Migrate investigator requests
        if (Array.isArray(parsed.investigatorRequests)) {
          const insertReq = this.db.prepare(`
            INSERT OR REPLACE INTO investigator_requests (id, email, user_id, status, request_date, data_json)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          for (const r of parsed.investigatorRequests) {
            insertReq.run(
              r.id,
              (r.email || '').toLowerCase(),
              r.userId || null,
              r.status || 'PENDING',
              r.requestDate || new Date().toISOString(),
              JSON.stringify(r)
            );
          }
        }

        // Migrate sightings
        if (Array.isArray(parsed.sightings)) {
          const insertSighting = this.db.prepare(`
            INSERT OR REPLACE INTO sightings (id, person_id, status, created_at, data_json)
            VALUES (?, ?, ?, ?, ?)
          `);
          for (const s of parsed.sightings) {
            insertSighting.run(
              s.id,
              s.personId || null,
              s.status || 'UNREVIEWED',
              s.timestamp || new Date().toISOString(),
              JSON.stringify(s)
            );
          }
        }

        // Migrate audit logs
        if (Array.isArray(parsed.auditLogs)) {
          const insertAudit = this.db.prepare(`
            INSERT OR REPLACE INTO audit_logs (id, timestamp, actor_id, actor_name, actor_role, action, entity_type, entity_id, status, details, ip_address, user_agent, data_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const a of parsed.auditLogs) {
            insertAudit.run(
              a.id || `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              a.timestamp || new Date().toISOString(),
              a.actorId || null,
              a.actorName || null,
              a.actorRole || null,
              a.action || 'ACTION',
              a.entityType || null,
              a.entityId || null,
              a.status || 'SUCCESS',
              a.details || null,
              a.ipAddress || null,
              a.userAgent || null,
              JSON.stringify(a)
            );
          }
        }

        // Migrate alerts
        if (Array.isArray(parsed.alerts)) {
          const insertAlert = this.db.prepare(`
            INSERT OR REPLACE INTO system_alerts (id, type, created_at, data_json)
            VALUES (?, ?, ?, ?)
          `);
          for (const al of parsed.alerts) {
            insertAlert.run(
              al.id,
              al.type || 'INFO',
              al.timestamp || new Date().toISOString(),
              JSON.stringify(al)
            );
          }
        }

        console.log('[SQLite Database] Migration completed successfully.');
      }
    } catch (err) {
      console.error('[SQLite Database] Migration error:', err);
    }
  }

  // -----------------------------------------------------------
  // USERS TABLE
  // -----------------------------------------------------------
  public getAllUsers(): any[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare('SELECT data_json FROM users ORDER BY created_at DESC').all() as { data_json: string }[];
      return rows.map((r) => JSON.parse(r.data_json));
    } catch (err) {
      console.error('[SQLite Database] getAllUsers error:', err);
      return [];
    }
  }

  public getUserById(id: string): any | undefined {
    if (!this.db || !id) return undefined;
    try {
      const row = this.db.prepare('SELECT password_hash, data_json FROM users WHERE id = ?').get(id) as { password_hash: string; data_json: string } | undefined;
      if (!row) return undefined;
      const parsed = JSON.parse(row.data_json);
      if (!parsed.password_hash && row.password_hash) {
        parsed.password_hash = row.password_hash;
      }
      return parsed;
    } catch (err) {
      console.error('[SQLite Database] getUserById error:', err);
      return undefined;
    }
  }

  public getUserByEmail(email: string): any | undefined {
    if (!this.db || !email) return undefined;
    try {
      const normalized = email.trim().toLowerCase();
      const row = this.db.prepare('SELECT password_hash, data_json FROM users WHERE LOWER(TRIM(email)) = ?').get(normalized) as { password_hash: string; data_json: string } | undefined;
      if (!row) return undefined;
      const parsed = JSON.parse(row.data_json);
      if (!parsed.password_hash && row.password_hash) {
        parsed.password_hash = row.password_hash;
      }
      return parsed;
    } catch (err) {
      console.error('[SQLite Database] getUserByEmail error:', err);
      return undefined;
    }
  }

  public saveUser(user: any) {
    if (!this.db || !user) return;
    try {
      const normalizedEmail = (user.email || '').trim().toLowerCase();

      // Ensure no conflicting row with different ID has this email
      if (normalizedEmail) {
        this.db.prepare('DELETE FROM users WHERE LOWER(TRIM(email)) = ? AND id != ?').run(normalizedEmail, user.id);
      }

      const userToSave = {
        ...user,
        email: normalizedEmail,
      };

      const stmt = this.db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, status, badge_number, agency, organization, phone, created_at, updated_at, last_login, data_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          email = excluded.email,
          password_hash = excluded.password_hash,
          role = excluded.role,
          status = excluded.status,
          badge_number = excluded.badge_number,
          agency = excluded.agency,
          organization = excluded.organization,
          phone = excluded.phone,
          updated_at = excluded.updated_at,
          last_login = excluded.last_login,
          data_json = excluded.data_json
      `);

      stmt.run(
        user.id,
        user.name,
        normalizedEmail,
        user.password_hash || '',
        user.role,
        user.status || 'active',
        user.badgeNumber || null,
        user.agency || null,
        user.organization || null,
        user.phone || null,
        user.created_at || new Date().toISOString(),
        user.updated_at || new Date().toISOString(),
        user.last_login || null,
        JSON.stringify(userToSave)
      );
    } catch (err) {
      console.error('[SQLite Database] saveUser error:', err);
    }
  }

  public deleteUser(id: string) {
    if (!this.db) return;
    try {
      this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    } catch (err) {
      console.error('[SQLite Database] deleteUser error:', err);
    }
  }

  // -----------------------------------------------------------
  // PASSWORD RESET TOKENS
  // -----------------------------------------------------------
  public savePasswordResetToken(token: string, userId: string, email: string, expiresAt: number) {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO password_reset_tokens (token, user_id, email, expires_at, used, created_at)
        VALUES (?, ?, ?, ?, 0, ?)
        ON CONFLICT(token) DO UPDATE SET
          user_id = excluded.user_id,
          email = excluded.email,
          expires_at = excluded.expires_at,
          used = 0
      `);
      stmt.run(token, userId, email.trim().toLowerCase(), expiresAt, new Date().toISOString());
    } catch (err) {
      console.error('[SQLite Database] savePasswordResetToken error:', err);
    }
  }

  public getPasswordResetToken(token: string): { token: string; user_id: string; email: string; expires_at: number; used: number } | undefined {
    if (!this.db || !token) return undefined;
    try {
      const row = this.db.prepare('SELECT token, user_id, email, expires_at, used FROM password_reset_tokens WHERE token = ?').get(token) as any;
      return row || undefined;
    } catch (err) {
      console.error('[SQLite Database] getPasswordResetToken error:', err);
      return undefined;
    }
  }

  public markPasswordResetTokenUsed(token: string) {
    if (!this.db || !token) return;
    try {
      this.db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);
    } catch (err) {
      console.error('[SQLite Database] markPasswordResetTokenUsed error:', err);
    }
  }

  // -----------------------------------------------------------
  // CASES TABLE
  // -----------------------------------------------------------
  public getAllCases(): any[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare('SELECT data_json FROM cases ORDER BY updated_at DESC').all() as { data_json: string }[];
      return rows.map((r) => JSON.parse(r.data_json));
    } catch (err) {
      console.error('[SQLite Database] getAllCases error:', err);
      return [];
    }
  }

  public getCaseById(id: string): any | undefined {
    if (!this.db) return undefined;
    try {
      const row = this.db.prepare('SELECT data_json FROM cases WHERE id = ? OR LOWER(case_number) = LOWER(?)').get(id, id) as { data_json: string } | undefined;
      return row ? JSON.parse(row.data_json) : undefined;
    } catch (err) {
      console.error('[SQLite Database] getCaseById error:', err);
      return undefined;
    }
  }

  public saveCase(c: any) {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO cases (id, case_number, first_name, last_name, status, priority, reported_by_user_id, reported_by_user_email, is_deleted, created_at, updated_at, data_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          case_number = excluded.case_number,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          status = excluded.status,
          priority = excluded.priority,
          reported_by_user_id = excluded.reported_by_user_id,
          reported_by_user_email = excluded.reported_by_user_email,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at,
          data_json = excluded.data_json
      `);

      stmt.run(
        c.id,
        c.caseNumber || null,
        c.firstName || null,
        c.lastName || null,
        c.status || 'MISSING',
        c.priority || 'MEDIUM',
        c.reportedByUserId || null,
        (c.reportedByUserEmail || '').toLowerCase(),
        c.is_deleted ? 1 : 0,
        c.reportedDate || new Date().toISOString(),
        c.lastUpdated || new Date().toISOString(),
        JSON.stringify(c)
      );
    } catch (err) {
      console.error('[SQLite Database] saveCase error:', err);
    }
  }

  // -----------------------------------------------------------
  // INVESTIGATOR REQUESTS TABLE
  // -----------------------------------------------------------
  public getAllInvestigatorRequests(): any[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare('SELECT data_json FROM investigator_requests ORDER BY request_date DESC').all() as { data_json: string }[];
      return rows.map((r) => JSON.parse(r.data_json));
    } catch (err) {
      console.error('[SQLite Database] getAllInvestigatorRequests error:', err);
      return [];
    }
  }

  public saveInvestigatorRequest(req: any) {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO investigator_requests (id, email, user_id, status, request_date, data_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          user_id = excluded.user_id,
          status = excluded.status,
          request_date = excluded.request_date,
          data_json = excluded.data_json
      `);

      stmt.run(
        req.id,
        (req.email || '').toLowerCase(),
        req.userId || null,
        req.status || 'PENDING',
        req.requestDate || new Date().toISOString(),
        JSON.stringify(req)
      );
    } catch (err) {
      console.error('[SQLite Database] saveInvestigatorRequest error:', err);
    }
  }

  public deleteInvestigatorRequest(id: string) {
    if (!this.db) return;
    try {
      this.db.prepare('DELETE FROM investigator_requests WHERE id = ?').run(id);
    } catch (err) {
      console.error('[SQLite Database] deleteInvestigatorRequest error:', err);
    }
  }

  // -----------------------------------------------------------
  // SIGHTINGS TABLE
  // -----------------------------------------------------------
  public getAllSightings(): any[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare('SELECT data_json FROM sightings ORDER BY created_at DESC').all() as { data_json: string }[];
      return rows.map((r) => JSON.parse(r.data_json));
    } catch (err) {
      console.error('[SQLite Database] getAllSightings error:', err);
      return [];
    }
  }

  public saveSighting(s: any) {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sightings (id, person_id, status, created_at, data_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          person_id = excluded.person_id,
          status = excluded.status,
          data_json = excluded.data_json
      `);

      stmt.run(
        s.id,
        s.personId || null,
        s.status || 'UNREVIEWED',
        s.timestamp || new Date().toISOString(),
        JSON.stringify(s)
      );
    } catch (err) {
      console.error('[SQLite Database] saveSighting error:', err);
    }
  }

  public deleteSighting(id: string) {
    if (!this.db) return;
    try {
      this.db.prepare('DELETE FROM sightings WHERE id = ?').run(id);
    } catch (err) {
      console.error('[SQLite Database] deleteSighting error:', err);
    }
  }

  // -----------------------------------------------------------
  // AUDIT LOGS TABLE
  // -----------------------------------------------------------
  public getAllAuditLogs(): any[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare('SELECT data_json FROM audit_logs ORDER BY timestamp DESC').all() as { data_json: string }[];
      return rows.map((r) => JSON.parse(r.data_json));
    } catch (err) {
      console.error('[SQLite Database] getAllAuditLogs error:', err);
      return [];
    }
  }

  public saveAuditLog(log: any) {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO audit_logs (id, timestamp, actor_id, actor_name, actor_role, action, entity_type, entity_id, status, details, ip_address, user_agent, data_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        log.id || `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        log.timestamp || new Date().toISOString(),
        log.actorId || null,
        log.actorName || null,
        log.actorRole || null,
        log.action || 'ACTION',
        log.entityType || null,
        log.entityId || null,
        log.status || 'SUCCESS',
        log.details || null,
        log.ipAddress || null,
        log.userAgent || null,
        JSON.stringify(log)
      );
    } catch (err) {
      console.error('[SQLite Database] saveAuditLog error:', err);
    }
  }

  // -----------------------------------------------------------
  // SYSTEM ALERTS TABLE
  // -----------------------------------------------------------
  public getAllAlerts(): any[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare('SELECT data_json FROM system_alerts ORDER BY created_at DESC').all() as { data_json: string }[];
      return rows.map((r) => JSON.parse(r.data_json));
    } catch (err) {
      console.error('[SQLite Database] getAllAlerts error:', err);
      return [];
    }
  }

  public saveAlert(a: any) {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO system_alerts (id, type, created_at, data_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json
      `);

      stmt.run(
        a.id,
        a.type || 'INFO',
        a.timestamp || new Date().toISOString(),
        JSON.stringify(a)
      );
    } catch (err) {
      console.error('[SQLite Database] saveAlert error:', err);
    }
  }

  // -----------------------------------------------------------
  // AUTH RATE LIMITS & SECURITY MONITORING
  // Note: Arbitrary account lockout has been removed so legitimate users
  // can retry their login without being locked out. Failed attempts are
  // still tracked in the database for audit and progressive throttle delays.
  // -----------------------------------------------------------
  public checkRateLimit(key: string): { isLocked: boolean; remainingSeconds: number; failedAttempts: number } {
    if (!this.db) return { isLocked: false, remainingSeconds: 0, failedAttempts: 0 };
    try {
      const row = this.db.prepare('SELECT failed_attempts, locked_until FROM auth_rate_limits WHERE rate_key = ?').get(key) as {
        failed_attempts: number;
        locked_until: number;
      } | undefined;

      if (!row) return { isLocked: false, remainingSeconds: 0, failedAttempts: 0 };

      // We do not hard-lock accounts. Return tracked attempts for monitoring.
      return { isLocked: false, remainingSeconds: 0, failedAttempts: row.failed_attempts || 0 };
    } catch (err) {
      console.error('[SQLite Database] checkRateLimit error:', err);
      return { isLocked: false, remainingSeconds: 0, failedAttempts: 0 };
    }
  }

  public recordFailedAttempt(key: string, _maxAttempts = 5, _lockDurationSeconds = 15 * 60): { isLocked: boolean; remainingSeconds: number; failedAttempts: number } {
    if (!this.db) return { isLocked: false, remainingSeconds: 0, failedAttempts: 1 };
    try {
      const now = Date.now();
      const row = this.db.prepare('SELECT failed_attempts FROM auth_rate_limits WHERE rate_key = ?').get(key) as {
        failed_attempts: number;
      } | undefined;

      const failedAttempts = (row?.failed_attempts || 0) + 1;

      const stmt = this.db.prepare(`
        INSERT INTO auth_rate_limits (rate_key, failed_attempts, locked_until, last_attempt)
        VALUES (?, ?, 0, ?)
        ON CONFLICT(rate_key) DO UPDATE SET
          failed_attempts = excluded.failed_attempts,
          locked_until = 0,
          last_attempt = excluded.last_attempt
      `);

      stmt.run(key, failedAttempts, now);

      // Account lockout is intentionally disabled: isLocked is false, remainingSeconds is 0
      return { isLocked: false, remainingSeconds: 0, failedAttempts };
    } catch (err) {
      console.error('[SQLite Database] recordFailedAttempt error:', err);
      return { isLocked: false, remainingSeconds: 0, failedAttempts: 1 };
    }
  }

  public resetRateLimit(key: string) {
    if (!this.db) return;
    try {
      this.db.prepare('DELETE FROM auth_rate_limits WHERE rate_key = ?').run(key);
    } catch (err) {
      console.error('[SQLite Database] resetRateLimit error:', err);
    }
  }

  // -----------------------------------------------------------
  // SYSTEM HEALTH & STATS
  // -----------------------------------------------------------
  public getStats(): DatabaseStats {
    let integrity = 'ok';
    let fileSizeBytes = 0;
    const tableCounts = {
      users: 0,
      cases: 0,
      investigator_requests: 0,
      sightings: 0,
      audit_logs: 0,
      system_alerts: 0,
      auth_rate_limits: 0,
    };

    try {
      if (fs.existsSync(SQLITE_FILE)) {
        fileSizeBytes = fs.statSync(SQLITE_FILE).size;
      }

      if (this.db) {
        const integrityCheck = this.db.prepare('PRAGMA integrity_check').get() as any;
        integrity = integrityCheck ? Object.values(integrityCheck)[0] as string : 'ok';

        tableCounts.users = (this.db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0;
        tableCounts.cases = (this.db.prepare('SELECT COUNT(*) as c FROM cases').get() as any)?.c || 0;
        tableCounts.investigator_requests = (this.db.prepare('SELECT COUNT(*) as c FROM investigator_requests').get() as any)?.c || 0;
        tableCounts.sightings = (this.db.prepare('SELECT COUNT(*) as c FROM sightings').get() as any)?.c || 0;
        tableCounts.audit_logs = (this.db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as any)?.c || 0;
        tableCounts.system_alerts = (this.db.prepare('SELECT COUNT(*) as c FROM system_alerts').get() as any)?.c || 0;
        tableCounts.auth_rate_limits = (this.db.prepare('SELECT COUNT(*) as c FROM auth_rate_limits').get() as any)?.c || 0;
      }
    } catch (err) {
      console.error('[SQLite Database] getStats error:', err);
    }

    return {
      engine: 'SQLite 3 (Embedded Relational Engine via node:sqlite)',
      version: 'Node.js DatabaseSync 22.x',
      filePath: SQLITE_FILE,
      fileSizeBytes,
      integrity,
      tableCounts,
      lastUpdated: new Date().toISOString(),
    };
  }
}

export const sqliteDb = new SqliteStorage();
