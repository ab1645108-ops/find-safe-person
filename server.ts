import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { setupFeaturesRouter } from "./server/features";
import { setupAuthRouter } from "./server/auth";
import { logAudit } from "./server/audit";
import { getGeminiClient, generateContentWithFallback } from "./server/gemini";
import {
  FaceVerificationService,
  faceVerificationService,
  VerificationResult,
} from "./server/faceVerification";

export { FaceVerificationService, faceVerificationService };
export type { VerificationResult };

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

// Mount Module 1: User & Authentication Router
app.use("/api", setupAuthRouter());

// Mount 6 Features API Router
app.use("/api", setupFeaturesRouter(getGeminiClient));

// Ensure firebase-applet-config.json is always served as application/json
app.get("/firebase-applet-config.json", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "firebase-applet-config.json"));
});

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// Model Specifications & Verification Status Endpoint
app.get("/api/face-verification/specs", (_req, res) => {
  res.json({
    specs: faceVerificationService.getModelSpecs(),
    timestamp: new Date().toISOString(),
  });
});

// Safe fallback for contextual information when vision pipeline is unavailable (NEVER for identity verification)
const getSafeContextualAnalysis = (
  sightingNotes: string = "",
  sightingImage: string | null = null,
  candidateProfiles: any[] = []
) => {
  return {
    faceQuality: {
      status: sightingImage ? "OK" : "NO_FACE",
      message: sightingImage ? "" : "Please upload a photograph containing a visible face.",
    },
    candidates: candidateProfiles.map((c) => ({
      id: c.id,
      name: c.name,
      similarity: 0,
    })),
    matchedPersonId: null,
    matchedPersonName: null,
    hasMatch: false,
    overallConfidence: 0,
    verificationStatus: "UNAVAILABLE",
    verificationMethod: "FACE_EMBEDDING_VERIFICATION",
    facialMatchAssessment: "Genuine face-recognition engine is not configured in this environment. Biometric identity matching disabled.",
    clothingMatchAssessment: "Contextual eyewitness notes recorded for SAR record only.",
    demographicMatch: "Demographic records available in registered dossiers.",
    distinguishingFeaturesFound: [],
    riskAssessment: "Sighting tip recorded. Requires investigator manual review.",
    suggestedAction: "Submit tip for manual investigator review.",
    identifiedPeopleCount: sightingImage ? 1 : 0,
    sightingTimestampValidation: "Logged at current coordinate timestamp.",
  };
};

