import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function main() {
  try {
    console.log("Generating logo with Gemini 2.5 Flash Image...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: 'A minimalist, modern, abstract app icon for a medical AI app named Pulse. A sleek, glowing neon heartbeat line (EKG) morphing into a soundwave. Dark background, vibrant cyan and fuchsia colors. High quality, flat vector style, no text, clean, Apple design style.' }
        ]
      },
      config: {
        imageConfig: { aspectRatio: "1:1", imageSize: "512px" }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;
        const buffer = Buffer.from(base64Data, 'base64');
        const publicDir = path.join(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(path.join(publicDir, 'logo.png'), buffer);
        console.log('Logo generated successfully and saved to public/logo.png');
        break;
      }
    }
  } catch (e) {
    console.error('Error generating logo:', e);
  }
}

main();
