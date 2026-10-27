import React, { useState, useEffect } from 'react';
import { MissingPerson, SightingLead, CurrentUser, UserAccount } from './types';
import { INITIAL_MISSING_PERSONS, INITIAL_SIGHTINGS } from './data/mockPersons';
import { SYSTEM_USERS } from './data/featureMockData';
import { Navbar } from './components/Navbar';
import { PublicPortal } from './components/PublicPortal';
import { SightingScanner } from './components/SightingScanner';
import { CaseRegistry } from './components/CaseRegistry';
import { AlertPackageGenerator } from './components/AlertPackageGenerator';
import { AssistantChat } from './components/AssistantChat';
import { ReportPersonModal } from './components/ReportPersonModal';
import { SubmitSightingModal } from './components/SubmitSightingModal';
import { PrintableFlyerModal } from './components/PrintableFlyerModal';
import { AlertsHub } from './components/AlertsHub';
import { DuplicateCaseReview } from './components/DuplicateCaseReview';
import { SecurityAuditModal } from './components/SecurityAuditModal';
import { AuthModal, LoginOption } from './components/AuthModal';
import { AuthGate } from './components/AuthGate';
import { UserProfileModal } from './components/UserProfileModal';
import { AdminUserManagement } from './components/AdminUserManagement';
import { AccessDeniedBanner } from './components/AccessDeniedBanner';
import { checkAuthMe, logoutUser, getStoredUser, adminFetchInvestigatorRequests } from './services/authService';
import { fetchServerCases, syncCaseCreation, syncCaseUpdate, syncCaseDeletion, subscribeCaseEvents, getLocalCases, saveLocalCases } from './services/caseService';
import { fetchServerSightings, syncSightingCreation, syncSightingUpdate, syncSightingDeletion } from './services/sightingService';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { Bell, ShieldAlert } from 'lucide-react';

