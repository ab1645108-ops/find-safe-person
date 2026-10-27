import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, Lock, Mail, User, Eye, EyeOff, CheckCircle2, AlertTriangle, 
  ArrowRight, KeyRound, Sparkles, ShieldCheck, Info, Phone, Building,
  BadgeCheck, Clock, Search, Shield, UserCheck, Database, FileText, Key
} from 'lucide-react';
import { 
  loginUser, 
  registerUser, 
  submitInvestigatorRequest, 
  checkInvestigatorStatus,
  verifyAdminConfirmationCode,
  resendAdminConfirmationCode,
  requestPasswordReset,
  submitPasswordReset
} from '../services/authService';
import { UserAccount, UserRole } from '../types';

export type GateRole = 'CITIZEN' | 'INVESTIGATOR' | 'ADMIN';

interface AuthGateProps {
  onLoginSuccess: (user: UserAccount) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onLoginSuccess }) => {
  // Mode: Sign In vs Register/Request vs Forgot Password
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot-password'>('login');
  
  // Administrator Access state (hidden by default on public source, unlocked via secret query/key/sequence)
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return search.includes('portal=admin') || search.includes('admin=true') || search.includes('mode=admin') || hash === '#admin';
  });
  const [stealthClicks, setStealthClicks] = useState<number>(0);

  // Selected role category (defaults to CITIZEN, ADMIN only if secret query exists)
  const [selectedRole, setSelectedRole] = useState<GateRole>(() => {
    if (typeof window === 'undefined') return 'CITIZEN';
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    if (search.includes('portal=admin') || search.includes('admin=true') || search.includes('mode=admin') || hash === '#admin') {
      return 'ADMIN';
    }
    return 'CITIZEN';
  });


  // Sub-action for Investigator tab
  const [investigatorSubTab, setInvestigatorSubTab] = useState<'login' | 'request' | 'status'>('login');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [investigatorId, setInvestigatorId] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  // Password Recovery state
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'submit'>('request');

  // Status check field & result
  const [checkEmail, setCheckEmail] = useState('');
  const [statusResult, setStatusResult] = useState<{
    status?: string;
    requestId?: string;
    name?: string;
    organization?: string;
    rejectionReason?: string;
  } | null>(null);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Admin 2FA Confirmation Code states
  const [admin2FAPending, setAdmin2FAPending] = useState(false);
  const [adminPendingToken, setAdminPendingToken] = useState('');
  const [adminConfirmationCode, setAdminConfirmationCode] = useState('');
  const [adminDestinationEmail, setAdminDestinationEmail] = useState('ab1645108@gmail.com');
  const [adminMaskedEmail, setAdminMaskedEmail] = useState('ab***08@gmail.com');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const [devVerificationHint, setDevVerificationHint] = useState<string | null>(null);

  // Resend cooldown timer effect
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Secret Admin Access via URL or Keyboard Shortcut (Ctrl+Shift+A / Cmd+Shift+A)
  useEffect(() => {
    const checkSecretUrl = () => {
      const search = window.location.search.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (search.includes('portal=admin') || search.includes('admin=true') || search.includes('mode=admin') || hash === '#admin') {
        setIsAdminUnlocked(true);
        setSelectedRole('ADMIN');
      }
    };
    checkSecretUrl();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Secret Key Combo: Ctrl + Shift + A (or Cmd + Shift + A)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        setIsAdminUnlocked((prev) => {
          const next = !prev;
          if (next) {
            setSelectedRole('ADMIN');
            setSuccessMsg('Administrative Command Terminal unlocked (Secret Access Activated).');
          } else {
            setSelectedRole('CITIZEN');
            setSuccessMsg(null);
            setErrorMsg(null);
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', checkSecretUrl);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', checkSecretUrl);
    };
  }, []);

  const resetMessages = () => {
    setErrorMsg(null);
    setRejectionReason(null);
    setPendingNotice(null);
    setSuccessMsg(null);
  };

  // Stealth emblem triple-click sequence
  const handleLogoStealthClick = () => {
    setStealthClicks((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        setIsAdminUnlocked(true);
        setSelectedRole('ADMIN');
        setSuccessMsg('Administrative Command Terminal unlocked via security sequence.');
        return 0;
      }
      return next;
    });
  };

  const handleRoleSelect = (role: GateRole) => {
    setSelectedRole(role);
    resetMessages();
    if (role === 'INVESTIGATOR') {
      if (authMode === 'register') {
        setInvestigatorSubTab('request');
      } else {
        setInvestigatorSubTab('login');
      }
    }
  };

  const handleModeSwitch = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    resetMessages();
    if (selectedRole === 'INVESTIGATOR') {
      setInvestigatorSubTab(mode === 'register' ? 'request' : 'login');
    }
  };

  // -------------------------------------------------------------
  // Login Handler (Citizen, Investigator, Admin)
  // -------------------------------------------------------------
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setIsLoading(true);
    const expectedRole: UserRole = 
      selectedRole === 'CITIZEN' ? 'CITIZEN' : 
      selectedRole === 'INVESTIGATOR' ? 'INVESTIGATOR' : 'ADMIN';

    const res = await loginUser(email.trim(), password, expectedRole);
    setIsLoading(false);

    if (res.requiresAdmin2FA && res.pendingToken) {
      setAdmin2FAPending(true);
      setAdminPendingToken(res.pendingToken);
      setAdminDestinationEmail(res.destinationEmail || 'ab1645108@gmail.com');
      setAdminMaskedEmail(res.maskedEmail || 'ab***08@gmail.com');
      setDevVerificationHint(res.devVerificationHint || null);
      setSuccessMsg(res.message || `A security confirmation code has been dispatched to ${res.destinationEmail || 'ab1645108@gmail.com'}.`);
      setResendCooldown(30);
      return;
    }

    if (res.success && res.user) {
      onLoginSuccess(res.user);
    } else {
      if (res.code === 'INVESTIGATOR_PENDING') {
        setPendingNotice(
          res.error || 'Your Investigator account is pending Admin approval. You cannot access the Investigator portal until your request is approved.'
        );
      } else if (res.code === 'INVESTIGATOR_REJECTED') {
        setErrorMsg(res.error || 'Your Investigator access request has been rejected.');
        if (res.rejectionReason) {
          setRejectionReason(res.rejectionReason);
        }
      } else if (res.code === 'ROLE_MISMATCH') {
        setErrorMsg(res.error || 'Role authorization mismatch: Please switch to the appropriate portal for your account.');
      } else {
        setErrorMsg(res.error || 'Invalid email or password.');
      }
    }
  };

  // -------------------------------------------------------------
  // Password Recovery Handlers
  // -------------------------------------------------------------
  const handleRequestResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!resetEmail.trim()) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }

    setIsLoading(true);
    const res = await requestPasswordReset(resetEmail.trim());
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg(res.message || 'Password reset token generated. Please set your new password.');
      if (res.resetToken) {
        setResetToken(res.resetToken);
      }
      setResetStep('submit');
    } else {
      setErrorMsg(res.error || 'Failed to request password reset.');
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!resetToken.trim()) {
      setErrorMsg('Please enter the reset token.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Passwords do not match. Please verify.');
      return;
    }

    setIsLoading(true);
    const res = await submitPasswordReset(resetToken.trim(), newPassword, confirmNewPassword);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg('Your password has been successfully reset! Please sign in with your new credentials.');
      setEmail(resetEmail);
      setPassword('');
      setAuthMode('login');
      setResetStep('request');
      setResetToken('');
      setNewPassword('');
      setConfirmNewPassword('');
    } else {
      setErrorMsg(res.error || 'Failed to reset password. The token may be invalid or expired.');
    }
  };

  // -------------------------------------------------------------
  // Administrator 2FA Code Verification
  // -------------------------------------------------------------
  const handleVerify2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!adminConfirmationCode.trim()) {
      setErrorMsg('Please enter the 6-digit confirmation code.');
      return;
    }

    setIsVerifying2FA(true);
    const res = await verifyAdminConfirmationCode(adminPendingToken, adminConfirmationCode.trim());
    setIsVerifying2FA(false);

    if (res.success && res.user) {
      onLoginSuccess(res.user);
    } else {
      setErrorMsg(res.error || 'Failed to verify confirmation code. Please check and try again.');
    }
  };

  // -------------------------------------------------------------
  // Administrator 2FA Resend Code
  // -------------------------------------------------------------
  const handleResend2FACode = async () => {
    if (resendCooldown > 0) return;
    resetMessages();

    setIsVerifying2FA(true);
    const res = await resendAdminConfirmationCode(adminPendingToken);
    setIsVerifying2FA(false);

    if (res.success) {
      if (res.devVerificationHint) {
        setDevVerificationHint(res.devVerificationHint);
      }
      setSuccessMsg(`A new confirmation code has been dispatched to ${res.destinationEmail || adminDestinationEmail}.`);
      setResendCooldown(30);
    } else {
      setErrorMsg(res.error || 'Failed to resend confirmation code. Please wait a moment.');
    }
  };

  const handleCancel2FA = () => {
    setAdmin2FAPending(false);
    setAdminPendingToken('');
    setAdminConfirmationCode('');
    setDevVerificationHint(null);
    resetMessages();
  };

  // -------------------------------------------------------------
  // Citizen Registration Handler
  // -------------------------------------------------------------
  const handleCitizenRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!name.trim()) {
      setErrorMsg('Please provide your full legal name.');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('Please provide a valid email address.');
      return;
    }
    if (!password) {
      setErrorMsg('Please set a secure password.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);
    const res = await registerUser(name.trim(), email.trim(), password, confirmPassword);
    setIsLoading(false);

    if (res.success && res.user) {
      // Auto enter if token is issued
      if (res.token) {
        onLoginSuccess(res.user);
      } else {
        setSuccessMsg('Account created successfully! Logging you into the platform...');
        const loginRes = await loginUser(email.trim(), password, 'CITIZEN');
        if (loginRes.success && loginRes.user) {
          onLoginSuccess(loginRes.user);
        } else {
          setAuthMode('login');
          setSuccessMsg('Registration completed. Please sign in with your new password.');
        }
      }
    } else {
      setErrorMsg(res.error || 'Registration failed. An account with this email may already exist.');
    }
  };

  // -------------------------------------------------------------
  // Investigator Request Submission
  // -------------------------------------------------------------
  const handleInvestigatorRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!name.trim() || !email.trim() || !phone.trim() || !organization.trim() || !password) {
      setErrorMsg('All marked fields including agency, contact, and security password are required.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    const res = await submitInvestigatorRequest({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      organization: organization.trim(),
      investigatorId: investigatorId.trim() || undefined,
      password,
      confirmPassword,
      additionalInfo: additionalInfo.trim() || undefined,
    });
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg(
        `Official SAR access application submitted successfully (ID: ${res.requestId || 'REQ-PENDING'}). An Administrator will review your official agency credentials.`
      );
      setCheckEmail(email.trim());
      setInvestigatorSubTab('status');
    } else {
      setErrorMsg(res.error || 'Failed to submit investigator request. Email may already be registered.');
    }
  };

  // -------------------------------------------------------------
  // Investigator Status Check
  // -------------------------------------------------------------
  const handleCheckStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!checkEmail.trim()) {
      setErrorMsg('Please enter the email address used during your application.');
      return;
    }

    setIsLoading(true);
    const res = await checkInvestigatorStatus(checkEmail.trim());
    setIsLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
      setStatusResult(null);
    } else {
      setStatusResult(res);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.18),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Banner / Security Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer select-none group" 
            onClick={handleLogoStealthClick}
            title="FindSafe Security Core"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-rose-500 flex items-center justify-center shadow-lg shadow-indigo-950/60 border border-white/10 group-hover:scale-105 transition">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white font-sans">
                  Find<span className="text-indigo-400">Safe</span>
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-full">
                  Official Portal
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Search & Rescue Operations, Missing Person Recovery & Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>SQLite Relational Storage</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-200 text-[11px]">
              <Lock className="w-3 h-3 text-indigo-400" />
              <span>Authentication Gate</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 z-10">
        <div className="w-full max-w-xl bg-slate-900/85 backdrop-blur-xl border border-slate-800 shadow-2xl shadow-black/80 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {/* Gate Access Header */}
          <div className="p-6 sm:p-8 border-b border-slate-800 bg-gradient-to-b from-slate-850/80 to-transparent">
            {selectedRole === 'ADMIN' && (
              <div className="flex items-center justify-between px-3 py-1.5 mb-4 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-mono animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span className="font-semibold">ADMINISTRATIVE COMMAND TERMINAL</span>
                </div>
                <span className="text-[11px] text-rose-400 font-mono">Restricted Access</span>
              </div>
            )}

            {admin2FAPending ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-xs font-mono tracking-wider uppercase text-rose-400">
                    <Shield className="w-4 h-4 text-rose-400" />
                    <span>Administrator 2FA Verification</span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60">
                    NIST 800-63B 2FA
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Security Confirmation Code
                </h1>
                <p className="text-sm text-slate-400 mt-1.5">
                  A verification code has been dispatched to <strong className="text-rose-300 font-mono">{adminDestinationEmail}</strong>. Enter the 6-digit confirmation code below.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-xs font-mono tracking-wider uppercase text-indigo-400">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <span>Authorized Entry Protocol</span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60">
                    CJIS / NIST 800-63B
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {authMode === 'login' ? 'Sign In to Enter FindSafe' : 'Register to Access FindSafe'}
                </h1>
                <p className="text-sm text-slate-400 mt-1.5">
                  To enter the platform, please authenticate with your credentials or register a verified account.
                </p>

                {/* Toggle: Sign In vs Register */}
                <div className="grid grid-cols-2 gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/80 mt-6">
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('login')}
                    className={`py-2 px-4 rounded-lg font-semibold text-xs transition flex items-center justify-center gap-2 ${
                      authMode === 'login'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Sign In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('register')}
                    className={`py-2 px-4 rounded-lg font-semibold text-xs transition flex items-center justify-center gap-2 ${
                      authMode === 'register'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Register / Request Access</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Role Portal Selector */}
          {!admin2FAPending && (
            <div className="px-6 sm:px-8 pt-5">
              <label className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-2">
                Select Your Access Portal:
              </label>
              <div className={`grid gap-2.5 ${isAdminUnlocked ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {/* Citizen */}
                <button
                  type="button"
                  onClick={() => handleRoleSelect('CITIZEN')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    selectedRole === 'CITIZEN'
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-950/30 ring-1 ring-emerald-500/50'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <User className="w-4 h-4 text-emerald-400" />
                    {selectedRole === 'CITIZEN' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                  </div>
                  <div>
                    <div className="font-bold text-xs">Public Citizen</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">Community Safety</div>
                  </div>
                </button>

                {/* Investigator */}
                <button
                  type="button"
                  onClick={() => handleRoleSelect('INVESTIGATOR')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    selectedRole === 'INVESTIGATOR'
                      ? 'bg-blue-500/10 border-blue-500 text-blue-200 shadow-md shadow-blue-950/30 ring-1 ring-blue-500/50'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    {selectedRole === 'INVESTIGATOR' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                  </div>
                  <div>
                    <div className="font-bold text-xs">Investigator</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">Law Enforcement / SAR</div>
                  </div>
                </button>

                {/* Administrator (Visible only when unlocked via secret query/combo) */}
                {isAdminUnlocked && (
                  <button
                    type="button"
                    onClick={() => handleRoleSelect('ADMIN')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      selectedRole === 'ADMIN'
                        ? 'bg-rose-500/10 border-rose-500 text-rose-200 shadow-md shadow-rose-950/30 ring-1 ring-rose-500/50'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <Shield className="w-4 h-4 text-rose-400" />
                      {selectedRole === 'ADMIN' && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                    </div>
                    <div>
                      <div className="font-bold text-xs">Administrator</div>
                      <div className="text-[10px] text-rose-300 font-mono">Restricted Command</div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Sub-nav for Investigator */}
          {!admin2FAPending && selectedRole === 'INVESTIGATOR' && (
            <div className="px-6 sm:px-8 pt-4">
              <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setInvestigatorSubTab('login');
                    setAuthMode('login');
                    resetMessages();
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-md font-semibold transition flex items-center justify-center gap-1.5 ${
                    investigatorSubTab === 'login'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>Investigator Login</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInvestigatorSubTab('request');
                    setAuthMode('register');
                    resetMessages();
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-md font-semibold transition flex items-center justify-center gap-1.5 ${
                    investigatorSubTab === 'request'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Building className="w-3 h-3" />
                  <span>Request Credential</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInvestigatorSubTab('status');
                    resetMessages();
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-md font-semibold transition flex items-center justify-center gap-1.5 ${
                    investigatorSubTab === 'status'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Search className="w-3 h-3" />
                  <span>Track Status</span>
                </button>
              </div>
            </div>
          )}

          {/* Alert / Notice Messages */}
          <div className="px-6 sm:px-8 pt-4">
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold block">{errorMsg}</span>
                  {rejectionReason && (
                    <div className="mt-1.5 p-2 rounded bg-rose-950/40 border border-rose-800/40 text-[11px] text-rose-200">
                      <strong>Administrator Reason:</strong> {rejectionReason}
                    </div>
                  )}
                  {errorMsg.toLowerCase().includes('already exists') && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        resetMessages();
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                    >
                      <span>Already have an account? Sign In here</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {pendingNotice && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold block">{pendingNotice}</span>
                  <p className="mt-1 text-[11px] text-amber-400/90">
                    Your request was recorded in the system database. Once approved by an Administrator, you will be able to log in.
                  </p>
                </div>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="font-semibold">{successMsg}</span>
              </div>
            )}
          </div>

          {/* Form Content */}
          <div className="p-6 sm:p-8 pt-4">

            {/* 0. ADMIN 2FA CONFIRMATION CODE FORM */}
            {admin2FAPending && (
              <form onSubmit={handleVerify2FASubmit} className="space-y-5">
                <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 to-slate-900 border border-rose-800/50 text-xs text-rose-200 space-y-2.5">
                  <div className="flex items-center gap-2 font-bold text-rose-300">
                    <Mail className="w-4 h-4 text-rose-400" />
                    <span>Single-Use Security Confirmation Code Sent</span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Every single administrator login automatically sends a security confirmation code to:
                  </p>
                  <div className="flex items-center gap-2 bg-slate-950/80 p-2.5 rounded-lg border border-rose-900/60 font-mono text-xs text-white">
                    <BadgeCheck className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="font-bold tracking-wide">{adminDestinationEmail}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Code expires in 10 minutes. Enter the 6 digits below to complete administrator authentication.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-2 text-center">
                    Enter 6-Digit Confirmation PIN *
                  </label>
                  <div className="max-w-xs mx-auto">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoFocus
                      value={adminConfirmationCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                        setAdminConfirmationCode(val);
                      }}
                      placeholder="••••••"
                      className="w-full text-center py-3.5 px-4 bg-slate-950 border-2 border-rose-500/60 rounded-xl font-mono text-3xl font-extrabold tracking-[0.4em] text-white placeholder-slate-700 focus:outline-none focus:ring-4 focus:ring-rose-500/30 focus:border-rose-400 transition"
                    />
                  </div>
                </div>

                {devVerificationHint && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Security PIN generated: <strong className="font-mono text-white text-base tracking-widest">{devVerificationHint}</strong></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdminConfirmationCode(devVerificationHint)}
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold transition cursor-pointer"
                    >
                      Fill PIN
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isVerifying2FA || adminConfirmationCode.trim().length < 6}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-lg shadow-rose-950/60 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  {isVerifying2FA ? (
                    <span>Verifying Code with Server...</span>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verify Code & Enter Admin Terminal</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={handleCancel2FA}
                    className="text-slate-400 hover:text-slate-200 transition flex items-center gap-1"
                  >
                    <span>&larr; Return to Sign In</span>
                  </button>
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || isVerifying2FA}
                    onClick={handleResend2FACode}
                    className="text-rose-400 hover:text-rose-300 font-semibold transition disabled:opacity-40"
                  >
                    {resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : 'Resend Code'}
                  </button>
                </div>
              </form>
            )}

            {!admin2FAPending && (
              <>
                {/* 1. CITIZEN REGISTRATION FORM */}
            {authMode === 'register' && selectedRole === 'CITIZEN' && (
              <form onSubmit={handleCitizenRegisterSubmit} className="space-y-4">
                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-[11px] text-emerald-300 flex items-start gap-2">
                  <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Registering a Citizen account allows you to securely submit missing person reports, track public SAR alerts, and log verified sightings.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Legal Name *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Eleanor Vance"
                      required
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email Address *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="eleanor@example.com"
                      required
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Password *</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        required
                        className="w-full pl-9 pr-9 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Confirm Password *</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        required
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-2.5 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {isLoading ? (
                    <span>Registering Account in Database...</span>
                  ) : (
                    <>
                      <span>Complete Registration & Enter FindSafe</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-slate-400 pt-2">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('login')}
                    className="text-emerald-400 hover:underline font-semibold"
                  >
                    Sign in here
                  </button>
                </p>
              </form>
            )}

            {/* 2. INVESTIGATOR CREDENTIAL REQUEST FORM */}
            {authMode === 'register' && selectedRole === 'INVESTIGATOR' && investigatorSubTab === 'request' && (
              <form onSubmit={handleInvestigatorRequestSubmit} className="space-y-3.5">
                <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-800/40 text-[11px] text-blue-300 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    Official search & rescue personnel, sworn officers, and credentialed forensic investigators can apply here. Applications require Administrator verification before login privileges are activated.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Official Full Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Det. Marcus Vance"
                      required
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Agency / Department *</label>
                    <input
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="e.g. State Police SAR Unit"
                      required
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Official Work Email *</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="m.vance@statepolice.gov"
                      required
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Official Phone *</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 019-2834"
                      required
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Badge ID / Credential # (Optional)</label>
                  <input
                    type="text"
                    value={investigatorId}
                    onChange={(e) => setInvestigatorId(e.target.value)}
                    placeholder="e.g. BADGE-7492-SAR"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Initial Password *</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Confirm Password *</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      required
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Justification / Verification Notes</label>
                  <textarea
                    rows={2}
                    value={additionalInfo}
                    onChange={(e) => setAdditionalInfo(e.target.value)}
                    placeholder="Briefly state jurisdiction, agency commander contact, or current SAR operation."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-1 py-2.5 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-950/50 flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {isLoading ? (
                    <span>Submitting Application to Database...</span>
                  ) : (
                    <>
                      <span>Submit Credential Application for Admin Review</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* 3. INVESTIGATOR TRACK STATUS FORM */}
            {selectedRole === 'INVESTIGATOR' && investigatorSubTab === 'status' && (
              <form onSubmit={handleCheckStatus} className="space-y-4">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                  <p className="font-semibold text-white mb-1">Check Credential Application Status</p>
                  <p className="text-slate-400">
                    Enter the official email you submitted to view real-time approval status from the SQLite database.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Your Registered Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={checkEmail}
                      onChange={(e) => setCheckEmail(e.target.value)}
                      placeholder="investigator@agency.gov"
                      required
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Search className="w-4 h-4" />
                  <span>{isLoading ? 'Querying Database...' : 'Check Status in Database'}</span>
                </button>

                {statusResult && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 mt-4 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Application ID:</span>
                      <span className="font-mono text-xs text-indigo-400 font-bold">{statusResult.requestId || 'REQ-REGISTERED'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Current Status:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                        statusResult.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                        statusResult.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                        'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}>
                        {statusResult.status}
                      </span>
                    </div>
                    {statusResult.status === 'APPROVED' && (
                      <div className="pt-2 border-t border-slate-800">
                        <p className="text-xs text-emerald-400 font-semibold mb-2">
                          Your Investigator access has been approved! You can now sign in with your credentials.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setInvestigatorSubTab('login');
                            setAuthMode('login');
                            setEmail(checkEmail);
                          }}
                          className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
                        >
                          Proceed to Investigator Login
                        </button>
                      </div>
                    )}
                    {statusResult.status === 'REJECTED' && statusResult.rejectionReason && (
                      <div className="pt-2 border-t border-slate-800 text-xs text-rose-300">
                        <strong>Rejection Reason:</strong> {statusResult.rejectionReason}
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}

            {/* 4. STANDARD LOGIN FORM (CITIZEN, INVESTIGATOR, ADMIN) */}
            {authMode === 'login' && investigatorSubTab !== 'status' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                
                {/* Role specific security banner */}
                {selectedRole === 'ADMIN' && (
                  <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40 text-[11px] text-rose-300 flex items-start gap-2">
                    <Shield className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">High-Security Administrative Portal</span>
                      <span>
                        Access is restricted to authorized FindSafe administrators. All failed login attempts and access events are recorded to the SQLite audit log.
                      </span>
                    </div>
                  </div>
                )}

                {selectedRole === 'INVESTIGATOR' && (
                  <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-800/40 text-[11px] text-blue-300 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">Sworn SAR & Forensic Terminal</span>
                      <span>
                        Requires approved agency investigator status in the database. If you do not have an approved credential yet, click "Request Credential".
                      </span>
                    </div>
                  </div>
                )}

                {selectedRole === 'CITIZEN' && (
                  <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-[11px] text-emerald-300 flex items-start gap-2">
                    <User className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      Public community members and citizen reporters. Sign in with your registered email and password.
                    </span>
                  </div>
                )}


                {/* Email input */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {selectedRole === 'ADMIN' ? 'Administrator Email' : 
                     selectedRole === 'INVESTIGATOR' ? 'Official Investigator Email' : 'Email Address'} *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={
                        selectedRole === 'ADMIN' ? 'administrator@domain.gov' :
                        selectedRole === 'INVESTIGATOR' ? 'investigator@findsafe.ai' : 'you@example.com'
                      }
                      required
                      autoComplete="username"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
                    />
                  </div>
                </div>

                {/* Password input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">Password *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot-password');
                        resetMessages();
                      }}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                      className="w-full pl-9 pr-9 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full mt-2 py-2.5 px-4 rounded-xl font-semibold text-sm text-white shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50 ${
                    selectedRole === 'ADMIN'
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 shadow-rose-950/50'
                      : selectedRole === 'INVESTIGATOR'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-950/50'
                      : 'bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 shadow-indigo-950/50'
                  }`}
                >
                  {isLoading ? (
                    <span>Verifying Credentials against Database...</span>
                  ) : (
                    <>
                      <span>Sign In & Unlock FindSafe</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Footer Switch Prompt */}
                <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                  {selectedRole === 'CITIZEN' && (
                    <p>
                      Don't have an account yet?{' '}
                      <button
                        type="button"
                        onClick={() => handleModeSwitch('register')}
                        className="text-emerald-400 hover:underline font-semibold"
                      >
                        Register new account
                      </button>
                    </p>
                  )}
                  {selectedRole === 'INVESTIGATOR' && (
                    <p>
                      Need official SAR credentials?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setInvestigatorSubTab('request');
                          setAuthMode('register');
                        }}
                        className="text-blue-400 hover:underline font-semibold"
                      >
                        Apply for Investigator Access
                      </button>
                    </p>
                  )}
                  {selectedRole === 'ADMIN' && (
                    <p className="text-slate-500 text-[11px]">
                      Encrypted session enforcement • PBKDF2-SHA512 password protection & SQLite audit logging.
                    </p>
                  )}
                </div>
              </form>
            )}

            {/* 5. FORGOT PASSWORD RECOVERY FORM */}
            {authMode === 'forgot-password' && (
              <div className="space-y-4 animate-in fade-in">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-indigo-400">
                    <KeyRound className="w-4 h-4" />
                    <span>Password Recovery</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Enter your registered email address to receive a secure password reset token.
                  </p>
                </div>

                {resetStep === 'request' ? (
                  <form onSubmit={handleRequestResetSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Registered Email *</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('login');
                          resetMessages();
                        }}
                        className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-950/50 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isLoading ? 'Generating Token...' : 'Generate Reset Token'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Reset Token *</label>
                      <input
                        type="text"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        placeholder="Paste reset token here"
                        required
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">New Password (min 8 chars) *</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        minLength={8}
                        required
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password *</label>
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Re-type new password"
                        minLength={8}
                        required
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setResetStep('request')}
                        className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isLoading ? 'Updating Password...' : 'Save New Password'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Admin Register Notice */}
            {authMode === 'register' && selectedRole === 'ADMIN' && (
              <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-3">
                <Shield className="w-8 h-8 text-rose-400 mx-auto" />
                <h3 className="font-bold text-white text-base">Administrative Access Policy</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
                  Administrator accounts cannot be self-registered from the public internet. They are provisioned through secure command channels or by an existing Super Administrator.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('login')}
                    className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition"
                  >
                    Return to Administrator Sign In
                  </button>
                </div>
              </div>
            )}
              </>
            )}

          </div>

          {/* Card Footer */}
          <div className="px-6 sm:px-8 py-3.5 bg-slate-950 border-t border-slate-800/80 text-[11px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Relational SQLite Database: findsafe.db</span>
            </div>
            <span>Brute-force shield active</span>
          </div>

        </div>
      </main>

      {/* Page Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p>
            FindSafe Enterprise Forensic & Search and Rescue System • Law Enforcement Data Standards & CJIS Compliant
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>Multi-Role Security Active</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
