import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Filter, Shield, UserCheck, UserX, ShieldAlert,
  Clock, Mail, Building, Phone, AlertTriangle, CheckCircle2,
  RefreshCw, Sparkles, MoreVertical, Eye, Lock, BadgeCheck,
  XCircle, Check, X, ShieldX, UserMinus, FileText
} from 'lucide-react';
import { 
  UserAccount, 
  UserRole, 
  AccountStatus, 
  CurrentUser, 
  InvestigatorRequest, 
  InvestigatorRequestStatus 
} from '../types';
import { 
  adminFetchUsers, 
  adminUpdateRole, 
  adminUpdateStatus, 
  adminEditUserDetails,
  adminFetchInvestigatorRequests,
  adminApproveInvestigatorRequest,
  adminRejectInvestigatorRequest,
  adminRevokeInvestigatorAccess
} from '../services/authService';

interface AdminUserManagementProps {
  currentUser: CurrentUser;
  onOpenAuditLogs?: () => void;
}

export const AdminUserManagement: React.FC<AdminUserManagementProps> = ({
  currentUser,
  onOpenAuditLogs,
}) => {
  // Navigation tabs within Admin Portal
  const [adminTab, setAdminTab] = useState<'users' | 'requests'>('requests');

  // Users state
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);

  // Investigator Requests state
  const [requests, setRequests] = useState<InvestigatorRequest[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [requestsFilter, setRequestsFilter] = useState<string>('ALL');
  const [requestsSearch, setRequestsSearch] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<InvestigatorRequest | null>(null);

  // Confirmation dialogs state
  const [approveConfirmReq, setApproveConfirmReq] = useState<InvestigatorRequest | null>(null);
  const [rejectConfirmReq, setRejectConfirmReq] = useState<InvestigatorRequest | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('Invalid investigator information');
  const [revokeConfirmReq, setRevokeConfirmReq] = useState<InvestigatorRequest | null>(null);
  const [revokeReason, setRevokeReason] = useState<string>('Investigator credentials revoked by administrator.');

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4500);
  };

  // Load Users
  const loadUsers = async () => {
    setIsLoading(true);
    const res = await adminFetchUsers({
      search: searchTerm,
      role: roleFilter,
      status: statusFilter,
    });
    setIsLoading(false);
    if (res.users) {
      setUsers(res.users);
    } else if (res.error) {
      showToast(res.error, 'error');
    }
  };

  // Load Investigator Requests
  const loadRequests = async () => {
    setIsLoading(true);
    const res = await adminFetchInvestigatorRequests({
      status: requestsFilter,
    });
    setIsLoading(false);
    if (res.requests) {
      setRequests(res.requests);
      setPendingCount(res.pendingCount);
    } else if (res.error) {
      showToast(res.error, 'error');
    }
  };

  useEffect(() => {
    loadUsers();
    loadRequests();
  }, [roleFilter, statusFilter, requestsFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers();
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const res = await adminUpdateRole(userId, newRole);
    if (res.success && res.user) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? res.user! : u)));
      showToast(`User role updated to ${newRole}`);
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser(res.user);
      }
    } else {
      showToast(res.error || 'Failed to update user role', 'error');
    }
  };

  const handleStatusToggle = async (user: UserAccount) => {
    const newStatus: AccountStatus = user.status === 'active' ? 'inactive' : 'active';
    const res = await adminUpdateStatus(user.id, newStatus);
    if (res.success && res.user) {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user! : u)));
      showToast(`User account status updated to ${newStatus}`);
      if (selectedUser && selectedUser.id === user.id) {
        setSelectedUser(res.user);
      }
    } else {
      showToast(res.error || 'Failed to update account status', 'error');
    }
  };

  // -------------------------------------------------------------
  // APPROVE Investigator Request
  // -------------------------------------------------------------
  const handleConfirmApprove = async () => {
    if (!approveConfirmReq) return;
    setIsLoading(true);
    const res = await adminApproveInvestigatorRequest(approveConfirmReq.id);
    setIsLoading(false);
    setApproveConfirmReq(null);

    if (res.success) {
      showToast(`Investigator request approved! Investigator ${approveConfirmReq.name} can now log in.`);
      loadRequests();
      loadUsers();
    } else {
      showToast(res.error || 'Failed to approve request', 'error');
    }
  };

  // -------------------------------------------------------------
  // REJECT Investigator Request
  // -------------------------------------------------------------
  const handleConfirmReject = async () => {
    if (!rejectConfirmReq) return;
    setIsLoading(true);
    const res = await adminRejectInvestigatorRequest(rejectConfirmReq.id, rejectReason);
    setIsLoading(false);
    setRejectConfirmReq(null);

    if (res.success) {
      showToast(`Investigator request rejected. Reason: ${rejectReason}`);
      loadRequests();
      loadUsers();
    } else {
      showToast(res.error || 'Failed to reject request', 'error');
    }
  };

  // -------------------------------------------------------------
  // REVOKE / SUSPEND Investigator Access
  // -------------------------------------------------------------
  const handleConfirmRevoke = async () => {
    if (!revokeConfirmReq) return;
    setIsLoading(true);
    const res = await adminRevokeInvestigatorAccess(revokeConfirmReq.id, revokeReason, 'revoke');
    setIsLoading(false);
    setRevokeConfirmReq(null);

    if (res.success) {
      showToast(`Investigator access revoked for ${revokeConfirmReq.name}. Investigator cannot log in again.`);
      loadRequests();
      loadUsers();
    } else {
      showToast(res.error || 'Failed to revoke access', 'error');
    }
  };

  const getRoleBadge = (role: UserRole) => {
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

  const getStatusBadge = (status: AccountStatus) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'suspended':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'PENDING_APPROVAL':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'REJECTED':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'inactive':
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  const getRequestStatusBadge = (status: InvestigatorRequestStatus) => {
    switch (status) {
      case 'PENDING':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'APPROVED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'REJECTED':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'CANCELLED':
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-600/40';
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Never / Pending';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  // Metrics
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === 'active').length;
  const pendingRequestsCount = requests.filter((r) => r.status === 'PENDING').length;
  const approvedRequestsCount = requests.filter((r) => r.status === 'APPROVED').length;
  const rejectedRequestsCount = requests.filter((r) => r.status === 'REJECTED').length;

  // Filtered requests list
  const filteredRequests = requests.filter((r) => {
    if (!requestsSearch) return true;
    const q = requestsSearch.toLowerCase();
    return (
      r.id.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.organization.toLowerCase().includes(q) ||
      (r.investigatorId && r.investigatorId.toLowerCase().includes(q)) ||
      r.phone.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-rose-600/10 via-amber-500/5 to-transparent blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-400">
                <Shield className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-white font-sans">
                Admin Command Center & Access Governance
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Authorized administrators review pending Investigator Access Requests, manage user roles, and enforce CJIS security compliance.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenAuditLogs && (
              <button
                onClick={onOpenAuditLogs}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Audit Logs</span>
              </button>
            )}
            <button
              onClick={() => {
                loadUsers();
                loadRequests();
              }}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 transition"
              title="Refresh Queue"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs in Admin Dashboard */}
        <div className="flex items-center gap-2 mt-6 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setAdminTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              adminTab === 'requests'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-950/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <BadgeCheck className="w-4 h-4" />
            <span>Investigator Access Requests</span>
            {pendingRequestsCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-400 text-slate-950 shadow-sm animate-pulse">
                {pendingRequestsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAdminTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              adminTab === 'users'
                ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-lg shadow-rose-950/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>All User Accounts & Roles</span>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300">
              {totalUsers}
            </span>
          </button>
        </div>

        {/* Quick Summary Metrics */}
        {adminTab === 'requests' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-700/60">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 block">Pending Requests</span>
              <span className="text-2xl font-bold text-amber-200 mt-1 block">{pendingRequestsCount}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-700/60">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 block">Approved</span>
              <span className="text-2xl font-bold text-emerald-200 mt-1 block">{approvedRequestsCount}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-700/60">
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-300 block">Rejected</span>
              <span className="text-2xl font-bold text-rose-200 mt-1 block">{rejectedRequestsCount}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Total Requests</span>
              <span className="text-2xl font-bold text-white mt-1 block">{requests.length}</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Total Users</span>
              <span className="text-2xl font-bold text-white mt-1 block">{totalUsers}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 block">Active Status</span>
              <span className="text-2xl font-bold text-emerald-400 mt-1 block">{activeUsers}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 block">Investigators</span>
              <span className="text-2xl font-bold text-blue-400 mt-1 block">
                {users.filter(u => u.role === 'INVESTIGATOR').length}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Citizens / Public</span>
              <span className="text-2xl font-bold text-slate-200 mt-1 block">
                {users.filter(u => u.role === 'CITIZEN' || u.role === 'PUBLIC_USER').length}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Global Toast Alert */}
      {toastMsg && (
        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in ${
          toastMsg.type === 'success' 
            ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200' 
            : 'bg-rose-950/80 border-rose-800 text-rose-200'
        }`}>
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1: INVESTIGATOR ACCESS REQUESTS                            */}
      {/* ============================================================== */}
      {adminTab === 'requests' && (
        <div className="space-y-4">
          {/* Requests Filter and Search Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={requestsSearch}
                onChange={(e) => setRequestsSearch(e.target.value)}
                placeholder="Search request ID, name, email, department..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <span>Filter Status:</span>
                <select
                  value={requestsFilter}
                  onChange={(e) => setRequestsFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="ALL">All Requests</option>
                  <option value="PENDING">Pending Approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="CANCELLED">Revoked / Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Pending Requests Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4">Request ID</th>
                    <th className="py-3 px-4">Investigator Name</th>
                    <th className="py-3 px-4">Contact & Email</th>
                    <th className="py-3 px-4">Department / Organization</th>
                    <th className="py-3 px-4">Investigator ID</th>
                    <th className="py-3 px-4">Request Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRequests.map((req) => {
                    const isPending = req.status === 'PENDING';
                    const isApproved = req.status === 'APPROVED';

                    return (
                      <tr key={req.id} className="hover:bg-slate-850/60 transition group">
                        {/* Request ID */}
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-300">
                          {req.id}
                        </td>

                        {/* Name */}
                        <td className="py-3.5 px-4 font-semibold text-white">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-blue-950/80 border border-blue-800/60 text-blue-300 flex items-center justify-center font-bold text-[11px]">
                              {req.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span>{req.name}</span>
                          </div>
                        </td>

                        {/* Contact Info */}
                        <td className="py-3.5 px-4">
                          <span className="text-slate-300 font-mono block">{req.email}</span>
                          <span className="text-slate-500 text-[11px] block">{req.phone}</span>
                        </td>

                        {/* Organization */}
                        <td className="py-3.5 px-4 text-slate-300">
                          {req.organization}
                        </td>

                        {/* Investigator ID */}
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {req.investigatorId || 'N/A'}
                        </td>

                        {/* Request Date */}
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                          {formatDate(req.requestDate)}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${getRequestStatusBadge(req.status)}`}>
                            {req.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* [ VIEW DETAILS ] */}
                            <button
                              type="button"
                              onClick={() => setSelectedRequest(req)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-semibold transition flex items-center gap-1"
                              title="View Details"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Details</span>
                            </button>

                            {/* Pending State: [ APPROVE ] and [ REJECT ] */}
                            {isPending && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setApproveConfirmReq(req)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 text-[11px] font-bold transition flex items-center gap-1"
                                  title="Approve Request"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>APPROVE</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectConfirmReq(req);
                                    setRejectReason('Invalid investigator information');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-rose-200 border border-rose-500/40 text-[11px] font-bold transition flex items-center gap-1"
                                  title="Reject Request"
                                >
                                  <X className="w-3 h-3" />
                                  <span>REJECT</span>
                                </button>
                              </>
                            )}

                            {/* Approved State: [ SUSPEND / REVOKE ACCESS ] */}
                            {isApproved && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRevokeConfirmReq(req);
                                  setRevokeReason('Investigator access revoked by Administrator.');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/40 text-red-300 hover:text-red-200 border border-red-800/60 text-[11px] font-semibold transition flex items-center gap-1"
                                title="Revoke or Suspend Investigator Access"
                              >
                                <ShieldX className="w-3 h-3" />
                                <span>Revoke</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredRequests.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                        No investigator access requests found matching current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: ALL USERS DIRECTORY                                     */}
      {/* ============================================================== */}
      {adminTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-3">
            <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name, email, badge..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
              />
            </form>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <span>Role:</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value="ALL">All Roles</option>
                  <option value="ADMIN">Administrator</option>
                  <option value="INVESTIGATOR">Investigator</option>
                  <option value="CITIZEN">Citizen/User</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value="ALL">All Status</option>
                  <option value="active">Active</option>
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="suspended">Suspended</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Login</th>
                    <th className="py-3 px-4">Registered</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((user) => {
                    const isCurrentAdmin = user.id === currentUser.id;
                    return (
                      <tr key={user.id} className="hover:bg-slate-850/60 transition group">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-white shrink-0">
                              {user.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                <span>{user.name}</span>
                                {isCurrentAdmin && (
                                  <span className="text-[10px] text-amber-400 font-mono font-normal">(You)</span>
                                )}
                              </div>
                              <span className="text-slate-400 text-[11px] font-mono">{user.email}</span>
                              {(user.badgeNumber || user.agency) && (
                                <span className="text-[10px] text-slate-500 block truncate max-w-[200px]">
                                  {[user.badgeNumber, user.agency].filter(Boolean).join(' • ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={user.role === 'PUBLIC_USER' ? 'CITIZEN' : user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                            disabled={isCurrentAdmin}
                            className={`text-[11px] font-mono font-bold px-2 py-1 rounded-lg border focus:outline-none ${getRoleBadge(user.role)} bg-slate-900`}
                          >
                            <option value="CITIZEN">CITIZEN</option>
                            <option value="INVESTIGATOR">INVESTIGATOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(user.status)}`}>
                            {user.status.toUpperCase()}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">
                          {formatDate(user.last_login)}
                        </td>

                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                          {formatDate(user.created_at)}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedUser(user)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 transition"
                              title="View Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusToggle(user)}
                              disabled={isCurrentAdmin}
                              className={`p-1.5 rounded-lg border transition ${
                                user.status === 'active'
                                  ? 'bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-900/60'
                                  : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/60'
                              } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              {user.status === 'active' ? (
                                <UserX className="w-3.5 h-3.5" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CONFIRM APPROVE MODAL                                          */}
      {/* ============================================================== */}
      {approveConfirmReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-400">
              <div className="p-2.5 rounded-2xl bg-emerald-950/80 border border-emerald-800">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Approve Investigator Access Request</h3>
                <span className="text-xs text-slate-400 font-mono">Request ID: {approveConfirmReq.id}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-semibold">
              «Are you sure you want to approve this Investigator access request?»
            </p>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div><strong className="text-slate-400">Name:</strong> <span className="text-white">{approveConfirmReq.name}</span></div>
              <div><strong className="text-slate-400">Email:</strong> <span className="text-slate-300 font-mono">{approveConfirmReq.email}</span></div>
              <div><strong className="text-slate-400">Organization:</strong> <span className="text-slate-300">{approveConfirmReq.organization}</span></div>
            </div>

            <div className="text-[11px] text-slate-400">
              Upon approval, the request status becomes <strong>APPROVED</strong> and the account status becomes <strong>ACTIVE</strong>. The investigator will be authorized to access the Investigator Dashboard.
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setApproveConfirmReq(null)}
                className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={isLoading}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-2"
              >
                {isLoading ? 'Approving...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CONFIRM REJECT MODAL                                           */}
      {/* ============================================================== */}
      {rejectConfirmReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-2xl bg-rose-950/80 border border-rose-800">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Reject Investigator Access Request</h3>
                <span className="text-xs text-slate-400 font-mono">Request ID: {rejectConfirmReq.id}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-semibold">
              «Are you sure you want to reject this Investigator access request?»
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Rejection Reason (Optional):
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder="e.g. Invalid investigator information"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                The stored rejection reason will be displayed to the applicant without exposing sensitive administrative details.
              </span>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRejectConfirmReq(null)}
                className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isLoading}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center justify-center gap-2"
              >
                {isLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CONFIRM REVOKE / SUSPEND ACCESS MODAL                          */}
      {/* ============================================================== */}
      {revokeConfirmReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-2xl bg-red-950/80 border border-red-800">
                <ShieldX className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Revoke / Suspend Investigator Access</h3>
                <span className="text-xs text-slate-400 font-mono">Investigator: {revokeConfirmReq.name}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-semibold">
              «Are you sure you want to revoke access for this Investigator?»
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Reason for Revocation / Suspension:
              </label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={2}
                placeholder="Enter audit reason for access revocation"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 resize-none"
              />
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <span className="block">• Investigator cannot log in again.</span>
              <span className="block">• Dashboard access is immediately denied by backend security.</span>
              <span className="block">• Action is permanently recorded in the system audit history.</span>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRevokeConfirmReq(null)}
                className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={isLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition flex items-center justify-center gap-2"
              >
                {isLoading ? 'Revoking...' : 'Confirm Revoke Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* REQUEST DETAILS MODAL                                          */}
      {/* ============================================================== */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-950 border border-blue-800 flex items-center justify-center font-bold text-xs text-blue-300">
                  <BadgeCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Investigator Access Request Dossier</h3>
                  <span className="text-[11px] text-slate-400 font-mono">ID: {selectedRequest.id}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Applicant Name:</span>
                <span className="font-bold text-white">{selectedRequest.name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Email Address:</span>
                <span className="font-mono text-slate-200">{selectedRequest.email}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Phone Number:</span>
                <span className="text-slate-200">{selectedRequest.phone}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Organization / Department:</span>
                <span className="text-slate-200">{selectedRequest.organization}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Investigator ID / Badge:</span>
                <span className="font-mono text-slate-200">{selectedRequest.investigatorId || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Status:</span>
                <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRequestStatusBadge(selectedRequest.status)}`}>
                  {selectedRequest.status}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Request Date:</span>
                <span className="font-mono text-slate-200">{formatDate(selectedRequest.requestDate)}</span>
              </div>

              {selectedRequest.approvedDate && (
                <div className="flex justify-between py-1.5 border-b border-slate-850">
                  <span className="text-emerald-400">Approved Date:</span>
                  <span className="font-mono text-emerald-300">
                    {formatDate(selectedRequest.approvedDate)} by {selectedRequest.approvedByName || 'Admin'}
                  </span>
                </div>
              )}

              {selectedRequest.rejectedDate && (
                <div className="py-2 border-b border-slate-850 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-rose-400">Rejected Date:</span>
                    <span className="font-mono text-rose-300">
                      {formatDate(selectedRequest.rejectedDate)} by {selectedRequest.rejectedByName || 'Admin'}
                    </span>
                  </div>
                  {selectedRequest.rejectionReason && (
                    <div className="text-[11px] text-rose-300 bg-rose-950/40 p-2 rounded-lg border border-rose-900 font-mono">
                      <strong>Rejection Reason:</strong> {selectedRequest.rejectionReason}
                    </div>
                  )}
                </div>
              )}

              {selectedRequest.revokedDate && (
                <div className="py-2 border-b border-slate-850 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-red-400">Revocation Date:</span>
                    <span className="font-mono text-red-300">
                      {formatDate(selectedRequest.revokedDate)} by {selectedRequest.revokedByName || 'Admin'}
                    </span>
                  </div>
                  {selectedRequest.revocationReason && (
                    <div className="text-[11px] text-red-300 bg-red-950/40 p-2 rounded-lg border border-red-900 font-mono">
                      <strong>Revocation Reason:</strong> {selectedRequest.revocationReason}
                    </div>
                  )}
                </div>
              )}

              {selectedRequest.additionalInfo && (
                <div className="pt-2">
                  <span className="text-slate-400 block mb-1">Additional Verification Information:</span>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 text-xs leading-relaxed">
                    {selectedRequest.additionalInfo}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              {selectedRequest.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setApproveConfirmReq(selectedRequest);
                      setSelectedRequest(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                  >
                    Approve Request
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectConfirmReq(selectedRequest);
                      setSelectedRequest(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                  >
                    Reject Request
                  </button>
                </div>
              ) : selectedRequest.status === 'APPROVED' ? (
                <button
                  type="button"
                  onClick={() => {
                    setRevokeConfirmReq(selectedRequest);
                    setSelectedRequest(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs"
                >
                  Revoke / Suspend Access
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* USER DETAILS MODAL (from User table) */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-white">
                  {selectedUser.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{selectedUser.name}</h3>
                  <span className="text-[11px] text-slate-400 font-mono">{selectedUser.email}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Account ID:</span>
                <span className="font-mono text-slate-200">{selectedUser.id}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Role:</span>
                <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${getRoleBadge(selectedUser.role)}`}>
                  {selectedUser.role}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Status:</span>
                <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${getStatusBadge(selectedUser.status)}`}>
                  {selectedUser.status.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Badge / Agency:</span>
                <span className="text-slate-200">{[selectedUser.badgeNumber, selectedUser.agency].filter(Boolean).join(' • ') || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Organization:</span>
                <span className="text-slate-200">{selectedUser.organization || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Phone:</span>
                <span className="text-slate-200">{selectedUser.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-850">
                <span className="text-slate-400">Registered Date:</span>
                <span className="font-mono text-slate-200">{formatDate(selectedUser.created_at)}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">Last Login:</span>
                <span className="font-mono text-slate-200">{formatDate(selectedUser.last_login)}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
