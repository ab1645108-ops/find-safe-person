import { UserAccount, UserRole, AccountStatus, AuditLogEntry, CurrentUser, InvestigatorRequest } from '../types';

const TOKEN_KEY = 'findsafe_auth_token';
const USER_KEY = 'findsafe_auth_user';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): UserAccount | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: UserAccount) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.error('Failed to save auth session to localStorage', err);
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (err) {
    console.error('Failed to clear auth session', err);
  }
}

export function getAuthHeaders(userOverride?: CurrentUser | UserAccount): HeadersInit {
  const token = getStoredToken();
  const user = userOverride || getStoredUser() || { id: 'usr_inv_01', name: 'Detective Sarah Jenkins', role: 'INVESTIGATOR' as UserRole, email: 's.jenkins@findsafe.ai' };
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (user) {
    headers['x-user-id'] = user.id;
    headers['x-user-role'] = user.role;
    headers['x-user-name'] = user.name;
    if ((user as any).email) {
      headers['x-user-email'] = (user as any).email;
    }
  }
  return headers;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: UserAccount;
  error?: string;
  code?: string;
  rejectionReason?: string;
  status?: string;
}

export interface RegisterResponse {
  success: boolean;
  message?: string;
  user?: UserAccount;
  error?: string;
}

export async function loginUser(email: string, password: string, expectedRole?: UserRole): Promise<LoginResponse> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, expectedRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { 
        success: false, 
        error: data.error || 'Login failed. Please check credentials.',
        code: data.code,
        rejectionReason: data.rejectionReason,
        status: data.status,
      };
    }
    if (data.token && data.user) {
      setSession(data.token, data.user);
    }
    return { success: true, token: data.token, user: data.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during authentication.' };
  }
}

export async function submitInvestigatorRequest(data: {
  name: string;
  email: string;
  phone: string;
  organization: string;
  investigatorId?: string;
  password: string;
  confirmPassword?: string;
  additionalInfo?: string;
}): Promise<{ success: boolean; requestId?: string; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/auth/investigator-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const resData = await res.json();
    if (!res.ok) {
      return { success: false, error: resData.error || 'Failed to submit investigator request.' };
    }
    return {
      success: true,
      requestId: resData.requestId,
      message: resData.message || 'Your Investigator access request has been submitted and is waiting for Admin approval.',
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error submitting request.' };
  }
}

export async function checkInvestigatorStatus(email: string): Promise<{
  status?: string;
  requestId?: string;
  name?: string;
  organization?: string;
  rejectionReason?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/auth/investigator-requests/status?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!res.ok) {
      return { error: data.error || 'Failed to query status.' };
    }
    return data;
  } catch (err: any) {
    return { error: err.message || 'Network error checking request status.' };
  }
}

export async function registerUser(
  name: string,
  email: string,
  password: string,
  confirmPassword?: string
): Promise<RegisterResponse> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, confirmPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Registration failed.' };
    }
    return { success: true, message: data.message, user: data.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during registration.' };
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch {
    // Ignore network error on logout
  } finally {
    clearSession();
  }
}

export async function checkAuthMe(): Promise<UserAccount | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/me', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      // Token is invalid or expired
      clearSession();
      return null;
    }
    const data = await res.json();
    if (data.user) {
      setSession(token, data.user);
      return data.user;
    }
    return null;
  } catch {
    return getStoredUser();
  }
}

export async function updateProfile(data: {
  name?: string;
  phone?: string;
  organization?: string;
  agency?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const resData = await res.json();
    if (!res.ok) {
      return { success: false, error: resData.error || 'Failed to update profile.' };
    }
    if (resData.user) {
      const token = getStoredToken();
      if (token) setSession(token, resData.user);
    }
    return { success: true, user: resData.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating profile.' };
  }
}

// -------------------------------------------------------------
// Admin User Management Services
// -------------------------------------------------------------

export async function adminFetchUsers(params?: {
  search?: string;
  role?: string;
  status?: string;
}): Promise<{ users: UserAccount[]; error?: string }> {
  try {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.role && params.role !== 'ALL') query.set('role', params.role);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    const res = await fetch(`/api/admin/users?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      return { users: [], error: data.error || 'Failed to load users.' };
    }
    return { users: data.users || [] };
  } catch (err: any) {
    return { users: [], error: err.message || 'Network error fetching users.' };
  }
}

export async function adminUpdateRole(
  userId: string,
  role: UserRole
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to update role.' };
    }
    return { success: true, user: data.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating user role.' };
  }
}

export async function adminUpdateStatus(
  userId: string,
  status: AccountStatus
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    const res = await fetch(`/api/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to update status.' };
    }
    return { success: true, user: data.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating user status.' };
  }
}

export async function adminEditUserDetails(
  userId: string,
  details: {
    name?: string;
    email?: string;
    badgeNumber?: string;
    agency?: string;
    organization?: string;
    phone?: string;
  }
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(details),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to edit user details.' };
    }
    return { success: true, user: data.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error editing user details.' };
  }
}

export async function adminFetchAuditLogs(): Promise<{ auditLogs: AuditLogEntry[]; error?: string }> {
  try {
    const res = await fetch('/api/audit-logs', {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      return { auditLogs: [], error: data.error || 'Failed to load audit logs.' };
    }
    return { auditLogs: data.auditLogs || [] };
  } catch (err: any) {
    return { auditLogs: [], error: err.message || 'Network error fetching audit logs.' };
  }
}

export async function adminFetchInvestigatorRequests(filter?: {
  status?: string;
}): Promise<{ requests: InvestigatorRequest[]; pendingCount: number; error?: string }> {
  try {
    const url = filter?.status && filter.status !== 'ALL'
      ? `/api/admin/investigator-requests?status=${encodeURIComponent(filter.status)}`
      : '/api/admin/investigator-requests';
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      return { requests: [], pendingCount: 0, error: data.error || 'Failed to load investigator requests.' };
    }
    return { requests: data.requests || [], pendingCount: data.pendingCount || 0 };
  } catch (err: any) {
    return { requests: [], pendingCount: 0, error: err.message || 'Network error fetching investigator requests.' };
  }
}

export async function adminApproveInvestigatorRequest(
  requestId: string
): Promise<{ success: boolean; message?: string; request?: InvestigatorRequest; error?: string }> {
  try {
    const res = await fetch(`/api/admin/investigator-requests/${requestId}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to approve request.' };
    }
    return { success: true, message: data.message, request: data.request };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error approving investigator request.' };
  }
}

export async function adminRejectInvestigatorRequest(
  requestId: string,
  reason?: string
): Promise<{ success: boolean; message?: string; request?: InvestigatorRequest; error?: string }> {
  try {
    const res = await fetch(`/api/admin/investigator-requests/${requestId}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to reject request.' };
    }
    return { success: true, message: data.message, request: data.request };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error rejecting investigator request.' };
  }
}

export async function adminRevokeInvestigatorAccess(
  requestIdOrUserId: string,
  reason?: string,
  actionType: 'suspend' | 'revoke' = 'revoke'
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`/api/admin/investigator-requests/${requestIdOrUserId}/revoke`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason, actionType }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to revoke/suspend access.' };
    }
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error revoking investigator access.' };
  }
}
