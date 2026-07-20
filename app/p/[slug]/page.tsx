import { createSupabaseServiceClient } from "@/lib/supabase-server";
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

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <p className="text-sm text-zinc-500 mb-2">{scan.business_name}</p>
      <h1 className="text-2xl font-semibold mb-4">{fix.question}</h1>
      <p className="text-zinc-700 leading-relaxed">{fix.answer}</p>
      {scan.business_domain && (
        <a
          href={`https://${scan.business_domain.replace(/^https?:\/\//, "")}`}
          className="inline-block mt-8 text-sm text-teal-700 underline"
        >
          Visit {scan.business_name} →
        </a>
      )}
      {/* eslint-disable-next-line react/no-danger */}
      <div dangerouslySetInnerHTML={{ __html: fix.schema }} />
    </main>
  );
}

async function getFix(scanId: string, fixIndex: number) {
  const supabase = createSupabaseServiceClient();
  const { data: scan } = await supabase.from("scans").select("results").eq("id", scanId).single();
  return scan?.results?.fixes?.[fixIndex] || null;
}
