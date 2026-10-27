import { SightingLead, CurrentUser } from '../types';
import { getAuthHeaders } from './authService';

export async function fetchServerSightings(filter?: { personId?: string; status?: string }): Promise<SightingLead[]> {
  try {
    const params = new URLSearchParams();
    if (filter?.personId && filter.personId !== 'ALL') params.append('personId', filter.personId);
    if (filter?.status && filter.status !== 'ALL') params.append('status', filter.status);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/sightings${qs}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      console.warn(`Failed to fetch sightings (${res.status})`);
      return [];
    }
    const data = await res.json();
    return data.sightings || [];
  } catch (err) {
    console.error('Network error fetching sightings:', err);
    return [];
  }
}

export async function syncSightingCreation(newSighting: SightingLead, userOverride?: CurrentUser): Promise<SightingLead> {
  const res = await fetch('/api/sightings', {
    method: 'POST',
    headers: getAuthHeaders(userOverride),
    body: JSON.stringify(newSighting),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to submit sighting lead (${res.status})`);
  }
  const data = await res.json();
  return data.sighting || newSighting;
}

export async function syncSightingUpdate(
  id: string,
  updates: Partial<SightingLead>,
  userOverride?: CurrentUser
): Promise<SightingLead> {
  const res = await fetch(`/api/sightings/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders(userOverride),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update sighting lead (${res.status})`);
  }
  const data = await res.json();
  return data.sighting;
}

export async function syncSightingDeletion(id: string, userOverride?: CurrentUser): Promise<void> {
  const res = await fetch(`/api/sightings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(userOverride),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to delete sighting lead (${res.status})`);
  }
}
