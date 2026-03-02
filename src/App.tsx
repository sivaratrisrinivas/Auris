/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { useReactMediaRecorder } from "react-media-recorder";
import { Mic, Square, ArrowRight, Activity, RotateCcw, CheckCircle2, Circle, ArrowDown, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Mock Patient Database for the UI
const PATIENTS = [
  { id: "PT-8829", name: "Jane Doe", details: "Cholecystectomy Follow-up", meds: ["hydrochlorothiazide", "levetiracetam", "apixaban"], procedures: ["laparoscopic cholecystectomy"] },
  { id: "PT-1042", name: "Sara Khan", details: "Post-MI Cardiology", meds: ["metoprolol", "clopidogrel", "atorvastatin"], procedures: ["coronary angiography", "stent placement"] },
  { id: "PT-5531", name: "Marcus Johnson", details: "Orthopedic Post-op", meds: ["lisinopril", "metformin", "ibuprofen"], procedures: ["knee arthroscopy"] }
];

export default function App() {
  const [step, setStep] = useState<'patient' | 'record' | 'processing' | 'results'>('patient');
  const [apiStep, setApiStep] = useState<0 | 1 | 2 | 3>(0);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [transcription, setTranscription] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [selectedPatientId, setSelectedPatientId] = useState(PATIENTS[0].id);
  const activePatient = PATIENTS.find(p => p.id === selectedPatientId) || PATIENTS[0];
  
  const hiddenFileInput = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { status, startRecording, stopRecording } = useReactMediaRecorder({
    audio: true,
    onStop: async (blobUrl, blob) => {
      await processAudioFlow(blob);
    }
  });

  const processAudioFlow = async (audioBlob: Blob | File) => {
    setStep('processing');
    setApiStep(1); // Transcribing
    setErrorMsg("");
    setTranscription(null);
    setExtractedData(null);
    setAudioUrl(null);

    try {
      // 1. Transcribe with Mistral Voxtral
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");
      formData.append("patientId", selectedPatientId);

      const searchParams = new URLSearchParams(window.location.search);
      const token = searchParams.get("__aistudio_auth_token");

      const headers: Record<string, string> = {
        "x-auris-bypass": "askubusku18@gmail.com"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
        headers["x-aistudio-auth-token"] = token;
      }

      const transcribeRes = await fetch("/api/transcribe", { 
        method: "POST", 
        body: formData,
        credentials: "include",
        headers
      });

      if (!transcribeRes.ok) {
        const errData = await transcribeRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to transcribe audio with Mistral Voxtral");
      }
      const transcribeData = await transcribeRes.json();
      const text = transcribeData.transcription;
      setTranscription(text);

      // 2. Extract with Mistral Agent
      setApiStep(2);
      
      const extractHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "x-auris-bypass": "askubusku18@gmail.com"
      };
      if (token) {
        extractHeaders["Authorization"] = `Bearer ${token}`;
        extractHeaders["x-aistudio-auth-token"] = token;
      }

      const extractRes = await fetch("/api/extract", {
        method: "POST",
        credentials: "include",
        headers: extractHeaders,
        body: JSON.stringify({ transcription: text, patientId: selectedPatientId })
      });

      if (!extractRes.ok) {
        const errData = await extractRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to extract data with Mistral Agent");
      }
      const extractData = await extractRes.json();
      setExtractedData(extractData.data);

      // 3. Generate Audio with ElevenLabs REST API (Zero Stuttering)
      setApiStep(3);
      if (extractData.data?.Patient_Instructions) {
        const ttsHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          "x-auris-bypass": "askubusku18@gmail.com"
        };
        if (token) {
          ttsHeaders["Authorization"] = `Bearer ${token}`;
          ttsHeaders["x-aistudio-auth-token"] = token;
        }

        const ttsRes = await fetch("/api/tts", {
          method: "POST",
          credentials: "include",
          headers: ttsHeaders,
          body: JSON.stringify({ text: extractData.data.Patient_Instructions })
        });

        if (ttsRes.ok) {
          const audioBlob = await ttsRes.blob();
          setAudioUrl(URL.createObjectURL(audioBlob));
        } else {
          const errData = await ttsRes.json().catch(() => ({}));
          throw new Error(errData.error || "TTS Generation failed.");
        }
      }

      // Done
      setStep('results');
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || "An error occurred during processing.");
      setStep('record'); // Go back so they can retry
    }
  };

  const handleFallbackUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processAudioFlow(e.target.files[0]);
    }
  };

  // Auto-play audio when results load
  useEffect(() => {
    if (step === 'results' && audioUrl) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      audio.play().catch(e => console.error("Autoplay blocked:", e));
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [step, audioUrl]);

  const resetFlow = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setStep('patient');
    setTranscription(null);
    setExtractedData(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setApiStep(0);
  };

  return (
    <div className="min-h-screen bg-[#f0ede8] dot-grid text-zinc-900 font-sans selection:bg-[#9e2a2b] selection:text-white relative overflow-x-hidden flex flex-col">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 opacity-30">
        <motion.div
          animate={{
            y: [0, -40, 0],
            x: [0, 30, 0],
            rotate: [0, 10, -10, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-[40%_60%_70%_30%] mix-blend-multiply filter blur-[80px] bg-[#9e2a2b]/40"
        />
        <motion.div
          animate={{
            y: [0, 50, 0],
            x: [0, -40, 0],
            rotate: [0, -15, 10, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-[-20%] right-[-10%] w-[70vw] h-[70vw] rounded-[60%_40%_30%_70%] mix-blend-multiply filter blur-[100px] bg-[#7a1c1c]/30"
        />
      </div>

      {/* Hero Section */}
      <div className="relative min-h-screen flex flex-col items-center justify-center z-10 px-6">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="text-center max-w-4xl mx-auto"
        >
          <h1 className="font-serif text-7xl md:text-9xl lg:text-[11rem] leading-none tracking-tighter text-zinc-900 mb-6 drop-shadow-sm">
            Auris
          </h1>
          <p className="font-serif italic text-2xl md:text-4xl text-zinc-600 mb-16">
            Clinical intelligence, refined.
          </p>
          <button 
            onClick={() => document.getElementById('app-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="group relative overflow-hidden border border-zinc-900 px-10 py-5 text-sm tracking-[0.25em] uppercase hover:text-[#f0ede8] transition-all duration-500"
          >
            <span className="relative z-10">Start Consultation</span>
            <div className="absolute inset-0 h-full w-full bg-zinc-900 transform scale-x-0 origin-left transition-transform duration-500 ease-out group-hover:scale-x-100"></div>
          </button>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4"
        >
          <span className="text-[10px] uppercase tracking-[0.3em] font-medium">SCROLL DOWN</span>
          <ArrowDown className="w-4 h-4 animate-bounce" />
        </motion.div>
      </div>

      {/* Main App Content Section */}
      <div id="app-section" className="relative z-10 bg-white/80 backdrop-blur-3xl min-h-screen w-full border-t border-white/20 shadow-[0_-20px_40px_rgba(0,0,0,0.05)]">
        <div className="max-w-6xl mx-auto px-6 py-24 md:py-32">
          <AnimatePresence mode="wait">
            
            {/* STEP 1: PATIENT SELECTION */}
            {step === 'patient' && (
              <motion.div 
                key="patient"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto"
              >
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 mb-12">Select Patient</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {PATIENTS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPatientId(p.id);
                        setStep('record');
                      }}
                      className="group text-left p-8 border border-zinc-200 hover:border-[#9e2a2b]/30 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 bg-white/50 backdrop-blur-sm hover:bg-white flex flex-col gap-2 rounded-2xl"
                    >
                      <span className="font-serif text-3xl text-zinc-900 group-hover:text-[#9e2a2b] transition-colors duration-500">{p.name}</span>
                      <span className="font-sans text-sm text-zinc-500 uppercase tracking-wider">{p.id} • {p.details}</span>
                      <span className="font-sans text-zinc-600 mt-2">Meds: {p.meds.join(', ')}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* STEP 2: RECORDING */}
            {step === 'record' && activePatient && (
              <motion.div 
                key="record"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-3xl mx-auto text-center"
              >
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 mb-4">Consultation</h2>
                <p className="text-xl text-zinc-500 mb-20 font-serif italic">Recording session for {activePatient.name}</p>
                
                <div className="flex flex-col items-center justify-center gap-12">
                  <button
                    onClick={status === 'recording' ? stopRecording : startRecording}
                    className={`relative flex items-center justify-center w-40 h-40 rounded-full border-2 transition-all duration-500 ${
                      status === 'recording' 
                        ? 'border-[#9e2a2b] bg-[#9e2a2b]/10 text-[#9e2a2b]' 
                        : 'border-zinc-300 hover:border-zinc-900 text-zinc-900'
                    }`}
                  >
                    {status === 'recording' && (
                      <span className="absolute inset-0 rounded-full border border-[#9e2a2b] animate-ping opacity-50"></span>
                    )}
                    {status === 'recording' ? <Square className="w-12 h-12" /> : <Mic className="w-12 h-12" />}
                  </button>
                  
                  <div className="h-8">
                    {status === 'recording' && (
                      <span className="text-sm tracking-[0.2em] uppercase text-[#9e2a2b] font-medium animate-pulse">
                        Recording in progress...
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-24">
                  <button 
                    onClick={() => setStep('patient')}
                    className="text-xs tracking-[0.2em] uppercase text-zinc-400 hover:text-zinc-900 transition-colors"
                  >
                    ← Back to Patients
                  </button>
                </div>

                <div className="mt-12 opacity-0 hover:opacity-100 transition-opacity duration-500">
                  <label className="cursor-pointer text-xs text-zinc-300 hover:text-zinc-500 transition-colors">
                    [ Hidden Fallback: Upload Audio ]
                    <input type="file" accept="audio/*" ref={hiddenFileInput} onChange={handleFallbackUpload} className="hidden" />
                  </label>
                </div>
              </motion.div>
            )}

            {/* STEP 3: PROCESSING */}
            {step === 'processing' && (
              <motion.div 
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-2xl mx-auto text-center py-20"
              >
                <div className="relative w-24 h-24 mx-auto mb-12">
                  <svg className="animate-spin w-full h-full text-zinc-200" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-serif italic text-2xl text-zinc-900">{apiStep}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className={`text-2xl font-serif italic transition-opacity duration-500 ${apiStep >= 1 ? 'text-zinc-900' : 'text-zinc-300'}`}>
                    Transcribing audio...
                  </p>
                  <p className={`text-2xl font-serif italic transition-opacity duration-500 ${apiStep >= 2 ? 'text-zinc-900' : 'text-zinc-300'}`}>
                    Extracting clinical data...
                  </p>
                  <p className={`text-2xl font-serif italic transition-opacity duration-500 ${apiStep >= 3 ? 'text-zinc-900' : 'text-zinc-300'}`}>
                    Generating voice...
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP 4: RESULTS */}
            {step === 'results' && extractedData && (
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-5xl mx-auto space-y-24"
              >
                {/* What we'll tell the patient */}
                <div className="relative">
                  <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 mb-8 flex items-center gap-4">
                    Patient Instructions
                    {isPlaying && (
                      <span className="flex items-center gap-2 text-[#9e2a2b] text-sm tracking-[0.2em] uppercase font-normal ml-4">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9e2a2b] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9e2a2b]"></span>
                        </span>
                        Speaking
                      </span>
                    )}
                  </h2>
                  <p className={`text-3xl md:text-5xl font-serif italic leading-snug transition-colors duration-500 ${isPlaying ? 'text-[#9e2a2b]' : 'text-zinc-800'}`}>
                    "{extractedData.Patient_Instructions}"
                  </p>
                </div>

                {/* 2-Column Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 pt-16 border-t border-zinc-200">
                  
                  {/* The Plan */}
                  <div>
                    <h3 className="text-sm font-bold tracking-[0.2em] uppercase text-zinc-400 mb-8">The Plan</h3>
                    <div className="space-y-10">
                      <div>
                        <p className="text-xs tracking-widest uppercase text-zinc-400 mb-2">Diagnosis</p>
                        <p className="text-2xl font-serif text-zinc-900">{extractedData.Diagnosis}</p>
                      </div>
                      
                      <div>
                        <p className="text-xs tracking-widest uppercase text-zinc-400 mb-4">Medicines</p>
                        <ul className="space-y-4">
                          {extractedData.Prescribed_Meds?.map((m: string) => (
                            <li key={m} className="text-xl font-serif text-zinc-800 flex items-center gap-4">
                              <span className="w-1.5 h-1.5 bg-[#9e2a2b] rounded-full" /> 
                              {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Doctor's Notes */}
                  <div>
                    <h3 className="text-sm font-bold tracking-[0.2em] uppercase text-zinc-400 mb-8">Doctor's Notes</h3>
                    <p className="text-lg font-sans text-zinc-600 leading-relaxed">
                      "{transcription}"
                    </p>
                  </div>

                </div>

                {/* Start Over */}
                <div className="pt-16 border-t border-zinc-200 flex justify-center">
                  <button 
                    onClick={resetFlow}
                    className="group relative overflow-hidden border border-zinc-900 px-10 py-4 text-sm tracking-[0.2em] uppercase hover:text-white transition-colors duration-500"
                  >
                    <span className="relative z-10">Start New Consultation</span>
                    <div className="absolute inset-0 h-full w-full bg-zinc-900 transform scale-x-0 origin-left transition-transform duration-500 ease-out group-hover:scale-x-100"></div>
                  </button>
                </div>

              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Audio Element (Hidden) */}
      {audioUrl && (
        <audio 
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {/* Error Toast */}
      {errorMsg && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#9e2a2b] text-white px-6 py-3 rounded-none text-sm tracking-wider uppercase z-50 shadow-xl flex items-center gap-3">
          <AlertCircle className="w-4 h-4" />
          {errorMsg}
        </div>
      )}
    </div>
  );
}
