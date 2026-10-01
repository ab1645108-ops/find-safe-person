import React, { useState } from 'react';
import { 
  ShieldAlert, Lock, Mail, User, Eye, EyeOff, CheckCircle2, AlertTriangle, 
  ArrowRight, KeyRound, Sparkles, X, ShieldCheck, Info, Phone, Building,
  BadgeCheck, Clock, Search, HelpCircle, Shield, UserCheck
} from 'lucide-react';
import { 
  loginUser, 
  registerUser, 
  submitInvestigatorRequest, 
  checkInvestigatorStatus 
} from '../services/authService';
import { UserAccount, UserRole } from '../types';

export type LoginOption = 'CITIZEN' | 'INVESTIGATOR' | 'ADMIN';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserAccount) => void;
  initialMode?: 'login' | 'register';
  initialOption?: LoginOption;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialMode = 'login',
  initialOption = 'CITIZEN',
}) => {
  // Three distinct Login Options: PUBLIC CITIZEN, INVESTIGATOR, ADMIN
  const [selectedOption, setSelectedOption] = useState<LoginOption>(initialOption);

  // Sub-view mode
  const [subMode, setSubMode] = useState<
    'login' | 'citizen-register' | 'investigator-request' | 'forgot-password' | 'check-status'
  >(initialMode === 'register' ? 'citizen-register' : 'login');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [investigatorId, setInvestigatorId] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');

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

  if (!isOpen) return null;

  const resetMessages = () => {
    setErrorMsg(null);
    setRejectionReason(null);
    setPendingNotice(null);
    setSuccessMsg(null);
  };

  const handleSelectOption = (opt: LoginOption) => {
    setSelectedOption(opt);
    setSubMode('login');
    resetMessages();
  };

  const handleFillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    resetMessages();
  };

  // -------------------------------------------------------------
  // Common Login Submit (handles Citizen, Investigator, Admin)
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
      selectedOption === 'CITIZEN' ? 'CITIZEN' : 
      selectedOption === 'INVESTIGATOR' ? 'INVESTIGATOR' : 'ADMIN';

    const res = await loginUser(email.trim(), password, expectedRole);
    setIsLoading(false);

    if (res.success && res.user) {
      onLoginSuccess(res.user);
      onClose();
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
      } else if (res.code === 'INVESTIGATOR_SUSPENDED') {
        setErrorMsg(res.error || 'Your Investigator access has been suspended or revoked. Please contact the administrator.');
        if (res.rejectionReason) {
          setRejectionReason(res.rejectionReason);
        }
      } else {
        setErrorMsg(res.error || 'Invalid email or password.');
      }
    }
  };

  // -------------------------------------------------------------
  // Public Citizen Registration
  // -------------------------------------------------------------
  const handleCitizenRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!name.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify your password confirmation.');
      return;
    }

    setIsLoading(true);
    const res = await registerUser(name.trim(), email.trim(), password, confirmPassword);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg('Registration successful! Please sign in with your civilian credentials.');
      setSubMode('login');
      setPassword('');
      setConfirmPassword('');
    } else {
      setErrorMsg(res.error || 'Registration failed. Please check your information.');
    }
  };

  // -------------------------------------------------------------
  // Investigator Access Request Submission
  // -------------------------------------------------------------
  const handleInvestigatorRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!name.trim()) {
      setErrorMsg('Full Name is required.');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('Email Address is required.');
      return;
    }
    if (!phone.trim()) {
      setErrorMsg('Phone Number is required.');
      return;
    }
    if (!organization.trim()) {
      setErrorMsg('Organization or Law Enforcement Department is required.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please confirm your password.');
      return;
    }

    setIsLoading(true);
    const res = await submitInvestigatorRequest({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      organization: organization.trim(),
      investigatorId: investigatorId.trim(),
      password,
      confirmPassword,
      additionalInfo: additionalInfo.trim(),
    });
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg(
        'Your Investigator access request has been submitted and is waiting for Admin approval.'
      );
      setPendingNotice(
        'Your Investigator access request has been submitted and is waiting for Admin approval.'
      );
      setSubMode('login');
      setPassword('');
      setConfirmPassword('');
    } else {
      setErrorMsg(res.error || 'Failed to submit Investigator access request.');
    }
  };

  // -------------------------------------------------------------
  // Check Request Status Handler
  // -------------------------------------------------------------
  const handleCheckStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkEmail.trim()) return;
    setIsLoading(true);
    const res = await checkInvestigatorStatus(checkEmail.trim());
    setIsLoading(false);
    setStatusResult(res);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="relative p-6 pb-4 border-b border-slate-800 bg-gradient-to-b from-slate-850 to-slate-900">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg ${
              selectedOption === 'CITIZEN'
                ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-emerald-950/50'
                : selectedOption === 'INVESTIGATOR'
                ? 'bg-gradient-to-tr from-blue-600 to-cyan-500 shadow-blue-950/50'
                : 'bg-gradient-to-tr from-rose-600 to-amber-500 shadow-rose-950/50'
            }`}>
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white font-sans">
                  Find<span className={
                    selectedOption === 'CITIZEN' ? 'text-emerald-400' :
                    selectedOption === 'INVESTIGATOR' ? 'text-blue-400' : 'text-rose-400'
                  }>Safe</span> <span className="text-slate-300 text-sm font-normal">Portal</span>
                </h2>
                <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border ${
                  selectedOption === 'CITIZEN' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  selectedOption === 'INVESTIGATOR' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                  'bg-rose-500/20 text-rose-300 border-rose-500/30'
                }`}>
                  {selectedOption === 'CITIZEN' ? 'PUBLIC ACCESS' : selectedOption === 'INVESTIGATOR' ? 'INVESTIGATION' : 'ADMIN COMMAND'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Authentication & Verification Terminal
              </p>
            </div>
          </div>

          {/* THREE CLEAR LOGIN OPTIONS AS REQUESTED (MATCHING ASCII DIAGRAM) */}
          <div className="mt-4 space-y-2">
            <div className="text-center font-mono font-bold tracking-widest text-slate-300 text-xs flex items-center justify-center gap-2">
              <span className="h-px bg-slate-800 w-16" />
              <span>LOGIN OPTIONS</span>
              <span className="h-px bg-slate-800 w-16" />
            </div>

            <div className="space-y-2">
              {/* Option 1: PUBLIC CITIZEN */}
              <button
                type="button"
                onClick={() => handleSelectOption('CITIZEN')}
                className={`w-full py-2.5 px-3.5 rounded-2xl transition-all flex items-center justify-between border text-left ${
                  selectedOption === 'CITIZEN'
                    ? 'bg-emerald-950/70 border-emerald-500 text-white font-bold shadow-lg shadow-emerald-950/70 ring-1 ring-emerald-500/50'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition ${selectedOption === 'CITIZEN' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/50' : 'bg-slate-800 text-slate-400'}`}>
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs tracking-wide font-mono font-bold block">1. PUBLIC CITIZEN</span>
                    <span className="text-[10px] text-slate-400 font-normal">Civilian portal • Case reporting & status</span>
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  selectedOption === 'CITIZEN' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold' : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {selectedOption === 'CITIZEN' ? '● SELECTED' : 'SELECT'}
                </span>
              </button>

              {/* Option 2: INVESTIGATOR */}
              <button
                type="button"
                onClick={() => handleSelectOption('INVESTIGATOR')}
                className={`w-full py-2.5 px-3.5 rounded-2xl transition-all flex items-center justify-between border text-left ${
                  selectedOption === 'INVESTIGATOR'
                    ? 'bg-blue-950/70 border-blue-500 text-white font-bold shadow-lg shadow-blue-950/70 ring-1 ring-blue-500/50'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition ${selectedOption === 'INVESTIGATOR' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50' : 'bg-slate-800 text-slate-400'}`}>
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs tracking-wide font-mono font-bold block">2. INVESTIGATOR</span>
                    <span className="text-[10px] text-slate-400 font-normal">Sworn SAR & Detective • Access Request Required</span>
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  selectedOption === 'INVESTIGATOR' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold' : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {selectedOption === 'INVESTIGATOR' ? '● SELECTED' : 'REQUEST ACCESS'}
                </span>
              </button>

              {/* Option 3: ADMIN */}
              <button
                type="button"
                onClick={() => handleSelectOption('ADMIN')}
                className={`w-full py-2.5 px-3.5 rounded-2xl transition-all flex items-center justify-between border text-left ${
                  selectedOption === 'ADMIN'
                    ? 'bg-rose-950/70 border-rose-500 text-white font-bold shadow-lg shadow-rose-950/70 ring-1 ring-rose-500/50'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition ${selectedOption === 'ADMIN' ? 'bg-rose-600 text-white shadow-md shadow-rose-900/50' : 'bg-slate-800 text-slate-400'}`}>
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs tracking-wide font-mono font-bold block">3. ADMIN</span>
                    <span className="text-[10px] text-slate-400 font-normal">System Administration & Investigator Approvals</span>
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  selectedOption === 'ADMIN' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold' : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {selectedOption === 'ADMIN' ? '● SELECTED' : 'PRIVILEGED'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Notification Alert Banners */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <span className="font-semibold block">{errorMsg}</span>
                {rejectionReason && (
                  <span className="text-[11px] text-rose-300 block mt-1 bg-rose-900/40 p-2 rounded-lg border border-rose-800/60 font-mono">
                    <strong>Reason:</strong> {rejectionReason}
                  </span>
                )}
              </div>
            </div>
          )}

          {pendingNotice && (
            <div className="p-3.5 rounded-xl bg-amber-950/80 border border-amber-700/80 text-amber-200 text-xs flex items-start gap-2.5 animate-in fade-in shadow-lg shadow-amber-950/40">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed font-semibold">
                «{pendingNotice}»
              </div>
            </div>
          )}

          {successMsg && !pendingNotice && (
            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMsg}</div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 1. PUBLIC CITIZEN SECTION                                */}
          {/* ======================================================== */}
          {selectedOption === 'CITIZEN' && (
            <>
              {subMode === 'login' && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Civilian account sign in: Report cases, track status & submit sightings.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your.email@domain.com"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setSubMode('forgot-password')}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline"
                      >
                        Forgot Password
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your citizen password"
                        required
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Buttons: Login & Create Account */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-bold shadow-lg shadow-emerald-950/60 transition active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>Login to Citizen Dashboard</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSubMode('citizen-register');
                        resetMessages();
                      }}
                      className="w-full py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition flex items-center justify-center gap-1.5"
                    >
                      <span>Create Account</span>
                    </button>
                  </div>

                  {/* Quick-fill demo account */}
                  <div className="pt-2 border-t border-slate-800 text-center">
                    <button
                      type="button"
                      onClick={() => handleFillDemo('citizen@findsafe.ai', 'Citizen@1234')}
                      className="text-[11px] text-slate-400 hover:text-emerald-300 font-mono underline"
                    >
                      Quick-Fill Test Citizen Account (citizen@findsafe.ai)
                    </button>
                  </div>
                </form>
              )}

              {/* Citizen Registration Form */}
              {subMode === 'citizen-register' && (
                <form onSubmit={handleCitizenRegisterSubmit} className="space-y-3.5">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Create a new Public Citizen account to register and manage missing person cases.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Jane Doe"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your.email@domain.com"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Create Password <span className="text-[10px] text-slate-500">(minimum 8 characters)</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create strong password"
                        minLength={8}
                        required
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type password"
                        minLength={8}
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSubMode('login')}
                      className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <span>Create Citizen Account</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* ======================================================== */}
          {/* 2. INVESTIGATOR SECTION                                  */}
          {/* ======================================================== */}
          {selectedOption === 'INVESTIGATOR' && (
            <>
              {subMode === 'login' && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-blue-950/60 border border-blue-800/80 text-xs text-blue-200 space-y-1">
                    <div className="flex items-center gap-2 font-bold text-blue-300">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Investigator Authorization Required</span>
                    </div>
                    <p className="text-[11px] text-blue-200/90 leading-relaxed">
                      Investigators must first submit an Access Request and be <strong>APPROVED</strong> by an Administrator before accessing the Investigator Dashboard.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Investigator Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="investigator@agency.gov"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setSubMode('forgot-password')}
                        className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        Forgot Password
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter account password"
                        required
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-xs font-bold shadow-lg shadow-blue-950/60 transition active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>Login to Investigator Dashboard</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSubMode('investigator-request');
                        resetMessages();
                      }}
                      className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-blue-500/40 text-xs font-bold text-blue-300 hover:text-blue-200 transition flex items-center justify-center gap-1.5"
                    >
                      <BadgeCheck className="w-4 h-4 text-blue-400" />
                      <span>Submit Investigator Access Request</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSubMode('check-status')}
                      className="text-slate-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <Search className="w-3 h-3" />
                      <span>Check Request Status</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFillDemo('investigator@findsafe.ai', 'Investigator@1234')}
                      className="text-slate-400 hover:text-blue-300 font-mono underline"
                    >
                      Approved Demo Account
                    </button>
                  </div>
                </form>
              )}

              {/* Investigator Access Request Form */}
              {subMode === 'investigator-request' && (
                <form onSubmit={handleInvestigatorRequestSubmit} className="space-y-3">
                  <div className="p-3 rounded-xl bg-blue-950/70 border border-blue-800 text-xs text-blue-200 space-y-1">
                    <span className="font-bold block">Investigator Access Request Application</span>
                    <p className="text-[11px] text-blue-300/80 leading-relaxed">
                      Submit your law enforcement or SAR organization credentials. After submission, your request will be <strong>PENDING</strong> until approved by a System Administrator.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Full Name *
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Detective Sarah Jenkins"
                        required
                        className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Email Address *
                      </label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@agency.gov"
                          required
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Phone Number *
                      </label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+1 (555) 019-2831"
                          required
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Organization / Dept *
                      </label>
                      <div className="relative">
                        <Building className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          placeholder="e.g. County Sheriff SAR"
                          required
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Investigator / Badge ID
                      </label>
                      <div className="relative">
                        <BadgeCheck className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={investigatorId}
                          onChange={(e) => setInvestigatorId(e.target.value)}
                          placeholder="e.g. INV-4920"
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Password (min 8) *
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        minLength={8}
                        required
                        className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Confirm Password *
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type password"
                        minLength={8}
                        required
                        className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Additional Verification Information
                    </label>
                    <textarea
                      value={additionalInfo}
                      onChange={(e) => setAdditionalInfo(e.target.value)}
                      rows={2}
                      placeholder="Agency jurisdiction, supervisor contact, official credential details, etc."
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSubMode('login')}
                      className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-950/50 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <span>Submit Access Request</span>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Check Request Status View */}
              {subMode === 'check-status' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-slate-850 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-blue-300">
                      <Search className="w-4 h-4" />
                      <span className="text-xs font-bold">Check Investigator Access Request Status</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Enter the email address you used when submitting your Investigator Access Request to check its current status.
                    </p>
                    <form onSubmit={handleCheckStatus} className="flex gap-2 pt-1">
                      <input
                        type="email"
                        value={checkEmail}
                        onChange={(e) => setCheckEmail(e.target.value)}
                        placeholder="investigator@agency.gov"
                        required
                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition"
                      >
                        {isLoading ? 'Checking...' : 'Check'}
                      </button>
                    </form>
                  </div>

                  {statusResult && (
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                      {statusResult.status === 'PENDING' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-amber-300 font-bold">
                            <Clock className="w-4 h-4 text-amber-400" />
                            <span>Request Status: PENDING ADMIN APPROVAL</span>
                          </div>
                          <p className="text-slate-300 leading-relaxed">
                            «Your Investigator access request has been submitted and is waiting for Admin approval.»
                          </p>
                          <span className="text-[11px] font-mono text-slate-400 block">
                            Request ID: {statusResult.requestId}
                          </span>
                        </div>
                      )}

                      {statusResult.status === 'APPROVED' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-emerald-300 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Request Status: APPROVED</span>
                          </div>
                          <p className="text-slate-300 leading-relaxed">
                            «Your Investigator access request has been approved. You can now log in to the Investigator portal.»
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setEmail(checkEmail);
                              setSubMode('login');
                            }}
                            className="mt-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px]"
                          >
                            Sign In Now
                          </button>
                        </div>
                      )}

                      {statusResult.status === 'REJECTED' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-rose-300 font-bold">
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                            <span>Request Status: REJECTED</span>
                          </div>
                          <p className="text-slate-300 leading-relaxed">
                            «Your Investigator access request has been rejected. Please contact the administrator for further information.»
                          </p>
                          {statusResult.rejectionReason && (
                            <div className="text-[11px] text-rose-300 bg-rose-950/60 p-2 rounded-lg border border-rose-900 font-mono">
                              <strong>Reason:</strong> {statusResult.rejectionReason}
                            </div>
                          )}
                        </div>
                      )}

                      {statusResult.status === 'NOT_FOUND' && (
                        <p className="text-slate-400">
                          No access request found for email {checkEmail}. Please submit a new request if needed.
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setSubMode('login')}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
                  >
                    Back to Login
                  </button>
                </div>
              )}
            </>
          )}

          {/* ======================================================== */}
          {/* 3. ADMIN SECTION                                         */}
          {/* ======================================================== */}
          {selectedOption === 'ADMIN' && (
            <>
              {subMode === 'login' && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-xs text-rose-200 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Administrator Command Console: Review requests, manage users & audit compliance.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Administrator Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@findsafe.ai"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setSubMode('forgot-password')}
                        className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline"
                      >
                        Forgot Password
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter admin password"
                        required
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold shadow-lg shadow-rose-950/60 transition active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Login to Admin Command Center</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>

                  <div className="pt-2 border-t border-slate-800 text-center">
                    <button
                      type="button"
                      onClick={() => handleFillDemo('admin@findsafe.ai', 'Admin@1234')}
                      className="text-[11px] text-slate-400 hover:text-rose-300 font-mono underline"
                    >
                      Quick-Fill Authorized Administrator (admin@findsafe.ai)
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* FORGOT PASSWORD DRAWER */}
          {subMode === 'forgot-password' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-300">
                  <KeyRound className="w-4 h-4" />
                  <span className="text-xs font-bold">Password Recovery Assistance</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  For law enforcement, investigator, and administrator credentials, password resets must be authorized through your designated agency Dispatch Supervisor or System Administrator.
                </p>
                <p className="text-xs text-slate-400">
                  For civilian citizen accounts, please contact system administration at <span className="text-rose-400 font-mono">support@findsafe.ai</span> with your registered email.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubMode('login')}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950 text-center text-xs text-slate-400">
          <div className="flex items-center justify-between text-[11px]">
            <span>Active Portal: <strong>{selectedOption}</strong></span>
            <span>FindSafe Security & CJIS Compliant</span>
          </div>
        </div>
      </div>
    </div>
  );
};
