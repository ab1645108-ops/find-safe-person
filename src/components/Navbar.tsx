import React, { useState } from 'react';
import { 
  ShieldAlert, Eye, Users, Compass, Megaphone, MessageSquareText, 
  PlusCircle, Radio, Camera, GitMerge, ShieldCheck, UserCheck, ChevronDown, Lock,
  Sparkles, LogOut, User, User as UserIcon, Shield, UserCog, LogIn 
} from 'lucide-react';
import { CurrentUser, UserRole } from '../types';
import { SYSTEM_USERS } from '../data/featureMockData';
import { LoginOption } from './AuthModal';
import { ThemeSelector } from './ThemeSelector';
import { LanguageSelector } from './LanguageSelector';
import { useLanguage } from '../context/LanguageContext';

interface NavbarProps {
  activeTab: 'scanner' | 'cases' | 'alerts' | 'duplicates' | 'assistant' | 'users';
  setActiveTab: (tab: 'scanner' | 'cases' | 'alerts' | 'duplicates' | 'assistant' | 'users') => void;
  onOpenReportModal: () => void;
  onOpenSightingModal: () => void;
  activeCasesCount: number;
  pendingLeadsCount: number;
  currentUser: CurrentUser;
  onSwitchUser: (user: CurrentUser) => void;
  onOpenAuditModal: () => void;
  onOpenProfileModal?: () => void;
  onOpenAuthModal?: (option?: LoginOption) => void;
  onLogout?: () => void;
  unreadAlertsCount?: number;
  pendingInvestigatorRequestsCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenReportModal,
  onOpenSightingModal,
  activeCasesCount,
  pendingLeadsCount,
  currentUser,
  onSwitchUser,
  onOpenAuditModal,
  onOpenProfileModal,
  onOpenAuthModal,
  onLogout,
  unreadAlertsCount = 2,
  pendingInvestigatorRequestsCount = 3,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { dict } = useLanguage();

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'INVESTIGATOR':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'CITIZEN':
      case 'PUBLIC_USER':
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  const isPublic = currentUser.role === 'PUBLIC_USER' || currentUser.role === 'CITIZEN';

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-slate-100 shadow-md">
      {/* Emergency Global Ticker Bar */}
      <div className={`border-b px-4 py-1.5 text-xs flex items-center justify-between backdrop-blur-md ${
        isPublic 
          ? 'bg-slate-900/90 border-blue-500/20 text-slate-200' 
          : 'bg-slate-900/90 border-rose-500/20 text-slate-200'
      }`}>
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={`flex h-2 w-2 rounded-full animate-ping shrink-0 ${isPublic ? 'bg-blue-400' : 'bg-rose-500'}`} />
          <span className={`font-semibold uppercase tracking-wider text-[11px] shrink-0 font-mono ${isPublic ? 'text-blue-300' : 'text-rose-300'}`}>
            {isPublic ? dict.nav.publicDesk : dict.nav.sarTerminal}
          </span>
          <span className="truncate text-xs text-slate-300">
            {isPublic
              ? dict.nav.publicTicker
              : dict.nav.sarTicker}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] shrink-0">
          {!isPublic ? (
            <button
              onClick={onOpenAuditModal}
              className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{dict.nav.rbacAudit}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAuthModal && onOpenAuthModal('CITIZEN')}
                className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold transition"
              >
                <User className="w-3 h-3" />
                <span>{dict.nav.citizenLogin}</span>
              </button>
              <span className="text-slate-600">•</span>
              <button
                onClick={() => onOpenAuthModal && onOpenAuthModal('INVESTIGATOR')}
                className="flex items-center gap-1 text-blue-300 hover:text-blue-200 font-semibold transition"
              >
                <ShieldCheck className="w-3 h-3" />
                <span>{dict.nav.investigatorLogin}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Header Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => setActiveTab('cases')}>
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr flex items-center justify-center shadow-lg ${
              isPublic 
                ? 'from-blue-600 via-indigo-600 to-cyan-500 shadow-blue-900/40' 
                : 'from-blue-600 via-indigo-600 to-rose-500 shadow-indigo-900/40'
            }`}>
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white font-sans">
                  Find<span className={isPublic ? 'text-blue-400' : 'text-indigo-400'}>Safe</span>
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-semibold border rounded-full ${
                  isPublic 
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' 
                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                }`}>
                  {isPublic ? dict.nav.publicPortalBadge : dict.nav.sarCenterBadge}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {isPublic ? dict.nav.publicSubtitle : dict.nav.sarSubtitle}
              </p>
            </div>
          </div>

          {/* Navigation Tabs with Matching Coordinated Color Grading */}
          <nav className="hidden xl:flex items-center gap-1.5">
            {!isPublic ? (
              <>
                <button
                  id="nav-cases-btn"
                  onClick={() => setActiveTab('cases')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'cases'
                      ? 'bg-blue-500/20 text-blue-200 border border-blue-400/50 shadow-sm shadow-blue-500/10'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
                  }`}
                >
                  <Users className={`w-3.5 h-3.5 ${activeTab === 'cases' ? 'text-blue-300' : 'text-blue-400'}`} />
                  <span>{dict.nav.cases}</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-800 text-slate-300 font-mono">
                    {activeCasesCount}
                  </span>
                </button>

                <button
                  id="nav-scanner-btn"
                  onClick={() => setActiveTab('scanner')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'scanner'
                      ? 'bg-violet-500/20 text-violet-200 border border-violet-400/50 shadow-sm shadow-violet-500/10'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
                  }`}
                >
                  <Eye className={`w-3.5 h-3.5 ${activeTab === 'scanner' ? 'text-violet-300' : 'text-violet-400'}`} />
                  <span>{dict.nav.leads}</span>
                  {pendingLeadsCount > 0 && (
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-violet-500 text-white font-mono font-bold">
                      {pendingLeadsCount}
                    </span>
                  )}
                </button>

                <button
                  id="nav-alerts-btn"
                  onClick={() => setActiveTab('alerts')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'alerts'
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-400/50 shadow-sm shadow-amber-500/10'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
                  }`}
                >
                  <Megaphone className={`w-3.5 h-3.5 ${activeTab === 'alerts' ? 'text-amber-300' : 'text-amber-400'}`} />
                  <span>{dict.nav.alerts}</span>
                  {unreadAlertsCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </button>

                <button
                  id="nav-duplicates-btn"
                  onClick={() => setActiveTab('duplicates')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'duplicates'
                      ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/50 shadow-sm shadow-indigo-500/10'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
                  }`}
                >
                  <GitMerge className={`w-3.5 h-3.5 ${activeTab === 'duplicates' ? 'text-indigo-300' : 'text-indigo-400'}`} />
                  <span>{dict.nav.deduplication}</span>
                </button>

                <button
                  id="nav-assistant-btn"
                  onClick={() => setActiveTab('assistant')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'assistant'
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50 shadow-sm shadow-emerald-500/10'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
                  }`}
                >
                  <MessageSquareText className={`w-3.5 h-3.5 ${activeTab === 'assistant' ? 'text-emerald-300' : 'text-emerald-400'}`} />
                  <span>{dict.nav.assistant}</span>
                </button>

                {currentUser.role === 'ADMIN' && (
                  <button
                    id="nav-admin-users-btn"
                    onClick={() => setActiveTab('users')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'users'
                        ? 'bg-rose-500/20 text-rose-200 border border-rose-400/50 shadow-sm shadow-rose-500/10'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
                    }`}
                  >
                    <UserCog className={`w-3.5 h-3.5 ${activeTab === 'users' ? 'text-rose-300' : 'text-rose-400'}`} />
                    <span>{dict.nav.requests}</span>
                    <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-rose-500 text-white font-mono font-bold animate-pulse">
                      {pendingInvestigatorRequestsCount}
                    </span>
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => setActiveTab('cases')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeTab === 'cases'
                      ? 'bg-blue-500/20 text-blue-200 border border-blue-400/40 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
                  <span>{dict.nav.publicBulletins}</span>
                </button>

                <button
                  onClick={onOpenReportModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/50 transition"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>{dict.nav.reportMissing}</span>
                </button>

                <button
                  onClick={onOpenSightingModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 transition"
                >
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span>{dict.nav.foundPerson}</span>
                </button>
              </>
            )}
          </nav>

          {/* Right Action Tools, Theme Switcher & RBAC */}
          <div className="flex items-center gap-2">
            {/* Multilingual Selector */}
            <LanguageSelector />
            {/* Theme & Pleasant Color Palette Selector */}
            <ThemeSelector />
            {/* Direct Profile Button */}
            {onOpenProfileModal && (
              <button
                onClick={onOpenProfileModal}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs transition"
                title={dict.nav.profile}
              >
                <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                <span>{dict.nav.profile}</span>
              </button>
            )}

            {/* Direct Logout Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-rose-300 hover:text-rose-200 border border-slate-700 text-xs transition"
                title={dict.nav.logout}
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>{dict.nav.logout}</span>
              </button>
            )}

            {/* Direct Auth / Sign In Modal Trigger */}
            {onOpenAuthModal && (
              <button
                onClick={() => onOpenAuthModal()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition"
                title={dict.nav.signIn}
              >
                <LogIn className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">{dict.nav.signIn}</span>
              </button>
            )}

            {/* RBAC Active Persona Selector */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700 text-left transition shadow-sm"
              >
                <div className="w-6 h-6 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center text-[10px] font-bold text-slate-200">
                  {currentUser.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden sm:block leading-tight">
                  <span className="text-xs font-semibold text-white block truncate max-w-[110px]">
                    {currentUser.name}
                  </span>
                  <span className={`text-[9px] font-mono px-1 rounded border ${getRoleBadgeColor(currentUser.role)}`}>
                    {currentUser.role}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {/* Persona Switcher Dropdown */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-2.5 z-50 space-y-2 text-xs">
                  {/* User Profile Header in Menu */}
                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs truncate">{currentUser.name}</span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${getRoleBadgeColor(currentUser.role)}`}>
                        {currentUser.role}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono block truncate mt-0.5">{currentUser.email}</span>
                    {currentUser.agency && (
                      <span className="text-[10px] text-slate-500 block truncate mt-0.5">{currentUser.agency}</span>
                    )}

                    <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-slate-800">
                      {onOpenProfileModal && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenProfileModal();
                            setIsUserMenuOpen(false);
                          }}
                          className="flex-1 py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-center font-semibold text-[11px] flex items-center justify-center gap-1 transition"
                        >
                          <UserIcon className="w-3 h-3 text-slate-400" />
                          <span>View Profile</span>
                        </button>
                      )}
                      {onLogout && (
                        <button
                          type="button"
                          onClick={() => {
                            onLogout();
                            setIsUserMenuOpen(false);
                          }}
                          className="flex-1 py-1 px-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-800/50 text-center font-semibold text-[11px] flex items-center justify-center gap-1 transition"
                        >
                          <LogOut className="w-3 h-3 text-rose-400" />
                          <span>Sign Out</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Admin Shortcut */}
                  {currentUser.role === 'ADMIN' && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('users');
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full p-2 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-750 text-left flex items-center justify-between transition"
                    >
                      <div className="flex items-center gap-2">
                        <UserCog className="w-4 h-4 text-rose-400" />
                        <span className="font-semibold text-xs">Admin User Management</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">RBAC</span>
                    </button>
                  )}

                  {/* Account Session Controls */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block px-1">
                      Active Account Session
                    </span>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px]">Role Permission:</span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getRoleBadgeColor(currentUser.role)}`}>
                          {currentUser.role}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Database Storage:</span>
                        <span className="text-emerald-400 font-mono">SQLite (findsafe.db)</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onOpenAuthModal && onOpenAuthModal();
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-200 hover:text-white border border-slate-700 transition flex items-center justify-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Switch Account Credentials</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between px-1">
                    <button
                      onClick={() => {
                        onOpenAuditModal();
                        setIsUserMenuOpen(false);
                      }}
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{dict.nav.auditLogs}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Sighting CTA */}
            <button
              id="btn-submit-sighting-nav"
              onClick={onOpenSightingModal}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title={dict.nav.foundPerson}
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>{dict.nav.sighting}</span>
              {pendingLeadsCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>

            {/* Report Missing CTA */}
            <button
              id="btn-report-missing-nav"
              onClick={onOpenReportModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950/30 transition active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{dict.nav.reportMissing}</span>
              <span className="sm:hidden">{dict.nav.reportMissing}</span>
            </button>
          </div>
        </div>

        {/* Responsive Secondary Scrollable Sub-Navigation */}
        <div className="flex xl:hidden items-center justify-start py-2 border-t border-slate-800/80 text-xs overflow-x-auto gap-1.5">
          {!isPublic ? (
            <>
              <button
                onClick={() => setActiveTab('cases')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg shrink-0 ${
                  activeTab === 'cases' ? 'bg-rose-600/30 text-rose-300 font-bold' : 'text-slate-400'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{dict.nav.cases} ({activeCasesCount})</span>
              </button>
              <button
                onClick={() => setActiveTab('scanner')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg shrink-0 ${
                  activeTab === 'scanner' ? 'bg-rose-600/30 text-rose-300 font-bold' : 'text-slate-400'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{dict.nav.leads}</span>
              </button>
              <button
                onClick={() => setActiveTab('alerts')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg shrink-0 ${
                  activeTab === 'alerts' ? 'bg-rose-600/30 text-rose-300 font-bold' : 'text-slate-400'
                }`}
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span>{dict.nav.alerts}</span>
              </button>
              <button
                onClick={() => setActiveTab('duplicates')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg shrink-0 ${
                  activeTab === 'duplicates' ? 'bg-rose-600/30 text-rose-300 font-bold' : 'text-slate-400'
                }`}
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>{dict.nav.deduplication}</span>
              </button>
              <button
                onClick={() => setActiveTab('assistant')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg shrink-0 ${
                  activeTab === 'assistant' ? 'bg-rose-600/30 text-rose-300 font-bold' : 'text-slate-400'
                }`}
              >
                <MessageSquareText className="w-3.5 h-3.5" />
                <span>{dict.nav.assistant}</span>
              </button>
              {currentUser.role === 'ADMIN' && (
                <button
                  onClick={() => setActiveTab('users')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg shrink-0 ${
                    activeTab === 'users' ? 'bg-rose-600/30 text-rose-300 font-bold' : 'text-slate-400'
                  }`}
                >
                  <UserCog className="w-3.5 h-3.5" />
                  <span>{dict.nav.requests} ({pendingInvestigatorRequestsCount})</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => setActiveTab('cases')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg shrink-0 ${
                  activeTab === 'cases' ? 'bg-blue-600/30 text-blue-300 font-bold' : 'text-slate-400'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>{dict.nav.publicBulletins}</span>
              </button>
              <button
                onClick={onOpenReportModal}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg shrink-0 text-rose-300 bg-rose-950/40 border border-rose-800"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{dict.nav.reportMissing}</span>
              </button>
              <button
                onClick={onOpenSightingModal}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg shrink-0 text-amber-300 bg-amber-950/40 border border-amber-800"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{dict.nav.foundPerson}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
