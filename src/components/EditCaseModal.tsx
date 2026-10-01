import React, { useState } from 'react';
import { MissingPerson, AlertType, CurrentUser } from '../types';
import { 
  Edit3, Upload, Plus, X, AlertTriangle, Save, MapPin, 
  User, Check, ShieldCheck, HeartPulse, Phone, Mail, Clock, ShieldAlert 
} from 'lucide-react';

interface EditCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  person: MissingPerson;
  onSave: (updated: MissingPerson) => void;
  currentUser?: CurrentUser;
}

export const EditCaseModal: React.FC<EditCaseModalProps> = ({
  isOpen,
  onClose,
  person,
  onSave,
  currentUser,
}) => {
  const [name, setName] = useState(person.name || '');
  const [age, setAge] = useState<number | ''>(person.age ?? 25);
  const [gender, setGender] = useState<'Female' | 'Male' | 'Non-Binary' | 'Other'>(person.gender || 'Female');
  const [alertType, setAlertType] = useState<AlertType>(person.alertType || 'ENDANGERED');
  const [missingSince, setMissingSince] = useState(
    person.missingSince ? new Date(person.missingSince).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)
  );
  const [photoUrl, setPhotoUrl] = useState(person.photoUrl || '');
  const [clothing, setClothing] = useState(person.clothingLastSeen || '');
  const [height, setHeight] = useState(person.physicalDescription?.height || '');
  const [weight, setWeight] = useState(person.physicalDescription?.weight || '');
  const [hair, setHair] = useState(person.physicalDescription?.hair || '');
  const [eyes, setEyes] = useState(person.physicalDescription?.eyes || '');
  const [distinguishingMarks, setDistinguishingMarks] = useState(person.physicalDescription?.distinguishingMarks || '');
  const [locationName, setLocationName] = useState(person.lastSeenLocation?.name || '');
  const [address, setAddress] = useState(person.lastSeenLocation?.address || '');
  const [medicalConditionInput, setMedicalConditionInput] = useState('');
  const [medicalConditions, setMedicalConditions] = useState<string[]>(person.medicalConditions || []);
  const [summary, setSummary] = useState(person.summary || '');
  const [investigatingAgency, setInvestigatingAgency] = useState(person.investigatingAgency || '');
  const [emergencyContact, setEmergencyContact] = useState(person.emergencyContact || '');
  const [reporterPhone, setReporterPhone] = useState(person.reporterPhone || '');
  const [reporterEmail, setReporterEmail] = useState(person.reporterEmail || person.reportedByUserEmail || '');
  const [reporterRelation, setReporterRelation] = useState(person.reporterRelation || 'Family / Relative');
  const [reporterContact, setReporterContact] = useState(person.reporterContact || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmPrompt, setShowConfirmPrompt] = useState(false);

  if (!isOpen) return null;

  const isCitizen = currentUser?.role === 'CITIZEN' || currentUser?.role === 'PUBLIC_USER';

  const handleAddCondition = () => {
    if (medicalConditionInput.trim() && !medicalConditions.includes(medicalConditionInput.trim())) {
      setMedicalConditions([...medicalConditions, medicalConditionInput.trim()]);
      setMedicalConditionInput('');
    }
  };

  const handleRemoveCondition = (idx: number) => {
    setMedicalConditions(medicalConditions.filter((_, i) => i !== idx));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Show required confirmation dialog before saving
    setShowConfirmPrompt(true);
  };

  const handleConfirmedSave = () => {
    setIsSubmitting(true);

    const updatedPerson: MissingPerson = {
      ...person,
      name: name.trim(),
      age: Number(age) || 25,
      gender,
      alertType,
      missingSince: missingSince ? new Date(missingSince).toISOString() : person.missingSince,
      photoUrl: photoUrl.trim() || person.photoUrl,
      clothingLastSeen: clothing.trim() || 'Not specified',
      physicalDescription: {
        height: height.trim() || 'Not specified',
        weight: weight.trim() || 'Not specified',
        hair: hair.trim() || 'Not specified',
        eyes: eyes.trim() || 'Not specified',
        distinguishingMarks: distinguishingMarks.trim() || 'None reported',
      },
      lastSeenLocation: {
        ...person.lastSeenLocation,
        name: locationName.trim() || person.lastSeenLocation.name,
        address: address.trim() || person.lastSeenLocation.address,
      },
      medicalConditions,
      summary: summary.trim() || person.summary,
      investigatingAgency: investigatingAgency.trim() || person.investigatingAgency,
      emergencyContact: emergencyContact.trim() || person.emergencyContact,
      reporterPhone: reporterPhone.trim() || person.reporterPhone,
      reporterEmail: reporterEmail.trim() || person.reporterEmail,
      reporterRelation: reporterRelation.trim() || person.reporterRelation,
      reportedByUserEmail: reporterEmail.trim() || person.reportedByUserEmail,
      reporterContact: [
        reporterPhone.trim() ? `Mobile: ${reporterPhone.trim()}` : '',
        reporterEmail.trim() ? `Email: ${reporterEmail.trim()}` : '',
      ].filter(Boolean).join(' | ') || reporterContact.trim() || person.reporterContact,
      riskLevel: alertType === 'AMBER' || alertType === 'SILVER' ? 'Extreme' : 'High',
      updated_at: new Date().toISOString(),
      last_edited_by: currentUser?.name || 'Citizen Reporter',
      last_edited_role: currentUser?.role || 'CITIZEN',
      hasUnreadCitizenUpdate: isCitizen ? true : person.hasUnreadCitizenUpdate,
    };

    onSave(updatedPerson);
    setIsSubmitting(false);
    setShowConfirmPrompt(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">Edit Case Report</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  REF #{person.caseNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Update missing person details. Changes will synchronize with the central database, Admin, and Investigator portals.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sync & Protected Fields Notice */}
        <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/50 text-xs text-blue-200 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <strong>Central Database Synchronization:</strong> Edits to physical description, clothing, photo, or last known location will be immediately updated across all portals. Administrative fields (Case ID, Detective Verification, Found Status) are securely protected and managed by authorized search coordinators.
          </div>
        </div>

        {/* Confirmation Dialog Overlay */}
        {showConfirmPrompt && (
          <div className="p-4 rounded-xl bg-amber-950/70 border border-amber-600/70 text-amber-200 space-y-3 animate-in fade-in">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Are you sure you want to update this case?</span>
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              Your modifications will update the permanent database record for <strong>{name}</strong> (Case #{person.caseNumber}). All active field teams, the Admin command center, and the assigned Investigator will immediately receive your latest information.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmPrompt(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Review Changes / Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmedSave}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950/50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Saving...' : 'Yes, Confirm & Update Case'}</span>
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
          {/* Section 1: Subject Identity */}
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-200 border-b border-slate-800 pb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>Subject Identification & Demographics</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-slate-400 mb-1 font-medium">Full Legal Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Age</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-Binary">Non-Binary</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Alert Classification</label>
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value as AlertType)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="ENDANGERED">Endangered Missing</option>
                  <option value="AMBER">AMBER Alert (Child)</option>
                  <option value="SILVER">Silver Alert (Senior)</option>
                  <option value="CRITICAL_MEDICAL">Critical Medical Risk</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Missing Date & Time</span>
                </label>
                <input
                  type="datetime-local"
                  value={missingSince}
                  onChange={(e) => setMissingSince(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Photo Upload & Preview */}
          <div className="space-y-2">
            <label className="block text-slate-300 font-semibold">Photograph</label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                {photoUrl ? (
                  <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-slate-600" />
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <input
                  type="text"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="Paste direct photo URL..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Image File</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                  <span className="text-[10px] text-slate-500">JPG, PNG, WebP supported</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Location Details */}
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-200 border-b border-slate-800 pb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-rose-400" />
              <span>Last Known Location</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Location Landmark / Area Name</label>
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g. Roseville Galleria or Central Park"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Street Address or Cross Streets</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 1151 Galleria Blvd, Roseville, CA"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Clothing, Physical Markers & Summary */}
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-200 border-b border-slate-800 pb-1 flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-amber-400" />
              <span>Description, Clothing & Physical Markers</span>
            </h3>

            <div>
              <label className="block text-slate-400 mb-1">Clothing & Attire Last Seen Wearing</label>
              <textarea
                rows={2}
                value={clothing}
                onChange={(e) => setClothing(e.target.value)}
                placeholder="e.g. Navy blue hooded jacket, dark jeans, white athletic sneakers..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">Height</label>
                <input
                  type="text"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="e.g. 5'9&quot;"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">Weight</label>
                <input
                  type="text"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="e.g. 150 lbs"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">Hair</label>
                <input
                  type="text"
                  value={hair}
                  onChange={(e) => setHair(e.target.value)}
                  placeholder="e.g. Brown, wavy"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">Eyes</label>
                <input
                  type="text"
                  value={eyes}
                  onChange={(e) => setEyes(e.target.value)}
                  placeholder="e.g. Hazel"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">Distinguishing Marks / Scars / Tattoos</label>
              <input
                type="text"
                value={distinguishingMarks}
                onChange={(e) => setDistinguishingMarks(e.target.value)}
                placeholder="e.g. Small scar above left eyebrow, silver watch..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Circumstances of Disappearance / Summary</label>
              <textarea
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Describe timeline and any relevant behavior prior to missing..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Section 5: Medical Needs */}
          <div className="space-y-1.5">
            <label className="block text-slate-400 font-medium">Medical Conditions / Critical Needs</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={medicalConditionInput}
                onChange={(e) => setMedicalConditionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCondition();
                  }
                }}
                placeholder="e.g. Requires daily insulin, Asthma, Dementia..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddCondition}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
              >
                Add
              </button>
            </div>
            {medicalConditions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {medicalConditions.map((cond, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-950/60 border border-rose-800 text-rose-300 text-xs"
                  >
                    <span>{cond}</span>
                    <button type="button" onClick={() => handleRemoveCondition(idx)} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Section 6: Reporter Contact Information */}
          <div className="space-y-2 pt-1 border-t border-slate-800">
            <h3 className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Reporter Contact Information</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 text-xs">Reporter Mobile Phone</label>
                <input
                  type="tel"
                  value={reporterPhone}
                  onChange={(e) => setReporterPhone(e.target.value)}
                  placeholder="e.g. +1 (916) 555-0188"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 text-xs">Reporter Email</label>
                <input
                  type="email"
                  value={reporterEmail}
                  onChange={(e) => setReporterEmail(e.target.value)}
                  placeholder="e.g. reporter@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 text-xs">Relationship to Person</label>
                <input
                  type="text"
                  value={reporterRelation}
                  onChange={(e) => setReporterRelation(e.target.value)}
                  placeholder="e.g. Parent, Sibling, Spouse"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold transition flex items-center gap-2 shadow-lg shadow-blue-950/50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save & Sync Case Details'}</span>
            </button>
          </div>
        </form>

        {/* Confirmation Dialog Overlay */}
        {showConfirmPrompt && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-blue-500/50 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                  <AlertTriangle className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Confirm Case Update</h3>
                  <p className="text-xs text-slate-400">Case #{person.caseNumber}</p>
                </div>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed">
                Are you sure you want to update this case?
              </p>

              <p className="text-xs text-slate-400 leading-relaxed">
                Changes will be saved to the permanent central database and automatically synchronized with the Admin and Investigator command portals.
              </p>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConfirmPrompt(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmedSave}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 transition shadow-lg shadow-blue-950/50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Updating...' : 'Yes, Update Case'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
