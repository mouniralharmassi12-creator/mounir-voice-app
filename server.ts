import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Ensure the server has access to GEMINI_API_KEY
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Route: Generate Darija Marketing Script
  app.post("/api/generate-script", async (req, res) => {
    try {
      const { productName, productDesc, tone, customDirectives } = req.body;

      if (!productName) {
        return res.status(400).json({ error: "Product or brand name is required" });
      }

      const prompt = `You are an expert Moroccan marketing copywriter and local sales funnel designer.
Create an exceptionally high-converting, modern, persuasive, and 100% natural, spoken Moroccan Darija (الدارجة المغربية) marketing script in standard Arabic script. Moroccans must read and hear it with complete authenticity—it should sound like a native influencer, professional salesperson, or professional media speaker talking naturally and warmly, not like standard formal Arabic (Fusha) and not robotic.

Product/Brand Name: ${productName}
Description/Key Benefits: ${productDesc || "Standard high quality product/service"}
Ad Tone Style: "${tone || "energetic and highly persuasive (حماسي ومقنع)"}"
Custom Directions (including pricing, offers, or specific Morrocan slangs to use/not use): ${customDirectives || "None"}

The script should be optimized for a 15 to 40 second audio ad, video voiceover, Instagram Reel, or TikTok ad (about 60 to 110 words). It must capture attention instantly in the first 3 seconds, explain the benefits in a relatable way, and end with a powerful Moroccan-focused call to action (e.g., dial a number, visit link, click button, free delivery, pay on delivery).

Ensure the output is valid, structured JSON. DO NOT output any text before or after the JSON.
Format the output as a single JSON object with the following fields:
1. "darijaScript": The main spoken script in standard Arabic script (Moroccan Darija).
2. "marketingHook": A short punchy banner text / promotional tagline in Moroccan Darija.
3. "englishTranslation": Clear English summary/meaning of what's being said.
4. "pronunciationTips": Specific cues on how to speak it natively (which expressions to stress, how to articulate Moroccan letters).
5. "estimatedDuration": e.g., "25s" or "30s"`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "You are a professional backend JSON API. You MUST return ONLY the raw JSON object matching the requested schema. Never output markdown code blocks (e.g., ```json), conversational comments, or explanations outside the JSON.",
        }
      });

      const responseText = response.text || "{}";
      let parsedData;
      try {
        parsedData = JSON.parse(responseText.trim());
      } catch (parseErr) {
        // Fallback cleanup if any codeblock markdown slips through
        const cleanJSON = responseText.replace(/```json\n?|```/g, "").trim();
        parsedData = JSON.parse(cleanJSON);
      }

      res.json(parsedData);
    } catch (error: any) {
      console.error("Error generating Darija script:", error);
      res.status(500).json({ error: error.message || "Failed to generate Moroccan Darija marketing script" });
    }
  });

  // API Route: Generate Audio TTS Voiceover using Gemini TTS model
  app.post("/api/generate-audio", async (req, res) => {
    try {
      const { scriptText, voiceName, toneGuide, voiceTonePrompt } = req.body;

      if (!scriptText) {
        return res.status(400).json({ error: "Script text is required" });
      }

      const selectedVoice = voiceName || "Kore"; // Kore, Puck, Zephyr, Charon, Fenrir

      // Give clear contextual phonetic speaking instructions in English/Arabic so the TTS model can read Moroccan Arabic perfectly.
      // Incorporates the custom voice profile rules, speech tempo acceleration, and marketing fluency guidelines
      const ttsPrompt = `You are an authentic native Moroccan Arabic (Darija) speaker with an exceptionally natural, non-robotic, and human-like voice.
Please read the following Moroccan Darija (الدارجة المغربية) marketing script.

VOICE CHARACTERISTICS & TONE GUIDE:
- ${voiceTonePrompt || 'Speak with a conversational, high-converting marketing tone.'}
- SPEAK SLIGHTLY FASTER, light, and with an elegant, modern flow. AVOID any heavy, slow-paced chanting, formal Arabic rhythms, or robotic pauses. Keep it dynamic and airy to ensure maximum consumer premium appeal.
- Maintain smooth natural breathing pauses. Keep the dialect strictly authentic to Moroccan Darija.

Script to read:
"${scriptText}"`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: ttsPrompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        return res.status(500).json({ error: "No voice audio was returned by the generative model. Please verify your connection." });
      }

      res.json({ base64Audio });
    } catch (error: any) {
      console.error("Error generating Moroccan voiceover:", error);
      res.status(500).json({ error: error.message || "Failed to synthesize Moroccan Darija audio" });
    }
  });

  // Serve static UI assets or run hot-reloading Vite dev server
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started. Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to bootstrap the Express server:", err);
});
