import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { buildFixHtml } from "@/lib/publish-engine";
import { notFound } from "next/navigation";

// Hosted fallback page: for businesses with no editable site (no CMS, a
// Canva page, only a Google Business listing) this is the live, indexable
// page we host on their behalf so the "auto-implementation" step always has
// somewhere real to publish to.
export default async function HostedFixPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createSupabaseServiceClient();

  const { data: publish } = await supabase
    .from("publishes")
    .select("*, scans(business_name, business_domain)")
    .eq("destination", "hosted_page")
    .contains("destination_meta", { slug })
    .single();

  if (!publish) return notFound();

  const scan = publish.scans as unknown as { business_name: string; business_domain?: string };
  const fix = await getFix(publish.scan_id, publish.fix_index);
  if (!fix) return notFound();

  // Same buildFixHtml() fragment used for WordPress and the copy-paste HTML
  // variant, so the hosted page isn't a fourth slightly-different template —
  // one source of truth for what the "final" published markup looks like.
  const html = buildFixHtml({
    businessName: scan.business_name,
    businessDomain: scan.business_domain,
    question: fix.question,
    answer: fix.answer,
    schema: fix.schema,
  });

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      {/* eslint-disable-next-line react/no-danger */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}

async function getFix(scanId: string, fixIndex: number) {
  const supabase = createSupabaseServiceClient();
  const { data: scan } = await supabase.from("scans").select("results").eq("id", scanId).single();
  return scan?.results?.fixes?.[fixIndex] || null;
}