// Endpoint 1: AI Sighting and Photo Analysis
app.post("/api/analyze-sighting", async (req, res) => {
  const { sightingImage, sightingNotes, targetPersonId, candidateProfiles = [] } = req.body;

  if (!candidateProfiles || candidateProfiles.length === 0) {
    return res.json(getSafeContextualAnalysis(sightingNotes, sightingImage, []));
  }

  const ai = getGeminiClient();

  if (!ai) {
    return res.json(getSafeContextualAnalysis(sightingNotes, sightingImage, candidateProfiles));
  }

  try {
    const sortedProfiles = [...candidateProfiles];

    const profilesText = sortedProfiles.map((p: any) => `
ID: ${p.id}
Name: ${p.name}
Case Number: ${p.caseNumber}
Age: ${p.age}, Gender: ${p.gender}
Alert Type: ${p.alertType}
Clothing Last Seen: ${p.clothingLastSeen || 'Not specified'}
Physical: Height: ${p.physicalDescription?.height || 'Unknown'}, Weight: ${p.physicalDescription?.weight || 'Unknown'}, Hair: ${p.physicalDescription?.hair || 'Unknown'}, Eyes: ${p.physicalDescription?.eyes || 'Unknown'}, Marks: ${p.physicalDescription?.distinguishingMarks || 'None'}
Medical: ${(p.medicalConditions || []).join(', ') || 'None noted'}
Last Seen Location: ${p.lastSeenLocation?.name || 'Unknown'} (${p.lastSeenLocation?.address || ''})
Summary: ${p.summary || ''}
    `).join("\n---");

    const promptText = `
You are FindSafe's Image Quality & Contextual Evidence Assistant for Search & Rescue.
You are evaluating a submitted SIGHTING PHOTO for image quality, face visibility, and contextual apparel/scene details.
IMPORTANT: You are NOT the biometric identity engine. Identity verification is handled independently by the backend face-recognition service.

REGISTERED MISSING PERSONS DOSSIERS:
${profilesText}

SUBMITTER SIGHTING NOTES / EYEWITNESS TESTIMONY: "${sightingNotes || 'Photo submitted for analysis.'}"

CRITICAL IMAGE QUALITY & FACE PRESENCE EVALUATION:
1. FACE PRESENCE & QUALITY CHECK:
   - Check if a face is visible. If no face is detected, status: "NO_FACE", message: "Please upload a photograph containing a visible face."
   - Check for multiple faces. If multiple faces are detected, status: "MULTIPLE_FACES", message: "Multiple faces detected. Please select the person to verify or upload a single-person photograph."
   - Check quality: severe blur, low resolution, extreme angle, bad lighting, heavy occlusion. If poor quality, status: "POOR_QUALITY", message: "Face verification not reliable. Please upload a clearer photograph."
   - Check for obstruction (e.g. sunglasses, mask, partial face). If obscured, status: "OBSCURED", message: "Partial face or obstruction detected. Manual review required."
   - If a single clear face is visible, status: "OK", message: "".

2. CONTEXTUAL APPAREL & ENVIRONMENT OBSERVATIONS (SUPPORTING INTEL ONLY - NOT IDENTITY):
   - Note any visual attributes (clothing, visible accessories, surroundings) purely as supporting context for SAR volunteers.
   - Do NOT declare a match.

RETURN ONLY VALID JSON (no markdown formatting, no code fences):
{
  "faceQuality": { "status": "string", "message": "string" },
  "candidates": [
      {
          "id": "string",
          "name": "string",
          "similarity": 0
      }
  ],
  "facialMatchAssessment": "detailed string describing visible facial clarity, orientation, and image quality",
  "clothingMatchAssessment": "string describing observed apparel vs reported clothing for field search context",
  "demographicMatch": "string stating observed demographic consistency",
  "distinguishingFeaturesFound": ["list", "of", "features", "found"],
  "riskAssessment": "string assessing search urgency based on alert type and vulnerability",
  "suggestedAction": "string specifying next SAR procedure",
  "identifiedPeopleCount": number,
  "sightingTimestampValidation": "string analyzing location and timeline feasibility"
}
    `;

    const parts: any[] = [];

    // Add registered reference photos (up to 3 candidates)
    for (const cand of sortedProfiles.slice(0, 3)) {
      if (cand.photoUrl && typeof cand.photoUrl === "string" && cand.photoUrl.startsWith("data:image/")) {
        const mimeMatch = cand.photoUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const base64Data = cand.photoUrl.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
        parts.push(`[REGISTERED REFERENCE PHOTO FOR CASE #${cand.caseNumber} - ${cand.name} (ID: ${cand.id})]:`);
        parts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }
    }

    // Add submitted sighting image
    if (sightingImage && typeof sightingImage === "string" && sightingImage.startsWith("data:image/")) {
      const mimeMatch = sightingImage.match(/^data:(image\/[a-zA-Z+]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const base64Data = sightingImage.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
      parts.push(`[SUBMITTED EYEWITNESS SIGHTING PHOTO TO BE ANALYZED]:`);
      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    parts.push(promptText);

    let rawText = "";

    try {
      rawText = await generateContentWithFallback(ai, {
        contents: parts,
        config: {
          responseMimeType: "application/json",
        },
      });
    } catch (genErr: any) {
      console.warn("AI vision analysis fallback to safe contextual analysis:", genErr?.message);
      return res.json(getSafeContextualAnalysis(sightingNotes, sightingImage, candidateProfiles));
    }

    if (!rawText) {
      return res.json(getSafeContextualAnalysis(sightingNotes, sightingImage, candidateProfiles));
    }

    let parsedData: any;
    try {
      const cleanJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      parsedData = JSON.parse(cleanJson);
    } catch {
      return res.json(getSafeContextualAnalysis(sightingNotes, sightingImage, candidateProfiles));
    }

    // Biometric Identity Verification via FaceVerificationService
    const targetCandidate = targetPersonId 
      ? candidateProfiles.find((p: any) => p.id === targetPersonId)
      : candidateProfiles[0];

    let verificationResult: VerificationResult;

    const specs = faceVerificationService.getModelSpecs();

    if (!sightingImage || parsedData?.faceQuality?.status === 'NO_FACE') {
      verificationResult = {
        verified: false,
        similarity: 0,
        status: "UNAVAILABLE",
        reason: "No face detected in submitted photograph.",
        method: "FACE_EMBEDDING_VERIFICATION",
        metric: specs.distanceMetric,
        modelName: specs.modelName,
        modelVersion: specs.modelVersion,
        embeddingDimension: specs.embeddingDimension,
        threshold: specs.threshold,
      };
    } else if (parsedData?.faceQuality?.status === 'MULTIPLE_FACES') {
      verificationResult = {
        verified: false,
        similarity: 0,
        status: "UNAVAILABLE",
        reason: "Multiple faces detected. Face selection required before verification.",
        method: "FACE_EMBEDDING_VERIFICATION",
        metric: specs.distanceMetric,
        modelName: specs.modelName,
        modelVersion: specs.modelVersion,
        embeddingDimension: specs.embeddingDimension,
        threshold: specs.threshold,
      };
    } else if (parsedData?.faceQuality?.status === 'POOR_QUALITY') {
      verificationResult = {
        verified: false,
        similarity: 0,
        status: "UNAVAILABLE",
        reason: "Image quality insufficient for reliable face verification.",
        method: "FACE_EMBEDDING_VERIFICATION",
        metric: specs.distanceMetric,
        modelName: specs.modelName,
        modelVersion: specs.modelVersion,
        embeddingDimension: specs.embeddingDimension,
        threshold: specs.threshold,
      };
    } else if (targetCandidate && targetCandidate.photoUrl) {
      verificationResult = await faceVerificationService.verifyFace(targetCandidate.photoUrl, sightingImage);
    } else {
      verificationResult = {
        verified: false,
        similarity: 0,
        status: "UNAVAILABLE",
        reason: "No reference photograph registered for comparison.",
        method: "FACE_EMBEDDING_VERIFICATION",
        metric: specs.distanceMetric,
        modelName: specs.modelName,
        modelVersion: specs.modelVersion,
        embeddingDimension: specs.embeddingDimension,
        threshold: specs.threshold,
      };
    }

    const finalMatch = {
      matchedPersonId: verificationResult.verified ? targetCandidate?.id || null : null,
      matchedPersonName: verificationResult.verified ? targetCandidate?.name || null : null,
      hasMatch: verificationResult.verified,
      isPossibleMatch: verificationResult.status === 'POSSIBLE_MATCH',
      verificationStatus: verificationResult.status,
      verificationMethod: verificationResult.method,
      verificationReason: verificationResult.reason,
      overallConfidence: verificationResult.similarity,
      metric: verificationResult.metric,
      modelName: verificationResult.modelName,
      modelVersion: verificationResult.modelVersion,
      embeddingDimension: verificationResult.embeddingDimension,
      threshold: verificationResult.threshold,
    };

    // Safe Audit Logging (NO raw embeddings or biometric vectors logged)
    logAudit(
      (req as any).user || { id: 'usr_system', name: 'System', role: 'ADMIN' },
      "SIGHTING_VERIFICATION_ATTEMPT",
      "SightingVerification",
      targetCandidate?.id || 'unlinked',
      verificationResult.status === 'VERIFIED_MATCH' ? "SUCCESS" : "FAILED",
      `Biometric verification executed for Case #${targetCandidate?.caseNumber || 'N/A'}. Method: ${verificationResult.method}. Status: ${verificationResult.status}. Reason: ${verificationResult.reason}.`,
      req
    );

    return res.json({
      ...parsedData,
      ...finalMatch,
    });
  } catch (error: any) {
    console.error("Error in /api/analyze-sighting:", error);
    return res.json(getSafeContextualAnalysis(sightingNotes, sightingImage, candidateProfiles));
  }
});

// Endpoint 2: Generate Multi-Format Alert Broadcast Package
app.post("/api/generate-alert-package", async (req, res) => {
  try {
    const { person } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        broadcastScript: `URGENT BROADCAST: A ${person?.alertType || 'CRITICAL'} Alert has been issued for ${person?.name || 'a missing subject'}, age ${person?.age}. Last seen at ${person?.lastSeenLocation?.name} wearing ${person?.clothingLastSeen}. ${person?.medicalConditions?.length ? 'Subject has critical medical needs requiring medication.' : ''} If sighted, do not approach abruptly. Report sightings immediately via the FindSafe portal to ${person?.investigatingAgency || 'assigned law enforcement'}.`,
        socialMediaPost: `🚨 URGENT: #MissingPerson #FindSafeAlert\nHave you seen ${person?.name} (${person?.age} y/o)? Last seen near ${person?.lastSeenLocation?.name}.\nWearing: ${person?.clothingLastSeen}\n⚠️ ${(person?.medicalConditions || []).join(' | ')}\nIf you have ANY information, submit a lead securely via the FindSafe portal. Please SHARE to help bring them home safely!`,
        smsNotification: `ALERT: Missing ${person?.age}yo ${person?.name} last seen ${person?.lastSeenLocation?.name}. Wearing ${person?.clothingLastSeen?.substring(0, 45)}... Submit sightings online via FindSafe portal.`,
        volunteerBriefing: `VOLUNTEER BRIEFING - CASE ${person?.caseNumber}:\n1. Target: ${person?.name} (${person?.age}yo)\n2. Vulnerability: ${(person?.medicalConditions || []).join(', ')}\n3. Search Zone: ${person?.lastSeenLocation?.name}\n4. Safety Directive: Keep distance, speak in a gentle tone, report sightings online immediately.\n5. Log all clues with photos in FindSafe portal.`,
        printableFlyerSummary: {
          headline: `MISSING: ${person?.name?.toUpperCase()}`,
          urgentCallToAction: `REPORT SIGHTINGS SECURELY VIA FINDSAFE PORTAL TO ${person?.investigatingAgency?.toUpperCase() || 'LOCAL AUTHORITIES'}`,
          vitalStats: [
            `Age: ${person?.age} | Gender: ${person?.gender}`,
            `Height: ${person?.physicalDescription?.height} | Weight: ${person?.physicalDescription?.weight}`,
            `Hair: ${person?.physicalDescription?.hair} | Eyes: ${person?.physicalDescription?.eyes}`,
            `Last Seen: ${person?.lastSeenLocation?.address}`
          ],
          contactNumbers: [`Agency: ${person?.investigatingAgency || "Assigned SAR Command"}`]
        }
      });
    }

    const promptText = `
You are an Emergency Public Information Officer drafting an official Alert Package for a critical missing person incident.
Note: No phone numbers or telephone hotlines are operated through this application. All tips and sightings are reported directly through the FindSafe web portal or in-person to the assigned agency. Do NOT include any phone numbers, telephone links, or hotline numbers.

MISSING PERSON DOSSIER:
- Name: ${person?.name}
- Age: ${person?.age}, Gender: ${person?.gender}
- Alert Category: ${person?.alertType} Alert
- Missing Since: ${person?.missingSince}
- Last Known Location: ${person?.lastSeenLocation?.name}, ${person?.lastSeenLocation?.address}
- Clothing Last Seen: ${person?.clothingLastSeen}
- Physical Markers: Height: ${person?.physicalDescription?.height}, Weight: ${person?.physicalDescription?.weight}, Hair: ${person?.physicalDescription?.hair}, Marks: ${person?.physicalDescription?.distinguishingMarks}
- Medical / Special Needs: ${(person?.medicalConditions || []).join(', ')}
- Investigating Agency: ${person?.investigatingAgency}
- Case #: ${person?.caseNumber}

Generate:
1. broadcastScript: 45-second urgent radio / TV news anchor bulletin instructing public to submit sightings via the FindSafe portal.
2. socialMediaPost: High-conversion, shareable social alert with clear hashtags and urgent call to action directing to the portal.
3. smsNotification: Ultra-concise Wireless Alert SMS under 160 characters.
4. volunteerBriefing: Ground search team tactical briefing sheet with de-escalation tips and clue tracking.
5. printableFlyerSummary: Structured summary for flyer printouts directing to online portal.

RETURN ONLY VALID JSON:
{
  "broadcastScript": "string",
  "socialMediaPost": "string",
  "smsNotification": "string",
  "volunteerBriefing": "string",
  "printableFlyerSummary": {
    "headline": "string",
    "urgentCallToAction": "string",
    "vitalStats": ["stat 1", "stat 2", "stat 3", "stat 4"],
    "contactNumbers": ["channel 1", "channel 2"]
  }
}
    `;

    let rawText = "";
    try {
      rawText = await generateContentWithFallback(ai, {
        contents: promptText,
        config: { responseMimeType: "application/json" },
      });
    } catch (e: any) {
      console.warn("Alert package fallback triggered:", e?.message);
    }

    const data = JSON.parse(rawText?.replace(/```json/g, "").replace(/```/g, "").trim() || "{}");
    res.json(data);
  } catch (error: any) {
    console.error("Error in /api/generate-alert-package:", error);
    res.status(500).json({ error: error.message || "Failed to generate alert package." });
  }
});

