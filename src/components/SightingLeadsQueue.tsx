import React, { useState } from 'react';
import { MissingPerson, SightingLead, CurrentUser } from '../types';
import { 
  Camera, Eye, CheckCircle2, AlertTriangle, ShieldCheck, Sparkles, 
  MapPin, Phone, Mail, Clock, Search, Filter, Trash2, ExternalLink, 
  Link2, Check, X, ShieldAlert, ArrowRight, UserCheck
} from 'lucide-react';
import { ConfirmFoundModal } from './ConfirmFoundModal';
import { useLanguage } from '../context/LanguageContext';

interface SightingLeadsQueueProps {
  sightings: SightingLead[];
  missingPersons: MissingPerson[];
  currentUser?: CurrentUser;
  onSearchWithAi: (lead: SightingLead) => void;
  onUpdateLead?: (leadId: string, updates: Partial<SightingLead>) => void;
  onDeleteLead?: (leadId: string) => void;
  onSelectPerson?: (person: MissingPerson) => void;
  onOpenScannerTab?: () => void;
}

export const SightingLeadsQueue: React.FC<SightingLeadsQueueProps> = ({
  sightings = [],
  missingPersons = [],
  currentUser,
  onSearchWithAi,
  onUpdateLead,
  onDeleteLead,
  onSelectPerson,
  onOpenScannerTab,
}) => {
  const { dict } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [linkingLeadId, setLinkingLeadId] = useState<string | null>(null);
  const [targetCaseId, setTargetCaseId] = useState<string>('');
  const [confirmFoundPerson, setConfirmFoundPerson] = useState<MissingPerson | null>(null);

  // Filter leads based on search term and status
  const filteredLeads = sightings.filter((lead) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      lead.personName?.toLowerCase().includes(q) ||
      lead.locationName?.toLowerCase().includes(q) ||
      lead.notes?.toLowerCase().includes(q) ||
      lead.reportedBy?.toLowerCase().includes(q) ||
      lead.contactNumber?.toLowerCase().includes(q) ||
      lead.contactEmail?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'FOUND_ONLY') return Boolean(lead.isFoundPersonReport);
    if (statusFilter === 'PENDING') return lead.status === 'Pending Review';
    if (statusFilter === 'HIGH_PRIORITY') return lead.status === 'High Priority';
    if (statusFilter === 'VERIFIED') return lead.status === 'Verified Match';
    return lead.status === statusFilter;
  });

  const foundReportsCount = sightings.filter((s) => s.isFoundPersonReport).length;
  const pendingCount = sightings.filter((s) => s.status === 'Pending Review').length;
  const priorityCount = sightings.filter((s) => s.status === 'High Priority').length;
  const verifiedCount = sightings.filter((s) => s.status === 'Verified Match').length;

  const handleLinkCase = (lead: SightingLead) => {
    if (!targetCaseId) return;
    const targetCase = missingPersons.find((p) => p.id === targetCaseId);
    if (targetCase && onUpdateLead) {
      onUpdateLead(lead.id, {
        personId: targetCase.id,
        personName: targetCase.name,
        status: 'Verified Match',
      });
    }
    setLinkingLeadId(null);
    setTargetCaseId('');
  };

  const handleOpenConfirmFound = (lead: SightingLead) => {
    const matched = missingPersons.find((p) => p.id === lead.personId);
    if (matched) {
      setConfirmFoundPerson(matched);
    } else {
      setLinkingLeadId(lead.id);
    }
  };

  const getStatusBadge = (status: SightingLead['status']) => {
    switch (status) {
      case 'Verified Match':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'High Priority':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'Pending Review':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'Manual Review Required':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'Dismissed':
      case 'Rejected':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>{dict.leads.title}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                {sightings.length} {dict.leads.totalLeads}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {dict.leads.subtitle}
            </p>
          </div>
          {onOpenScannerTab && (
            <button
              onClick={onOpenScannerTab}
              className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs flex items-center gap-2 transition self-start sm:self-auto shadow-md shadow-violet-950/40"
            >
              <Camera className="w-4 h-4" />
              <span>{dict.cases.scanFace}</span>
            </button>
          )}
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={dict.portal.searchPlaceholder}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap ${
                statusFilter === 'ALL'
                  ? 'bg-blue-600 text-white shadow-sm border border-blue-400/50'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              All ({sightings.length})
            </button>
            <button
              onClick={() => setStatusFilter('FOUND_ONLY')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1 whitespace-nowrap ${
                statusFilter === 'FOUND_ONLY'
                  ? 'bg-emerald-600 text-white shadow-sm border border-emerald-400/50'
                  : 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50 border border-emerald-800/40'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Found Reports ({foundReportsCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('HIGH_PRIORITY')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap ${
                statusFilter === 'HIGH_PRIORITY'
                  ? 'bg-rose-600 text-white shadow-sm border border-rose-400/50'
                  : 'bg-slate-800 text-rose-300 hover:bg-slate-700'
              }`}
            >
              High Priority ({priorityCount})
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-sm border border-amber-400/50'
                  : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('VERIFIED')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap ${
                statusFilter === 'VERIFIED'
                  ? 'bg-indigo-600 text-white shadow-sm border border-indigo-400/50'
                  : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'
              }`}
            >
              Verified ({verifiedCount})
            </button>
          </div>
        </div>
      </div>

      {/* Leads Cards Grid */}
      {filteredLeads.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 mx-auto">
            <Camera className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white">No Submitted Leads Found</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {searchTerm || statusFilter !== 'ALL'
              ? 'No sighting leads match your current search or status filter criteria.'
              : 'No sighting leads or found person reports have been submitted yet. Tips reported by the public will appear in this queue instantly.'}
          </p>
          {onOpenScannerTab && (
            <button
              onClick={onOpenScannerTab}
              className="mt-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition"
            >
              <Camera className="w-3.5 h-3.5 text-rose-400" />
              <span>Launch Live Photo Scanner</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredLeads.map((lead) => {
            const matchedCase = lead.personId ? missingPersons.find((p) => p.id === lead.personId) : null;
            const isFoundReport = Boolean(lead.isFoundPersonReport);

            return (
              <div
                key={lead.id}
                className={`bg-slate-900 border rounded-2xl p-5 space-y-4 shadow-sm transition hover:border-slate-700 relative overflow-hidden flex flex-col justify-between ${
                  isFoundReport
                    ? 'border-emerald-500/50 bg-gradient-to-br from-emerald-950/20 via-slate-900 to-slate-900'
                    : 'border-slate-800'
                }`}
              >
                {/* Top Badge Strip */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-2">
                    {isFoundReport && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold font-mono text-[10px] flex items-center gap-1 animate-pulse shadow-sm">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>FOUND PERSON REPORT</span>
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusBadge(lead.status)}`}>
                      {lead.status}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{new Date(lead.timestamp).toLocaleString()}</span>
                  </span>
                </div>

                {/* Lead Core Info & Image Preview */}
                <div className="flex items-start gap-3.5">
                  {lead.photoUrl ? (
                    <div
                      onClick={() => setSelectedPhoto(lead.photoUrl || null)}
                      className="w-24 h-24 rounded-xl overflow-hidden bg-black border border-slate-700 shrink-0 cursor-pointer group relative shadow-md"
                    >
                      <img
                        src={lead.photoUrl}
                        alt="Sighting lead evidence"
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                        <Eye className="w-5 h-5" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center text-slate-500 shrink-0 p-2 text-center">
                      <Camera className="w-6 h-6 mb-1 text-slate-400" />
                      <span className="text-[9px] text-slate-400">No Photo</span>
                    </div>
                  )}

                  <div className="space-y-1.5 flex-1 min-w-0 text-xs">
                    {/* Location */}
                    <div className="flex items-start gap-1.5 text-slate-200">
                      <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <span className="font-semibold line-clamp-1">{lead.locationName}</span>
                    </div>

                    {/* Reporter Details */}
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-mono">SUBMITTER:</span>
                        <span className="font-medium text-slate-200">{lead.reportedBy}</span>
                      </div>
                      {lead.contactNumber && (
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Phone className="w-3 h-3 text-rose-400" />
                          <span className="font-mono">{lead.contactNumber}</span>
                        </div>
                      )}
                      {lead.contactEmail && (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Mail className="w-3 h-3 text-slate-500" />
                          <span className="font-mono truncate">{lead.contactEmail}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Eyewitness Notes */}
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">EYEWITNESS REPORT / CLUES:</span>
                  <p className="text-slate-300 italic text-[11px] leading-relaxed line-clamp-3">
                    "{lead.notes || 'No description provided.'}"
                  </p>
                </div>

                {/* Case Match & Association Status */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">CASE ASSOCIATION:</span>
                    {lead.confidenceScore ? (
                      <span className="text-[11px] font-mono text-amber-300 font-bold">
                        AI Score: {lead.confidenceScore}%
                      </span>
                    ) : null}
                  </div>

                  {matchedCase ? (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-blue-950/30 border border-blue-800/40">
                      <div className="flex items-center gap-2 min-w-0">
                        {matchedCase.photoUrl ? (
                          <img src={matchedCase.photoUrl} alt={matchedCase.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                            <UserCheck className="w-4 h-4 text-blue-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">{matchedCase.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">Case #{matchedCase.caseNumber}</span>
                        </div>
                      </div>
                      {onSelectPerson && (
                        <button
                          onClick={() => onSelectPerson(matchedCase)}
                          className="px-2 py-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 font-semibold text-[10px] transition shrink-0"
                        >
                          View Dossier
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-950/20 border border-amber-800/30">
                      <span className="text-[11px] text-amber-300 font-medium">Unlinked Community Sighting</span>
                      <button
                        onClick={() => setLinkingLeadId(lead.id)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[10px] flex items-center gap-1 transition"
                      >
                        <Link2 className="w-3 h-3 text-amber-400" />
                        <span>Link to Case</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Lead Action Buttons */}
                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Run AI Search against all active cases */}
                    {lead.photoUrl && (
                      <button
                        type="button"
                        onClick={() => onSearchWithAi(lead)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1.5 transition shadow-sm"
                        title="Search all registered missing persons dossiers using AI vision"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                        <span>Search All Cases with AI</span>
                      </button>
                    )}

                    {/* Confirm Found Person Safe Action */}
                    {isFoundReport && (
                      <button
                        type="button"
                        onClick={() => handleOpenConfirmFound(lead)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition shadow-sm shadow-emerald-950/50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirm Found Safe</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Status Select dropdown */}
                    {onUpdateLead && (
                      <select
                        value={lead.status}
                        onChange={(e) => onUpdateLead(lead.id, { status: e.target.value as SightingLead['status'] })}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-rose-500 font-semibold"
                      >
                        <option value="Pending Review">Pending Review</option>
                        <option value="High Priority">High Priority</option>
                        <option value="Verified Match">Verified Match</option>
                        <option value="Manual Review Required">Manual Review</option>
                        <option value="Dismissed">Dismissed</option>
                      </select>
                    )}

                    {/* Delete Lead */}
                    {onDeleteLead && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove sighting lead #${lead.id}?`)) {
                            onDeleteLead(lead.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition"
                        title="Delete Lead"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Link to Case Modal / Popover */}
                {linkingLeadId === lead.id && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-blue-500/50 space-y-2 mt-2">
                    <span className="text-xs font-semibold text-white block">Select Missing Person to Link:</span>
                    <select
                      value={targetCaseId}
                      onChange={(e) => setTargetCaseId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Choose Case Dossier --</option>
                      {missingPersons
                        .filter((p) => !p.is_deleted && p.status !== 'Archived')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.alertType}] {p.name} (Case #{p.caseNumber})
                          </option>
                        ))}
                    </select>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setLinkingLeadId(null)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!targetCaseId}
                        onClick={() => handleLinkCase(lead)}
                        className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs disabled:opacity-50"
                      >
                        Save Link
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Zoom Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setSelectedPhoto(null)}>
          <div className="relative max-w-3xl max-h-[85vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={selectedPhoto} alt="Full Lead Evidence" className="max-w-full max-h-[75vh] object-contain rounded-xl mx-auto" />
            <div className="p-3 text-center">
              <button
                onClick={() => setSelectedPhoto(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Close Full Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Found Modal from Lead */}
      {confirmFoundPerson && (
        <ConfirmFoundModal
          isOpen={Boolean(confirmFoundPerson)}
          person={confirmFoundPerson}
          currentUser={currentUser}
          onClose={() => setConfirmFoundPerson(null)}
          onConfirmed={(updated) => {
            setConfirmFoundPerson(null);
          }}
        />
      )}
    </div>
  );
};
