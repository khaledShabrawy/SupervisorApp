/**
 * POST /api/analyze-shelf
 * Server-side proxy for Claude Vision API.
 * The Anthropic key never leaves the server — clients send only the base64 image.
 *
 * Body: { imageBase64: string }   (JPEG, quality ≤ 0.8 recommended)
 * Response: AIAnalysis JSON or { error: string }
 */

import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

interface AnalyzeBody {
  imageBase64?: string;
}

interface AIAnalysis {
  is_present: boolean;
  estimated_quantity: number;
  display_order: string;
  confidence: number;
}

router.post(
  "/analyze-shelf",
  async (req: Request<object, object, AnalyzeBody>, res: Response) => {
    const { imageBase64 } = req.body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    const apiKey =
      process.env["ANTHROPIC_API_KEY"] ??
      process.env["EXPO_PUBLIC_ANTHROPIC_API_KEY"];

    if (!apiKey) {
      res.status(503).json({ error: "AI analysis not configured on server" });
      return;
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-opus-4-5",
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: imageBase64,
                  },
                },
                {
                  type: "text",
                  text: 'حلل صورة الرف. أجب بـ JSON فقط بدون أي نص آخر: {"is_present": true, "estimated_quantity": 5, "display_order": "مرتب", "confidence": 0.9}',
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic error ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as {
        content?: Array<{ text?: string }>;
      };
      const text = data.content?.[0]?.text ?? "";
      const match = text.match(/\{[\s\S]*\}/);

      if (!match) {
        res.status(422).json({ error: "Could not parse AI response" });
        return;
      }

      const analysis = JSON.parse(match[0]) as AIAnalysis;
      res.json(analysis);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  },
);

export default router;
