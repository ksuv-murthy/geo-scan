// Website technical/SEO health check — a lightweight audit of the
// business's own site, layered on top of the AI-visibility scan. AI
// platforms and their citation sources lean heavily on well-formed on-page
// signals (title, meta description, structured data, https, crawlability)
// to decide what to surface and cite, so this feeds the same "why aren't we
// showing up" story with a second, concrete data source next to the raw
// mention checks.

import { errorMessage } from "./error-message";

export type HealthSeverity = "pass" | "warn" | "fail";

export interface HealthCheckItem {
  key: string;
  label: string;
  severity: HealthSeverity;
  detail: string;
}

export interface HealthCheckResult {
  domain: string;
  checkedUrl: string;
  score: number; // 0-100, weighted pass/warn/fail across all checks
  items: HealthCheckItem[];
  error?: string;
}

const TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function extractTag(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

export async function runHealthCheck(businessDomain?: string): Promise<HealthCheckResult | null> {
  if (!businessDomain) return null;
  const domain = normalizeDomain(businessDomain);
  const httpsUrl = `https://${domain}`;
  const items: HealthCheckItem[] = [];

  let html = "";
  let finalUrl = httpsUrl;
  let responseTimeMs: number | null = null;

  try {
    const start = Date.now();
    const res = await fetchWithTimeout(httpsUrl);
    responseTimeMs = Date.now() - start;
    finalUrl = res.url || httpsUrl;
    html = await res.text();

    items.push({
      key: "https",
      label: "Serves over HTTPS",
      severity: finalUrl.startsWith("https://") ? "pass" : "fail",
      detail: finalUrl.startsWith("https://")
        ? "Site loads over HTTPS."
        : "Site did not resolve to an HTTPS URL — AI crawlers and citation sources generally deprioritize non-HTTPS pages.",
    });

    items.push({
      key: "response_time",
      label: "Response time",
      severity: responseTimeMs < 1500 ? "pass" : responseTimeMs < 3500 ? "warn" : "fail",
      detail: `Homepage responded in ${responseTimeMs}ms.`,
    });
  } catch (err) {
    return {
      domain,
      checkedUrl: httpsUrl,
      score: 0,
      items: [
        {
          key: "reachability",
          label: "Site reachable",
          severity: "fail",
          detail: `Could not reach ${httpsUrl}: ${errorMessage(err)}`,
        },
      ],
      error: errorMessage(err),
    };
  }

  const title = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  items.push({
    key: "title",
    label: "Page title",
    severity: !title ? "fail" : title.length < 15 || title.length > 65 ? "warn" : "pass",
    detail: title
      ? `Title tag found (${title.length} chars): "${title.slice(0, 80)}"`
      : "No <title> tag found — this is one of the strongest signals AI platforms and search engines use to understand what the page is about.",
  });

  const metaDesc = extractTag(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i
  );
  items.push({
    key: "meta_description",
    label: "Meta description",
    severity: !metaDesc ? "warn" : metaDesc.length < 50 || metaDesc.length > 160 ? "warn" : "pass",
    detail: metaDesc
      ? `Meta description found (${metaDesc.length} chars).`
      : "No meta description — AI answer engines and search snippets often quote this directly.",
  });

  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  items.push({
    key: "viewport",
    label: "Mobile viewport tag",
    severity: hasViewport ? "pass" : "fail",
    detail: hasViewport
      ? "Viewport meta tag present."
      : "No viewport meta tag — the site likely isn't mobile-optimized, which affects both users and mobile-first crawlers.",
  });

  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
  const hasSchemaOrgMicrodata = /itemtype=["']https?:\/\/schema\.org\//i.test(html);
  items.push({
    key: "structured_data",
    label: "Structured data (schema.org)",
    severity: hasJsonLd || hasSchemaOrgMicrodata ? "pass" : "warn",
    detail:
      hasJsonLd || hasSchemaOrgMicrodata
        ? "Found JSON-LD or microdata structured data on the homepage."
        : "No schema.org structured data detected — this is the same markup format GEO Scan's drafted fixes use, and its absence makes it harder for AI platforms to parse what the business actually offers.",
  });

  const hasH1 = /<h1[^>]*>[\s\S]*?<\/h1>/i.test(html);
  items.push({
    key: "h1",
    label: "H1 heading present",
    severity: hasH1 ? "pass" : "warn",
    detail: hasH1 ? "Page has an H1 heading." : "No H1 heading found on the homepage.",
  });

  // robots.txt — checked separately since it's a distinct URL, and a
  // disallow-all here would block every AI crawler regardless of how good
  // the on-page signals are.
  try {
    const robotsRes = await fetchWithTimeout(`https://${domain}/robots.txt`);
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      const blocksAll = /user-agent:\s*\*[\s\S]{0,50}disallow:\s*\/\s*$/im.test(robotsTxt);
      items.push({
        key: "robots_txt",
        label: "robots.txt allows crawling",
        severity: blocksAll ? "fail" : "pass",
        detail: blocksAll
          ? "robots.txt appears to disallow all crawlers from the entire site."
          : "robots.txt present and does not block crawling site-wide.",
      });
    } else {
      items.push({
        key: "robots_txt",
        label: "robots.txt allows crawling",
        severity: "pass",
        detail: "No robots.txt found — defaults to allowing all crawlers.",
      });
    }
  } catch {
    items.push({
      key: "robots_txt",
      label: "robots.txt allows crawling",
      severity: "warn",
      detail: "Could not fetch robots.txt (timed out or errored) — skipped.",
    });
  }

  const weights: Record<HealthSeverity, number> = { pass: 1, warn: 0.5, fail: 0 };
  const score = Math.round((100 * items.reduce((sum, i) => sum + weights[i.severity], 0)) / items.length);

  return { domain, checkedUrl: finalUrl, score, items };
}
