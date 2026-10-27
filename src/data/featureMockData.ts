import {
  CurrentUser,
  SystemAlert,
  DuplicateCaseFlag,
  AuditLogEntry,
  MissingPerson
} from '../types';

export const SYSTEM_USERS: CurrentUser[] = [
  {
    id: 'usr_investigator_1',
    name: 'Investigator',
    email: 'investigator@findsafe.ai',
    role: 'INVESTIGATOR',
    badgeNumber: 'INV-4108',
    agency: 'Special Investigations Unit',
  },
  {
    id: 'usr_public_1',
    name: 'Public User',
    email: 'public@findsafe.ai',
    role: 'PUBLIC_USER',
    agency: 'Community Reporting Desk',
  },
];

export const INITIAL_SYSTEM_ALERTS: SystemAlert[] = [];
export const DUPLICATE_CANDIDATE_CASE: MissingPerson | null = null;
export const INITIAL_DUPLICATE_FLAGS: DuplicateCaseFlag[] = [];
export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [];
