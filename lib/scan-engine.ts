// GEO Scan engine — ports geo-scan-proxy-worker.js logic into the Next.js app.
// Models updated from the original worker: gemini-2.0-flash was shut down
// June 1 2026 (migrated to gemini-2.5-flash); gpt-4o-mini is deprecated
// (migrated to gpt-5.4-nano, the current cheapest GPT-5.x tier).

import { errorMessage } from "./error-message";

export type Platform = "claude" | "openai" | "gemini" | "perplexity";

export interface ScanRow {
  query: string;
  platform: Platform;
  platformLabel: string;
  text: string;
  error: string | null;
  mentioned: boolean;
  compHits: string[];
}

export interface CitationResult {
  source: string;
  found: boolean;
  evidence?: string;
  link?: string;
  error?: string;
}

export interface FixDraft {
  question: string;
  answer: string;
  schema: string;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  claude: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

async function askClaude(prompt: string, maxTokens = 600): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude request failed (${res.status})`);
  const data = await res.json();
  const block = (data.content || []).find((b: { type: string; text?: string }) => b.type === "text");
  return block?.text || "";
}

async function callOpenAI(query: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-nano",
      messages: [{ role: "user", content: query }],
      max_tokens: 500,
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || "OpenAI error");
  return d.choices?.[0]?.message?.content || "";
}

async function callGemini(query: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: query }] }] }),
    }
  );
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || "Gemini error");
  return d.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callPerplexity(query: string): Promise<string> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: query }] }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || "Perplexity error");
  return d.choices?.[0]?.message?.content || "";
}

function mentioned(text: string, name: string, domain?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  const n = (name || "").toLowerCase().trim();
  const d = (domain || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .trim();
  if (n && n.length > 2 && t.includes(n)) return true;
  if (d && d.length > 3 && t.includes(d)) return true;
  return false;
}

function extractJson(text: string): unknown {
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse model output as JSON");
  return JSON.parse(match[0]);
}

export async function suggestQueries(name: string, desc: string): Promise<string[]> {
  const prompt = `A business called "${name}" is described as: "${desc}".
Write 8 realistic, natural-language questions a real prospective customer would type into ChatGPT or Google when trying to find and choose a business like this in that location — the kind of query that would surface a shortlist of options, not the business's own name.
Mix general "best X in [area]" style questions with more specific ones (budget, feature, comparison).
Return ONLY a JSON array of 8 strings, nothing else.`;
  const out = await askClaude(prompt, 500);
  return (extractJson(out) as string[]).slice(0, 8);
}

export async function runPlatformCheck(
  platform: Platform,
  query: string,
  name: string,
  domain: string | undefined,
  competitors: string[]
): Promise<ScanRow> {
  let text = "";
  let error: string | null = null;
  try {
    if (platform === "claude") text = await askClaude(query, 500);
    else if (platform === "openai") text = await callOpenAI(query);
    else if (platform === "gemini") text = await callGemini(query);
    else if (platform === "perplexity") text = await callPerplexity(query);
  } catch (err) {
    error = errorMessage(err);
  }
  const isMentioned = !error && mentioned(text, name, domain);
  const compHits = !error ? competitors.filter((c) => mentioned(text, c)) : [];
  return {
    query,
    platform,
    platformLabel: PLATFORM_LABELS[platform],
    text,
    error,
    mentioned: isMentioned,
    compHits,
  };
}

export async function generateSummary(
  name: string,
  desc: string,
  competitors: string[],
  rows: ScanRow[]
): Promise<{ summary: string; recommendations: string[] } | null> {
  try {
    const compact = rows
      .filter((r) => !r.error)
      .map((r) => ({
        q: r.query,
        platform: r.platformLabel,
        mentioned: r.mentioned,
        competitorsSeen: r.compHits,
        snippet: (r.text || "").slice(0, 300),
      }));
    const prompt = `You are auditing AI-search visibility for "${name}" (${desc || "no description given"}).
Competitors tracked: ${competitors.join(", ") || "none listed"}.
Here is the raw scan data (one entry per query per AI platform): ${JSON.stringify(compact)}.
Write a short, plain-spoken summary for a business owner who has never heard of "AI SEO" before. Then give 3-5 concrete, prioritized recommendations to improve their visibility in AI answers, based specifically on what did or didn't come up in this data.
Return ONLY JSON in this exact shape: {"summary": "2-3 sentences", "recommendations": ["...", "..."]}`;
    const out = await askClaude(prompt, 700);
    return extractJson(out) as { summary: string; recommendations: string[] };
  } catch {
    return null;
  }
}

export async function generateFixes(
  name: string,
  desc: string,
  gapQueries: string[]
): Promise<FixDraft[]> {
  // Runs in parallel — sequential Claude calls here were adding meaningful
  // time to a route that already has to fit inside Vercel's function
  // duration limit.
  const drafts = gapQueries.map(async (gq) => {
    const prompt = `A business called "${name}" (${desc || "no description given"}) is NOT showing up when AI platforms answer this real buyer question: "${gq}".
Write content that would genuinely help them get cited/mentioned for this exact question, in the voice of the business's own website. Return ONLY JSON in this shape:
{"question": "${gq.replace(/"/g, '\\"')}", "answer": "a direct, factual, 60-90 word answer written as if it's an FAQ block on the business's website — specific, not vague marketing fluff", "schema": "a single-entry FAQPage JSON-LD <script> tag as a string, using the question and answer above, ready to paste into <head>"}`;
    const out = await askClaude(prompt, 700);
    return extractJson(out) as FixDraft;
  });
  return Promise.all(drafts);
}

// ---- India citation graph (JustDial / IndiaMART / Practo / Quora / GMB) ----
const CITATION_SOURCES = [
  { key: "justdial", label: "JustDial", site: "justdial.com" },
  { key: "indiamart", label: "IndiaMART", site: "indiamart.com" },
  { key: "practo", label: "Practo", site: "practo.com" },
  { key: "quora", label: "Quora (India threads)", site: "quora.com" },
  { key: "gmb", label: "Google Business listing", site: "google.com/maps" },
];

export async function runCitationCheck(
  businessName: string,
  city?: string
): Promise<CitationResult[]> {
  if (!process.env.SERPAPI_KEY) {
    return CITATION_SOURCES.map((s) => ({
      source: s.label,
      found: false,
      error: "SERPAPI_KEY not configured",
    }));
  }
  const results: CitationResult[] = [];
  for (const src of CITATION_SOURCES) {
    const q =
      src.key === "gmb"
        ? `${businessName} ${city || ""}`
        : `site:${src.site} "${businessName}" ${city || ""}`;
    try {
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(
        q
      )}&api_key=${process.env.SERPAPI_KEY}&num=5`;
      const r = await fetch(url);
      const d = await r.json();
      const hits = (d.organic_results || []).filter((res: { link?: string }) =>
        src.key === "gmb" ? true : (res.link || "").includes(src.site)
      );
      const local = d.local_results?.places || [];
      const found = src.key === "gmb" ? local.length > 0 : hits.length > 0;
      results.push({
        source: src.label,
        found,
        evidence: src.key === "gmb" ? local[0]?.title || "" : hits[0]?.title || "",
        link: src.key === "gmb" ? local[0]?.link || "" : hits[0]?.link || "",
      });
    } catch (err) {
      results.push({
        source: src.label,
        found: false,
        error: errorMessage(err),
      });
    }
  }
  return results;
}
