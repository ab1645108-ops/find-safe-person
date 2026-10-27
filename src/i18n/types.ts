export type Language = 'en' | 'ta' | 'hi' | 'ml' | 'te' | 'kn' | 'or';

export interface LanguageOption {
  code: Language;
  name: string;
  nativeName: string;
  shortLabel: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', shortLabel: 'EN' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', shortLabel: 'தமி' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', shortLabel: 'हिन्' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', shortLabel: 'മല' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', shortLabel: 'తె' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', shortLabel: 'ಕನ್' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', shortLabel: 'ଓଡ଼ି' },
];

export interface TranslationSchema {
  nav: {
    publicTicker: string;
    sarTicker: string;
    publicDesk: string;
    sarTerminal: string;
    publicPortalBadge: string;
    sarCenterBadge: string;
    publicSubtitle: string;
    sarSubtitle: string;
    cases: string;
    leads: string;
    alerts: string;
    deduplication: string;
    assistant: string;
    requests: string;
    publicBulletins: string;
    reportMissing: string;
    foundPerson: string;
    sighting: string;
    profile: string;
    logout: string;
    signIn: string;
    auditLogs: string;
    rbacAudit: string;
    citizenLogin: string;
    investigatorLogin: string;
    adminLogin: string;
    switchUser: string;
    signedInAs: string;
  };
  theme: {
    title: string;
    aurora: string;
    auroraDesc: string;
    ocean: string;
    oceanDesc: string;
    daylight: string;
    daylightDesc: string;
  };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    activeProfiles: string;
    verifiedSafe: string;
    communityTips: string;
    reportMissingCardTitle: string;
    reportMissingCardDesc: string;
    reportMissingCardCta: string;
    foundPersonCardTitle: string;
    foundPersonCardDesc: string;
    foundPersonCardCta: string;
    activeBulletinsCardTitle: string;
    activeBulletinsCardDesc: string;
    activeBulletinsCardCta: string;
  };
  portal: {
    overviewTab: string;
    myReportsTab: string;
    trackTab: string;
    searchPlaceholder: string;
    searchByName: string;
    searchByCode: string;
    searchByReporter: string;
    searchAll: string;
    trackingCodeInput: string;
    trackButton: string;
    clearTrack: string;
    urgentDispatches: string;
    activeCases: string;
    noBulletins: string;
    viewDossier: string;
    reportSightingFor: string;
    printFlyer: string;
    shareCase: string;
    missingSince: string;
    lastSeen: string;
    age: string;
    yearsOld: string;
    gender: string;
    riskLevel: string;
    caseNumber: string;
    agency: string;
    contact: string;
    myReportsTitle: string;
    myReportsDesc: string;
    noMyReports: string;
    reportFirstCase: string;
    editCase: string;
    deleteCase: string;
    stageReported: string;
    stageVerified: string;
    stageSearching: string;
    stageLocated: string;
    stageArchived: string;
    medicalConditions: string;
    description: string;
    filterAll: string;
    filterActive: string;
  };
  cases: {
    title: string;
    subtitle: string;
    filterStatus: string;
    filterRisk: string;
    filterAlert: string;
    allStatuses: string;
    activeOnly: string;
    locatedSafe: string;
    investigating: string;
    archived: string;
    extremeRisk: string;
    highRisk: string;
    moderateRisk: string;
    exportData: string;
    addNewCase: string;
    scanFace: string;
    generateAlert: string;
    medicalAlert: string;
    marks: string;
    clothing: string;
    assignedOfficer: string;
    markLocatedSafe: string;
    reopenCase: string;
    totalCases: string;
  };
  leads: {
    title: string;
    subtitle: string;
    totalLeads: string;
    highPriority: string;
    verified: string;
    pendingReview: string;
    emptyQueueTitle: string;
    emptyQueueDesc: string;
    eyewitnessLead: string;
    matchScore: string;
    location: string;
    timeReported: string;
    verifyLead: string;
    dismissLead: string;
    deleteLead: string;
    contactReporter: string;
    notes: string;
  };
  scanner: {
    title: string;
    subtitle: string;
    dropzone: string;
    scanning: string;
    potentialMatches: string;
    noMatch: string;
    confidence: string;
    compareImages: string;
  };
  alertsHub: {
    title: string;
    subtitle: string;
    amberAlert: string;
    silverAlert: string;
    endangeredAlert: string;
    medicalAlertTitle: string;
    dispatchChannels: string;
    smsBroadcast: string;
    highwaySigns: string;
    socialMedia: string;
    radioBroadcast: string;
    dispatchAlert: string;
  };
  modal: {
    reportModalTitle: string;
    reportModalSubtitle: string;
    sightingModalTitle: string;
    sightingModalSubtitle: string;
    fullName: string;
    ageLabel: string;
    genderLabel: string;
    male: string;
    female: string;
    other: string;
    lastSeenDate: string;
    lastSeenLocationLabel: string;
    addressLabel: string;
    photoUpload: string;
    clothingDescription: string;
    physicalDetails: string;
    distinguishingFeatures: string;
    medicalNeeds: string;
    reporterName: string;
    reporterPhone: string;
    reporterEmail: string;
    reporterRelationship: string;
    immediateDanger: string;
    submitReport: string;
    submitSighting: string;
    submitting: string;
    cancel: string;
    close: string;
    save: string;
    deleteConfirm: string;
    deletePrompt: string;
  };
  common: {
    loading: string;
    success: string;
    error: string;
    warning: string;
    urgent: string;
    critical: string;
    status: string;
    action: string;
    details: string;
    back: string;
    next: string;
    yes: string;
    no: string;
    all: string;
    filter: string;
    search: string;
    select: string;
    language: string;
    selectLanguage: string;
  };
}