function AppContent() {
  const [activeTab, setActiveTab] = useState<
    'scanner' | 'cases' | 'alerts' | 'duplicates' | 'assistant' | 'users'
  >('cases');
  const [missingPersons, setMissingPersons] = useState<MissingPerson[]>(INITIAL_MISSING_PERSONS);
  const [sightings, setSightings] = useState<SightingLead[]>(INITIAL_SIGHTINGS);

  // Authenticated user state - must register or log in first before entering
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => getStoredUser());
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);

  // Auth & Profile Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [authModalOption, setAuthModalOption] = useState<LoginOption>('CITIZEN');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Modals & Navigation Contexts
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSightingModalOpen, setIsSightingModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [flyerPerson, setFlyerPerson] = useState<MissingPerson | null>(null);
  const [scannerPersonId, setScannerPersonId] = useState<string | undefined>(undefined);
  const [activeTargetPerson, setActiveTargetPerson] = useState<MissingPerson | undefined>(undefined);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Restore authenticated session, initial cases, and sightings on mount
  useEffect(() => {
    async function restoreSessionAndCases() {
      const stored = getStoredUser();
      let activeUser: CurrentUser | null = stored;
      try {
        const verified = await checkAuthMe();
        if (verified) {
          activeUser = verified;
          setCurrentUser(verified);
        } else if (stored) {
          setCurrentUser(stored);
        } else {
          activeUser = null;
          setCurrentUser(null);
        }
      } catch (err) {
        console.warn('Session verification error:', err);
        if (stored) {
          activeUser = stored;
          setCurrentUser(stored);
        } else {
          activeUser = null;
          setCurrentUser(null);
        }
      } finally {
        setIsCheckingSession(false);
      }

      if (activeUser) {
        try {
          const serverData = await fetchServerCases(activeUser);
          if (serverData && Array.isArray(serverData)) {
            setMissingPersons(serverData);
          }
        } catch (err) {
          console.warn('Failed to load initial cases from database:', err);
        }

        try {
          const serverSightings = await fetchServerSightings();
          if (serverSightings && Array.isArray(serverSightings)) {
            setSightings(serverSightings);
          }
        } catch (err) {
          console.warn('Failed to load sightings from database:', err);
        }

        if (activeUser.role === 'ADMIN') {
          try {
            const reqRes = await adminFetchInvestigatorRequests({ status: 'PENDING' });
            if (typeof reqRes.pendingCount === 'number') {
              setPendingRequestsCount(reqRes.pendingCount);
            }
          } catch (e) {
            console.warn('Failed to fetch pending requests count:', e);
          }
        }
      }
    }

    restoreSessionAndCases();

    const unsubscribe = subscribeCaseEvents((data) => {
      const { event, payload } = data;
      if (event === 'CASE_CREATED') {
        setMissingPersons((prev) => [payload, ...prev.filter((p) => p.id !== payload.id && p.caseNumber !== payload.caseNumber)]);
      } else if (event === 'CASE_UPDATED' || event === 'CASE_RESTORED') {
        setMissingPersons((prev) => prev.map((p) => (p.id === payload.id ? payload : p)));
      } else if (event === 'CASE_ARCHIVED' || event === 'CASE_DELETED') {
        const targetId = payload?.id || payload?.caseId || payload;
        setMissingPersons((prev) => prev.filter((p) => p.id !== targetId && p.caseNumber !== targetId));
      } else if (event === 'SIGHTING_CREATED') {
        setSightings((prev) => [payload, ...prev.filter((s) => s.id !== payload.id)]);
      } else if (event === 'SIGHTING_UPDATED') {
        setSightings((prev) => prev.map((s) => (s.id === payload.id ? payload : s)));
      } else if (event === 'SIGHTING_DELETED') {
        const targetId = payload?.id || payload;
        setSightings((prev) => prev.filter((s) => s.id !== targetId));
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const loadCasesForUser = async (user?: CurrentUser | null) => {
    if (!user) return;
    try {
      const serverData = await fetchServerCases(user);
      if (serverData && Array.isArray(serverData)) {
        setMissingPersons(serverData);
      }
    } catch (err) {
      console.warn('Failed to refresh cases from database:', err);
    }
  };

  const handleLoginSuccess = async (user: UserAccount) => {
    setCurrentUser(user);
    showToast(`Welcome back, ${user.name} (${user.role}). Access granted.`);
    await loadCasesForUser(user);

    // Role-based redirect
    if (user.role === 'ADMIN') {
      setActiveTab('users');
    } else if (user.role === 'INVESTIGATOR') {
      setActiveTab('cases');
    } else {
      setActiveTab('cases');
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    showToast('Signed out securely. Please log in or register to enter FindSafe.');
  };

  const handleVerifyCase = (personId: string, notes: string) => {
    if (!currentUser) return;
    const actorBadge = currentUser.badgeNumber ? ` (${currentUser.badgeNumber})` : '';
    const verifiedByStr = `${currentUser.name}${actorBadge}`;
    const now = new Date().toISOString();
    setMissingPersons((prev) =>
      prev.map((p) => {
        if (p.id === personId) {
          const updated: MissingPerson = {
            ...p,
            isVerified: true,
            verifiedBy: verifiedByStr,
            verifiedAt: now,
            verificationNotes: notes,
            publicStatusStage: 'VERIFIED',
            updated_at: now,
          };
          syncCaseUpdate(updated, currentUser).catch(console.error);
          return updated;
        }
        return p;
      })
    );
    showToast(`Case verified with official SAR stamp by ${currentUser.name}.`);
  };

  const handleAddPerson = async (newPerson: MissingPerson) => {
    if (!currentUser) return;
    try {
      const savedCase = await syncCaseCreation(newPerson, currentUser);
      const caseToUse = savedCase || newPerson;
      setMissingPersons((prev) => [caseToUse, ...prev.filter((p) => p.id !== caseToUse.id)]);
      showToast(`Case #${caseToUse.caseNumber || caseToUse.id} registered and permanently saved to database.`);
    } catch (err: any) {
      console.error('Failed to register case:', err);
      showToast(`Error saving case to database: ${err.message}`);
    }
    setActiveTab('cases');
  };

  const handleLeadVerified = async (newLead: SightingLead) => {
    if (!currentUser) return;
    // 1. Optimistic UI update
    setSightings((prev) => [newLead, ...prev.filter((s) => s.id !== newLead.id)]);
    
    // 2. Sync to database
    try {
      const saved = await syncSightingCreation(newLead, currentUser);
      if (saved) {
        setSightings((prev) => [saved, ...prev.filter((s) => s.id !== saved.id && s.id !== newLead.id)]);
      }
      showToast(
        newLead.isFoundPersonReport 
          ? `Found Person Report logged for ${newLead.personName} and sent to Admin & Investigator Command.`
          : `Lead logged: Verified sighting for ${newLead.personName} sent to Admin & Investigator portal.`
      );
    } catch (err: any) {
      console.error('Failed to sync sighting to backend:', err);
      showToast(`Lead saved locally: ${err.message}`);
    }
  };

  const handleUpdateLead = async (leadId: string, updates: Partial<SightingLead>) => {
    if (!currentUser) return;
    setSightings((prev) => prev.map((s) => (s.id === leadId ? { ...s, ...updates } : s)));
    try {
      const updated = await syncSightingUpdate(leadId, updates, currentUser);
      if (updated) {
        setSightings((prev) => prev.map((s) => (s.id === leadId ? updated : s)));
      }
      showToast(`Lead #${leadId} updated.`);
    } catch (err: any) {
      console.error('Failed to update lead:', err);
      showToast(`Failed to update lead: ${err.message}`);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!currentUser) return;
    setSightings((prev) => prev.filter((s) => s.id !== leadId));
    try {
      await syncSightingDeletion(leadId, currentUser);
      showToast(`Lead #${leadId} removed.`);
    } catch (err: any) {
      console.error('Failed to delete lead:', err);
      showToast(`Failed to delete lead: ${err.message}`);
    }
  };

  const handleCasesMerged = (primaryId: string, candidateId: string) => {
    setMissingPersons((prev) => {
      const candidate = prev.find((p) => p.id === candidateId);
      return prev
        .filter((p) => p.id !== candidateId)
        .map((p) => {
          if (p.id === primaryId && candidate) {
            const merged = {
              ...p,
              summary: `${p.summary} [Merged supplementary intel from Case #${candidate.caseNumber}: ${candidate.summary}]`,
              medicalConditions: Array.from(
                new Set([...(p.medicalConditions || []), ...(candidate.medicalConditions || [])])
              ),
            };
            syncCaseUpdate(merged);
            syncCaseDeletion(candidateId);
            return merged;
          }
          return p;
        });
    });
    showToast(`Dossier #${candidateId} merged into Primary Case #${primaryId}. Duplicate removed from active registry.`);
  };

  const handleScanForPerson = (personId: string) => {
    setScannerPersonId(personId);
    setActiveTab('scanner');
  };

  const handleGenerateAlertsForPerson = (person: MissingPerson) => {
    setActiveTargetPerson(person);
    setActiveTab('alerts');
  };

  const handleMarkStatus = async (personId: string, newStatus: 'Active' | 'Located Safe') => {
    if (!currentUser) return;
    const target = missingPersons.find(p => p.id === personId);
    if (!target) return;
    const now = new Date().toISOString();
    const updated: MissingPerson = { ...target, status: newStatus, updated_at: now };
    setMissingPersons((prev) =>
      prev.map((p) => (p.id === personId ? updated : p))
    );
    try {
      await syncCaseUpdate(updated, currentUser);
      showToast(`Case updated: ${newStatus}`);
    } catch (err: any) {
      showToast(`Failed to update status in database: ${err.message}`);
    }
  };

  const handleUpdatePerson = async (updatedPerson: MissingPerson) => {
    if (!currentUser) return;
    setMissingPersons((prev) =>
      prev.map((p) => (p.id === updatedPerson.id ? updatedPerson : p))
    );
    try {
      const saved = await syncCaseUpdate(updatedPerson, currentUser);
      if (saved) {
        setMissingPersons((prev) =>
          prev.map((p) => (p.id === saved.id ? saved : p))
        );
      }
      showToast(`Case #${updatedPerson.caseNumber || updatedPerson.id} (${updatedPerson.name}) updated successfully.`);
    } catch (err: any) {
      showToast(`Failed to save update to database: ${err.message}`);
    }
  };

  const handleDeletePerson = async (personId: string) => {
    if (!currentUser) return;
    // 1. Instantly remove from local memory/state
    setMissingPersons((prev) => prev.filter((p) => p.id !== personId && p.caseNumber !== personId));
    
    // 2. Instantly update localStorage
    try {
      const local = getLocalCases();
      saveLocalCases(local.filter((c) => c.id !== personId && c.caseNumber !== personId));
    } catch (e) {
      console.warn('Failed to update localStorage on delete:', e);
    }

    // 3. Sync to backend database
    try {
      await syncCaseDeletion(personId, currentUser);
      showToast(`Case successfully deleted and removed from the active registry.`);
    } catch (err: any) {
      console.error('Failed to delete case from database:', err);
      showToast(`Failed to delete case from database: ${err.message}`);
      loadCasesForUser(currentUser);
    }
  };

  const handleOpenPrintFlyer = (person: MissingPerson) => {
    setFlyerPerson(person);
  };

  const handleSwitchUser = (user: CurrentUser) => {
    setCurrentUser(user);
    showToast(`Active persona switched to ${user.name} (${user.role}).`);
  };

  const { theme, isLight } = useTheme();

  const getContainerBg = () => {
    if (theme === 'ocean') {
      return 'bg-ambient-ocean text-slate-100 selection:bg-cyan-500 selection:text-white';
    }
    if (theme === 'daylight') {
      return 'bg-ambient-daylight text-slate-900 selection:bg-blue-600 selection:text-white';
    }
    return 'bg-ambient-aurora text-slate-100 selection:bg-indigo-500 selection:text-white';
  };

  // 1. Session verification splash
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 p-4">
        <div className="flex flex-col items-center gap-4 animate-in fade-in">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-rose-500 flex items-center justify-center shadow-xl shadow-indigo-950/80 animate-pulse">
            <ShieldAlert className="w-8 h-8 text-white" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold tracking-tight">FindSafe Platform</h2>
            <p className="text-xs text-slate-400 font-mono mt-1">Verifying encrypted security session & database...</p>
          </div>
          <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden mt-2">
            <div className="w-1/2 h-full bg-indigo-500 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // 2. Authentication Gate: Users must register or log in first before entering the website
  if (!currentUser) {
    return (
      <>
        <AuthGate onLoginSuccess={handleLoginSuccess} />
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 shadow-2xl text-xs animate-in slide-in-from-bottom-3">
            <Bell className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`min-h-screen ${getContainerBg()} flex flex-col font-sans relative overflow-x-hidden transition-colors duration-300`}>
      {/* Pleasant Multi-Color Ambient Lights */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
        {theme === 'daylight' ? (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-500/10 blur-[100px]" />
            <div className="absolute top-1/4 -right-32 w-96 h-96 rounded-full bg-indigo-500/10 blur-[100px]" />
            <div className="absolute bottom-20 left-1/3 w-80 h-80 rounded-full bg-emerald-500/08 blur-[90px]" />
            <div className="absolute -bottom-20 right-1/4 w-80 h-80 rounded-full bg-amber-500/08 blur-[90px]" />
            <div className="absolute inset-0 bg-grid-pleasant-daylight opacity-40" />
          </>
        ) : theme === 'ocean' ? (
          <>
            <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-cyan-500/12 blur-[120px]" />
            <div className="absolute top-1/4 -right-40 w-[450px] h-[450px] rounded-full bg-indigo-500/12 blur-[120px]" />
            <div className="absolute top-2/3 -left-32 w-[400px] h-[400px] rounded-full bg-blue-500/10 blur-[110px]" />
            <div className="absolute -bottom-20 right-1/4 w-[420px] h-[420px] rounded-full bg-emerald-500/08 blur-[110px]" />
            <div className="absolute inset-0 bg-grid-pleasant opacity-30" />
          </>
        ) : (
          <>
            <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-blue-500/12 blur-[120px]" />
            <div className="absolute top-1/4 -right-40 w-[450px] h-[450px] rounded-full bg-violet-500/12 blur-[120px]" />
            <div className="absolute top-2/3 -left-32 w-[400px] h-[400px] rounded-full bg-emerald-500/08 blur-[110px]" />
            <div className="absolute -bottom-20 right-1/4 w-[420px] h-[420px] rounded-full bg-amber-500/08 blur-[110px]" />
            <div className="absolute inset-0 bg-grid-pleasant opacity-30" />
          </>
        )}
      </div>

      {/* Navigation Header */}
      <div className="relative z-40">
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenReportModal={() => setIsReportModalOpen(true)}
          onOpenSightingModal={() => setIsSightingModalOpen(true)}
          activeCasesCount={missingPersons.filter((p) => p.status === 'Active').length}
          pendingLeadsCount={sightings.filter((s) => s.status === 'High Priority').length}
          currentUser={currentUser}
          onSwitchUser={handleSwitchUser}
          onOpenAuditModal={() => setIsAuditModalOpen(true)}
          onOpenProfileModal={() => setIsProfileModalOpen(true)}
          onOpenAuthModal={(option) => {
            if (option) setAuthModalOption(option);
            setAuthModalMode('login');
            setIsAuthModalOpen(true);
          }}
          onLogout={handleLogout}
          unreadAlertsCount={2}
          pendingInvestigatorRequestsCount={pendingRequestsCount}
        />
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 relative z-10">
        {(currentUser.role === 'PUBLIC_USER' || currentUser.role === 'CITIZEN') ? (
          <>
            {activeTab === 'users' && (
              <AccessDeniedBanner
                requiredRole="Administrator"
                currentRole={currentUser.role}
                onGoBack={() => setActiveTab('cases')}
                onLoginPrompt={() => {
                  setAuthModalOption('ADMIN');
                  setAuthModalMode('login');
                  setIsAuthModalOpen(true);
                }}
              />
            )}

            {(activeTab === 'alerts' || activeTab === 'duplicates' || activeTab === 'scanner' || activeTab === 'assistant') && (
              <AccessDeniedBanner
                requiredRole="Investigator or Administrator"
                currentRole={currentUser.role}
                onGoBack={() => setActiveTab('cases')}
                onLoginPrompt={() => {
                  setAuthModalOption('INVESTIGATOR');
                  setAuthModalMode('login');
                  setIsAuthModalOpen(true);
                }}
              />
            )}

            {activeTab !== 'users' && activeTab !== 'alerts' && activeTab !== 'duplicates' && activeTab !== 'scanner' && activeTab !== 'assistant' && (
              <PublicPortal
                missingPersons={missingPersons}
                sightings={sightings}
                onOpenReportModal={() => setIsReportModalOpen(true)}
                onOpenSightingModal={(preselectedPersonId) => {
                  setScannerPersonId(preselectedPersonId);
                  setIsSightingModalOpen(true);
                }}
                onOpenPrintFlyer={(person) => handleOpenPrintFlyer(person)}
                currentUser={currentUser}
                onSwitchToOfficial={() => {
                  setAuthModalOption('INVESTIGATOR');
                  setAuthModalMode('login');
                  setIsAuthModalOpen(true);
                }}
                onLeadVerified={handleLeadVerified}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                preselectedPersonId={scannerPersonId}
                onUpdatePerson={handleUpdatePerson}
                onDeletePerson={handleDeletePerson}
              />
            )}
          </>
        ) : (
          <>
            {activeTab === 'users' && (
              currentUser.role === 'ADMIN' ? (
                <AdminUserManagement
                  currentUser={currentUser}
                  onOpenAuditLogs={() => setIsAuditModalOpen(true)}
                />
              ) : (
                <AccessDeniedBanner
                  requiredRole="Administrator"
                  currentRole={currentUser.role}
                  onGoBack={() => setActiveTab('cases')}
                />
              )
            )}

            {activeTab === 'cases' && (
              <CaseRegistry
                missingPersons={missingPersons}
                sightings={sightings}
                onSelectPerson={(person) => setActiveTargetPerson(person)}
                onScanForPerson={handleScanForPerson}
                onGenerateAlertsForPerson={handleGenerateAlertsForPerson}
                onPrintFlyer={(person) => handleOpenPrintFlyer(person)}
                onMarkStatus={handleMarkStatus}
                currentUser={currentUser}
                onVerifyCase={handleVerifyCase}
                onUpdatePerson={handleUpdatePerson}
                onDeletePerson={handleDeletePerson}
              />
            )}

            {activeTab === 'scanner' && (
              <SightingScanner
                missingPersons={missingPersons}
                sightings={sightings}
                onLeadVerified={handleLeadVerified}
                onUpdateLead={handleUpdateLead}
                onDeleteLead={handleDeleteLead}
                onSelectPerson={(person) => {
                  setActiveTargetPerson(person);
                  setActiveTab('cases');
                }}
                onConfirmPersonFound={(person) => handleMarkStatus(person.id, 'Located Safe')}
                preselectedPersonId={scannerPersonId}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'alerts' && (
              <AlertsHub
                missingPersons={missingPersons}
                currentUser={currentUser}
                onGenerateFlyer={(person: MissingPerson) => handleOpenPrintFlyer(person)}
              />
            )}

            {activeTab === 'duplicates' && (
              <DuplicateCaseReview
                missingPersons={missingPersons}
                currentUser={currentUser}
                onCasesMerged={handleCasesMerged}
                onUpdateCases={(updated: MissingPerson[]) => setMissingPersons(updated)}
              />
            )}

            {activeTab === 'assistant' && (
              <AssistantChat
                missingPersons={missingPersons}
                activePerson={activeTargetPerson}
              />
            )}
          </>
        )}
      </main>

      {/* Persistent Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-6 text-xs text-slate-400 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${currentUser.role === 'PUBLIC_USER' || currentUser.role === 'CITIZEN' ? 'bg-blue-400' : 'bg-rose-500'}`} />
            <span className="font-semibold text-slate-200">
              {currentUser.role === 'PUBLIC_USER' || currentUser.role === 'CITIZEN'
                ? 'FindSafe Public Community Safety & Reporting Portal' 
                : 'FindSafe Enterprise SAR Operations & Forensics System'}
            </span>
            <span>• {currentUser.role === 'PUBLIC_USER' || currentUser.role === 'CITIZEN' ? 'Public Citizen Access' : 'AI Detection & Law Enforcement Intelligence'}</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
            <span>ROLE: {currentUser.role}</span>
            <span>•</span>
            <span>{currentUser.role === 'PUBLIC_USER' || currentUser.role === 'CITIZEN' ? 'DATA PRIVACY COMPLIANT' : 'CJIS COMPLIANT'}</span>
          </div>
        </div>
      </footer>

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 shadow-2xl text-xs animate-in slide-in-from-bottom-3">
          <Bell className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      {isReportModalOpen && (
        <ReportPersonModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          onSubmit={handleAddPerson}
          currentUser={currentUser}
        />
      )}

      {isSightingModalOpen && (
        <SubmitSightingModal
          isOpen={isSightingModalOpen}
          onClose={() => {
            setIsSightingModalOpen(false);
            setScannerPersonId(undefined);
          }}
          missingPersons={missingPersons}
          onSubmitLead={handleLeadVerified}
          currentUser={currentUser}
          preselectedPersonId={scannerPersonId}
        />
      )}

      {flyerPerson && (
        <PrintableFlyerModal
          person={flyerPerson}
          onClose={() => setFlyerPerson(null)}
        />
      )}

      {isAuditModalOpen && (
        <SecurityAuditModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          currentUser={currentUser}
        />
      )}

      {/* Authentication & Profile Modals */}
      {isAuthModalOpen && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onLoginSuccess={handleLoginSuccess}
          initialMode={authModalMode}
          initialOption={authModalOption}
        />
      )}

      {isProfileModalOpen && (
        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          currentUser={currentUser}
          onProfileUpdated={(updated) => {
            setCurrentUser(updated);
            showToast('Profile updated successfully.');
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </ThemeProvider>
  );
}
