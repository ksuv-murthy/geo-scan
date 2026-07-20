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
