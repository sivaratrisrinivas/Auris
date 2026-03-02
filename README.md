# Auris - AI Medical Assistant

Auris is an intelligent medical assistant designed to streamline post-consultation workflows for healthcare professionals. By simply recording a patient consultation, Auris automatically transcribes the audio, extracts key clinical data (like diagnoses and prescribed medications), and generates a friendly, personalized audio summary for the patient.

## What is Auris?
Auris is a full-stack web application that acts as a bridge between doctors and patients. It captures medical conversations and turns them into structured clinical notes for the doctor, while simultaneously creating an easy-to-understand, spoken summary for the patient to take home.

## Why did we build it?
Doctors spend a significant amount of time writing clinical notes and explaining instructions to patients. Patients, on the other hand, often forget or misunderstand complex medical instructions once they leave the clinic. 

Auris solves both problems by:
1. **Saving Time for Doctors:** Automating the extraction of diagnoses and medications from natural conversation.
2. **Improving Patient Care:** Providing patients with a clear, personalized audio recording of their instructions, reducing confusion and improving medication adherence.

## How it Works (Step-by-Step)
1. **Select a Patient:** The doctor selects a patient from the dashboard.
2. **Record Consultation:** The doctor clicks "Start Recording" and conducts the consultation naturally.
3. **Transcription (Mistral Voxtral):** The recorded audio is sent to the backend and transcribed into text using Mistral's Voxtral API.
4. **Data Extraction (Mistral Agent):** The transcribed text is sent to a custom Mistral Agent, which intelligently extracts the primary diagnosis, prescribed medications, and drafts a friendly patient summary.
5. **Audio Generation (ElevenLabs):** The drafted patient summary is sent to ElevenLabs' Text-to-Speech API to generate a lifelike, empathetic audio recording.
6. **Review & Play:** The doctor reviews the extracted clinical data on the screen, and the generated audio instructions are automatically played back.

## Tech Stack
* **Frontend:** React (Vite), TypeScript, Tailwind CSS, Framer Motion (for animations), Lucide React (for icons).
* **Backend:** Node.js, Express.js, Multer (for handling audio file uploads).
* **AI & APIs:**
  * **Mistral AI (Voxtral):** Used for highly accurate speech-to-text transcription of medical audio.
  * **Mistral AI (Agents):** Used for intelligent natural language processing to extract structured clinical data (Diagnosis, Medications) and draft patient instructions.
  * **ElevenLabs:** Used for high-quality, zero-stuttering Text-to-Speech (TTS) generation to create empathetic patient audio instructions.

## Setup Instructions

### Prerequisites
* Node.js (v18 or higher)
* API Keys for Mistral AI and ElevenLabs

### Environment Variables
Create a `.env` file in the root directory and add the following keys:
```env
MISTRAL_API_KEY=your_mistral_api_key
MISTRAL_AGENT_ID=your_mistral_agent_id
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id
```

### Installation & Running
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server (Frontend + Backend):
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to `http://localhost:3000`.
