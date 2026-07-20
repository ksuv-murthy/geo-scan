import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { publishToWordPress, buildHostedPageSlug, buildCopyPasteBlock } from "@/lib/publish-engine";

// Auto-implementation step: takes a drafted fix and ships it to wherever the
// business actually has a presence — WordPress, our own hosted fallback
// page, or a copy-paste block for anywhere else (Canva, Google Business Q&A,
// a site builder with no API, etc).
export async function POST(req: NextRequest) {
  try {
    const { scanId, fixIndex, destination, wordpress } = await req.json();
    if (!scanId || fixIndex === undefined || !destination) {
      return NextResponse.json({ error: "scanId, fixIndex, and destination are required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data: scan, error: fetchError } = await supabase
      .from("scans")
      .select("*")
      .eq("id", scanId)
      .single();
    if (fetchError || !scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

    const fix = scan.results?.fixes?.[fixIndex];
    if (!fix) return NextResponse.json({ error: "Fix not found for that index" }, { status: 404 });

    let destinationMeta: Record<string, unknown> = {};
    let status: "success" | "error" = "success";
    let errorMsg: string | null = null;

    try {
      if (destination === "wordpress") {
        if (!wordpress?.siteUrl || !wordpress?.username || !wordpress?.appPassword) {
          throw new Error("WordPress site URL, username, and application password are required");
        }
        const content = `<h2>${fix.question}</h2><p>${fix.answer}</p>${fix.schema}`;
        const result = await publishToWordPress({
          siteUrl: wordpress.siteUrl,
          username: wordpress.username,
          appPassword: wordpress.appPassword,
          title: fix.question,
          content,
          publishImmediately: !!wordpress.publishImmediately,
        });
        destinationMeta = result;
      } else if (destination === "hosted_page") {
        const slug = buildHostedPageSlug(scan.business_name, fix.question);
        // The actual hosted page is served by app/p/[slug]/page.tsx, reading
        // this publishes row back out — no separate file storage needed.
        destinationMeta = { slug, url: `/p/${slug}` };
      } else if (destination === "copy_paste") {
        destinationMeta = { block: buildCopyPasteBlock(fix.question, fix.answer, fix.schema) };
      } else {
        throw new Error(`Unknown destination: ${destination}`);
      }
    } catch (err) {
      status = "error";
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    const { data: publish, error: insertError } = await supabase
      .from("publishes")
      .insert({
        scan_id: scanId,
        fix_index: fixIndex,
        destination,
        status,
        destination_meta: destinationMeta,
        error: errorMsg,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    if (status === "error") {
      return NextResponse.json({ error: errorMsg, publish }, { status: 502 });
    }
    return NextResponse.json({ publish });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
