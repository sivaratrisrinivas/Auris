import express from "express";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust the reverse proxy (crucial for the Shared URL). 
  // Without this, the rate limiter will see the proxy's IP for all users 
  // and block everyone globally after 2 requests.
  app.set('trust proxy', 1);

  // Use memory storage for fast processing without disk I/O
  const upload = multer({ storage: multer.memoryStorage() });

  app.use(express.json());

  // Rate Limiting: Max 1000 requests per IP to prevent abuse but allow testing
  const apiLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 1000, // Increased limit to prevent proxy interception of 429s
    message: { error: "Rate limit exceeded." }
  });

  // Apply rate limiter to all /api/ routes
  app.use('/api/', apiLimiter);

  // Mock Patient Database (Simulating an EHR integration like Epic/Cerner)
  const mockDatabase: Record<string, any> = {
    "PT-8829": {
      patientId: "PT-8829",
      name: "Jane Doe",
      currentMedications: ["hydrochlorothiazide", "levetiracetam", "apixaban"],
      recentProcedures: ["laparoscopic cholecystectomy"]
    },
    "PT-1042": {
      patientId: "PT-1042",
      name: "Sara Khan",
      currentMedications: ["metoprolol", "clopidogrel", "atorvastatin"],
      recentProcedures: ["coronary angiography", "stent placement"]
    },
    "PT-5531": {
      patientId: "PT-5531",
      name: "Marcus Johnson",
      currentMedications: ["lisinopril", "metformin", "ibuprofen"],
      recentProcedures: ["knee arthroscopy"]
    }
  };

  // 1. Transcribe API Route (Mistral Voxtral)
  app.post(["/api/transcribe", "/api/transcribe/"], upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }
      
      const patientId = req.body.patientId || "PT-8829";
      const patientContext = mockDatabase[patientId] || mockDatabase["PT-8829"];
      
      const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
      if (!MISTRAL_API_KEY) {
        return res.status(500).json({ error: "Missing Mistral API Key" });
      }

      const rawWords = [
        ...patientContext.currentMedications,
        ...patientContext.recentProcedures
      ];
      
      const contextBiasWords = rawWords
        .flatMap(phrase => phrase.split(" "))
        .filter(word => word.length > 0)
        .join(",");

      const voxtralFormData = new FormData();
      voxtralFormData.append("model", "voxtral-mini-2602");
      voxtralFormData.append("context_bias", contextBiasWords);
      voxtralFormData.append("diarize", "true");
      voxtralFormData.append("timestamp_granularities[]", "segment");

      const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
      voxtralFormData.append("file", audioBlob, req.file.originalname || "recording.webm");

      const voxtralResponse = await fetch("https://api.mistral.ai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MISTRAL_API_KEY}`
        },
        body: voxtralFormData
      });

      if (!voxtralResponse.ok) {
        const errText = await voxtralResponse.text();
        throw new Error(`Voxtral API Error: ${errText}`);
      }

      const contentType = voxtralResponse.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error("Mistral API returned an HTML page instead of JSON. The service might be temporarily unavailable.");
      }

      const voxtralData = await voxtralResponse.json();
      res.json({ success: true, transcription: voxtralData.text });

    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to transcribe audio" });
    }
  });

  // 2. Extract API Route (Mistral Agent)
  app.post(["/api/extract", "/api/extract/"], async (req, res) => {
    try {
      const { transcription, patientId } = req.body;
      if (!transcription) {
        return res.status(400).json({ error: "No transcription provided" });
      }

      const patientContext = mockDatabase[patientId || "PT-8829"];
      const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
      const AGENT_ID = process.env.MISTRAL_AGENT_ID;

      if (!MISTRAL_API_KEY || !AGENT_ID) {
        return res.status(500).json({ error: "Missing Mistral credentials" });
      }

      const agentPrompt = `
        Analyze this medical transcription: "${transcription}".
        Respond ONLY with valid JSON matching the schema.
        
        CRITICAL INSTRUCTION FOR 'Patient_Instructions': 
        Do NOT just copy the transcript. You must translate the care plan into a warm, conversational, empathetic script addressed directly to the patient (e.g., "Hi ${patientContext.name.split(' ')[0]}, for your recovery at home..."). Explain their instructions simply, without complex medical jargon. This exact text will be read aloud to them by an AI voice, so make it sound natural and caring.
      `;

      const agentResponse = await fetch("https://api.mistral.ai/v1/agents/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agent_id: AGENT_ID,
          messages: [{ role: "user", content: agentPrompt }],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "medical_extraction",
              schema: {
                type: "object",
                properties: {
                  Diagnosis: { type: "string" },
                  Prescribed_Meds: { type: "array", items: { type: "string" } },
                  Patient_Instructions: { type: "string" }
                },
                required: ["Diagnosis", "Prescribed_Meds", "Patient_Instructions"],
                additionalProperties: false
              }
            }
          }
        })
      });

      if (!agentResponse.ok) {
        const errText = await agentResponse.text();
        throw new Error(`Agent API Error: ${errText}`);
      }

      const contentType = agentResponse.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error("Mistral Agent API returned an HTML page instead of JSON. The service might be temporarily unavailable.");
      }

      const agentData = await agentResponse.json();
      const extractedContent = agentData.choices[0].message.content;
      
      let extractedJson;
      try {
        extractedJson = JSON.parse(extractedContent);
      } catch (e) {
        throw new Error("Mistral Agent returned invalid JSON content. Please try again.");
      }

      res.json({ success: true, data: extractedJson });

    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to extract data" });
    }
  });

  // 3. TTS API Route (ElevenLabs)
  app.post(["/api/tts", "/api/tts/"], async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "No text provided" });
      }

      // Support both VITE_ prefixed and non-prefixed for flexibility in this environment
      const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.VITE_ELEVENLABS_API_KEY;
      const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || process.env.VITE_ELEVENLABS_VOICE_ID;

      if (!ELEVENLABS_API_KEY || !VOICE_ID) {
        return res.status(500).json({ error: "Missing ElevenLabs credentials" });
      }

      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_flash_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.8 }
        })
      });

      if (!ttsRes.ok) {
        const errText = await ttsRes.text();
        throw new Error(`ElevenLabs API Error: ${errText}`);
      }

      const audioBuffer = await ttsRes.arrayBuffer();
      res.set('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(audioBuffer));

    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to generate audio" });
    }
  });

  // 404 handler for API routes (must be before Vite to prevent Vite from returning index.html)
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    // SPA fallback
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  // Global error handler to ensure JSON responses for API errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api/')) {
      console.error("API Error:", err);
      res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
    } else {
      next(err);
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
