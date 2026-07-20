// Multi-destination publish engine for drafted fixes.
// Not every business runs WordPress — some have no site, a Canva page, or
// only a Google Business listing. This gives every scan a working "ship it"
// path regardless of what the client actually has.

export type PublishDestination = "wordpress" | "hosted_page" | "copy_paste";

export interface WordPressPublishInput {
  siteUrl: string;
  username: string;
  appPassword: string;
  title: string;
  content: string;
  publishImmediately?: boolean;
}

export async function publishToWordPress(input: WordPressPublishInput) {
  const { siteUrl, username, appPassword, title, content, publishImmediately } = input;
  if (!siteUrl || !username || !appPassword || !title || !content) {
    throw new Error("siteUrl, username, appPassword, title, and content are all required");
  }
  const base = siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");

  const res = await fetch(`${base}/wp-json/wp/v2/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      title,
      content,
      status: publishImmediately ? "publish" : "draft",
    }),
  });
  const d = await res.json();
  if (!res.ok) {
    throw new Error(d.message || "WordPress rejected the request — check the site URL and application password");
  }
  return {
    link: d.link as string,
    status: d.status as string,
    editLink: `${base}/wp-admin/post.php?post=${d.id}&action=edit`,
  };
}

// Hosted fallback: for businesses with no editable website (no CMS, a
// Canva-built page, only a Google Business listing, etc.) we host the FAQ
// content ourselves on a slug under this app, so there's still a live,
// linkable, indexable page even with zero access to the client's own site.
export function buildHostedPageSlug(businessName: string, question: string): string {
  const base = `${businessName}-${question}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return `${base}-${Date.now().toString(36)}`;
}

// Copy-paste block: works anywhere — Canva page description, Google Business
// Q&A, Instagram bio link tool, a site builder with no API. Always available
// as the zero-integration fallback.
export function buildCopyPasteBlock(question: string, answer: string, schema: string): string {
  return `Q: ${question}\n\nA: ${answer}\n\n${schema}`;
}

// ---- Final HTML generation ----
// Every destination (WordPress page content, our own hosted page, the
// copy-paste block's optional HTML variant) ultimately needs the same
// well-formed FAQ markup: a heading, a direct answer, and the FAQPage
// JSON-LD schema wired in correctly so it's actually picked up by AI
// crawlers and Google's rich-results parser — not just decorative <script>
// text floating in the page. This is the one function that builds that
// markup so every destination renders identically instead of three
// slightly-different one-off templates.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Pulls the raw JSON-LD payload out of a stored schema string, whether it
// arrived as a bare JSON object or already wrapped in a <script> tag — the
// AI-drafted fixes have been inconsistent about which.
function extractJsonLd(schema: string): string {
  const match = schema.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const raw = (match ? match[1] : schema).trim();
  try {
    // Re-serialize so we control formatting/whitespace regardless of input.
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}

export interface FixHtmlOptions {
  businessName: string;
  businessDomain?: string;
  question: string;
  answer: string;
  schema: string;
  /** Full standalone <html> document vs. an embeddable fragment. */
  standalone?: boolean;
}

// Builds the actual page/fragment body used across destinations:
// - WordPress: passed as `content` for the wp/v2/pages POST.
// - Hosted page: rendered inside app/p/[slug]/page.tsx.
// - Copy-paste: available as an HTML variant alongside the plain-text block.
export function buildFixHtml(opts: FixHtmlOptions): string {
  const { businessName, businessDomain, question, answer, schema } = opts;
  const jsonLd = extractJsonLd(schema);
  const domainClean = businessDomain?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const fragment = `<section class="geo-fix" itemscope itemtype="https://schema.org/FAQPage">
  <p class="geo-fix-eyebrow">${escapeHtml(businessName)}</p>
  <h2 itemprop="name">${escapeHtml(question)}</h2>
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <meta itemprop="name" content="${escapeHtml(question)}" />
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">${escapeHtml(answer)}</p>
    </div>
  </div>
  ${
    domainClean
      ? `<a class="geo-fix-link" href="https://${domainClean}" rel="noopener">Visit ${escapeHtml(
          businessName
        )} →</a>`
      : ""
  }
  <script type="application/ld+json">${jsonLd}</script>
</section>`;

  if (!opts.standalone) return fragment;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(question)} — ${escapeHtml(businessName)}</title>
  <meta name="description" content="${escapeHtml(answer.slice(0, 155))}" />
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 0 auto; padding: 48px 24px; color: #1a1a1a; line-height: 1.6; }
    .geo-fix-eyebrow { font-size: 13px; color: #6b7280; margin: 0 0 8px; }
    h2 { font-size: 24px; margin: 0 0 16px; }
    .geo-fix-link { display: inline-block; margin-top: 32px; font-size: 14px; color: #0f766e; text-decoration: underline; }
  </style>
</head>
<body>
${fragment}
</body>
</html>`;
}