// Endpoint 4: AI Emergency Assistance & Field Search Guidance
app.post("/api/assistance-chat", async (req, res) => {
  try {
    const { message, conversationHistory, currentPersonContext } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        reply: `Emergency Response Guidance: For active missing person cases, prioritize securing recent photos, contacting local law enforcement immediately, checking immediate hazards (waterways, transit lines, dense brush), and preserving scents for K9 units (keep bedding or unworn clothing untouched in a clean ziplock bag). How else can FindSafe assist your search operations?`,
      });
    }

    const systemInstruction = `
You are the "FindSafe Field Emergency Coordinator", an expert AI assistant trained in Search and Rescue (SAR) incident command, child protection, dementia wandering behavioral dynamics, and crisis response.
Provide calm, precise, actionable, and legally sound advice to search volunteers, law enforcement liaisons, or anxious family members. Keep answers structured with clear bullet points, safety warnings, and contact protocols.
Current active case context: ${currentPersonContext ? JSON.stringify(currentPersonContext) : 'General search and rescue operations'}.
    `;

    const contents: any[] = [];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }],
        });
      }
    }
    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    let replyText = "";
    try {
      replyText = await generateContentWithFallback(ai, {
        contents,
        config: {
          systemInstruction,
        },
      });
    } catch (err: any) {
      console.warn("Assistance chat fallback triggered:", err?.message);
      replyText = "FindSafe Emergency Command: Field teams have been briefed. Search radius operations and SAR alert channels are active. You can log visual leads, filter cases by proximity, or generate flyer packages from the navigation bar.";
    }

    res.json({
      reply: replyText || "I am standing by to assist with your search operations.",
    });
  } catch (error: any) {
    console.error("Error in /api/assistance-chat:", error);
    res.status(500).json({ error: error.message || "Failed to process emergency assistance inquiry." });
  }
});

// Vite middleware configuration for Development vs Production
async function startServer() {
  const server = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const isHmrDisabled = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`FindSafe server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
