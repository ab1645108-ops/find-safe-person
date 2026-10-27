import { MissingPerson, FoundConfirmationRecord, ReporterNotificationDelivery, SubjectCondition, ReunionStatus, CurrentUser } from '../types';
import { INITIAL_MISSING_PERSONS } from '../data/mockPersons';
import { getAuthHeaders } from './authService';

const STORAGE_KEY = 'findsafe_missing_cases_store_v3';

export function getLocalCases(): MissingPerson[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to read cases from localStorage:', err);
  }
  return INITIAL_MISSING_PERSONS;
}

export function saveLocalCases(cases: MissingPerson[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
  } catch (err) {
    console.warn('Failed to save cases to localStorage:', err);
  }
}

export async function fetchServerCases(userOverride?: CurrentUser): Promise<MissingPerson[]> {
  try {
    const res = await fetch('/api/cases', {
      headers: getAuthHeaders(userOverride),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.cases)) {
        saveLocalCases(data.cases);
        return data.cases;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch cases from server:', err);
  }
  return getLocalCases();
}

export async function fetchCitizenMyCases(userOverride?: CurrentUser): Promise<MissingPerson[]> {
  try {
    const res = await fetch('/api/my-cases', {
      headers: getAuthHeaders(userOverride),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.cases)) {
        return data.cases;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch citizen cases from server:', err);
  }
  return [];
}

export async function fetchCaseById(
  caseId: string,
  userOverride?: CurrentUser
): Promise<{ success: boolean; case?: MissingPerson; error?: string }> {
  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
      headers: getAuthHeaders(userOverride),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.error || `HTTP ${res.status}: Access denied or case not found.` };
    }
    return { success: true, case: data.case };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error fetching case.' };
  }
}

export async function syncCaseCreation(newCase: MissingPerson, userOverride?: CurrentUser): Promise<MissingPerson> {
  const res = await fetch('/api/cases', {
    method: 'POST',
    headers: getAuthHeaders(userOverride),
    body: JSON.stringify(newCase),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to create case (${res.status})`);
  }
  const data = await res.json();
  return data.case || newCase;
}

export async function syncCaseUpdate(updatedCase: MissingPerson, userOverride?: CurrentUser): Promise<MissingPerson> {
  const res = await fetch(`/api/cases/${encodeURIComponent(updatedCase.id)}`, {
    method: 'PUT',
    headers: getAuthHeaders(userOverride),
    body: JSON.stringify(updatedCase),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update case (${res.status})`);
  }
  const data = await res.json();
  return data.case || updatedCase;
}

export async function syncCaseDeletion(caseId: string, userOverride?: CurrentUser): Promise<void> {
  const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(userOverride),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to delete case (${res.status})`);
  }
  // Immediately update local cases store
  const local = getLocalCases();
  const filtered = local.filter((c) => c.id !== caseId && c.caseNumber !== caseId);
  saveLocalCases(filtered);
}

export interface ConfirmFoundPayload {
  foundLocation: string;
  foundAddress?: string;
  subjectCondition: SubjectCondition;
  reunionStatus: ReunionStatus;
  foundNotes: string;
  customNote?: string;
  notifyChannels?: {
    sms?: boolean;
    email?: boolean;
    inApp?: boolean;
  };
  caseData?: MissingPerson;
}

export interface ConfirmFoundResponse {
  success: boolean;
  case: MissingPerson;
  confirmation: FoundConfirmationRecord;
  notification: ReporterNotificationDelivery;
  message: string;
}

export async function confirmPersonFoundServer(
  caseId: string,
  payload: ConfirmFoundPayload,
  userOverride?: CurrentUser
): Promise<ConfirmFoundResponse> {
  const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/confirm-found`, {
    method: 'POST',
    headers: getAuthHeaders(userOverride),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to confirm case found (${res.status})`);
  }
  const data: ConfirmFoundResponse = await res.json();
  return data;
}

export async function fetchNotificationStatus(caseId: string): Promise<any> {
  const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/notification-status`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch notification status (${res.status})`);
  }
  return res.json();
}

export async function resendReporterNotificationServer(
  caseId: string,
  customNote?: string,
  userOverride?: CurrentUser
): Promise<{ success: boolean; case: MissingPerson; notification: ReporterNotificationDelivery; message: string }> {
  const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/resend-reporter-notification`, {
    method: 'POST',
    headers: getAuthHeaders(userOverride),
    body: JSON.stringify({ customNote }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to resend notification (${res.status})`);
  }
  return res.json();
}

export function subscribeCaseEvents(onEvent: (data: { event: string; payload: any }) => void): () => void {
  try {
    const eventSource = new EventSource('/api/cases/stream');
    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed && parsed.event && parsed.event !== 'CONNECTED') {
          onEvent(parsed);
        }
      } catch (err) {
        // ignore parse error
      }
    };
    eventSource.onerror = () => {
      // EventSource auto-reconnects
    };
    return () => {
      eventSource.close();
    };
  } catch (err) {
    console.warn('SSE subscription unavailable:', err);
    return () => {};
  }
}
