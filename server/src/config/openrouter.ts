import OpenAI from "openai";
import { env } from "./env.js";

// OpenRouter exposes an OpenAI-compatible Chat Completions API, so the
// official `openai` SDK is reused here rather than a bespoke HTTP client —
// only the base URL and API key differ from talking to OpenAI directly.
export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: env.openrouterApiKey,
  defaultHeaders: {
    // Attribution headers OpenRouter uses for its public rankings; optional
    // but harmless to send. See https://openrouter.ai/docs/quickstart.
    "HTTP-Referer": env.clientOrigin,
    "X-Title": "Nucase Agent",
  },
});
