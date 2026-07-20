import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
  runPlatformCheck,
  generateSummary,
  generateFixes,
  runCitationCheck,
  Platform,
} from "@/lib/scan-engine";

// Runs the full scan for a paid scan row: AI-mention checks across all four
// platforms, the India citation-check, an AI-written summary, and drafted
// fixes for the biggest visibility gaps. Gated on payment_status = 'paid' —
// this is the one route that actually spends money on AI/SerpApi calls.
export async function POST(req: NextRequest) {
  let scanId: string | undefined;
  try {
    const body = await req.json();
    scanId = body.scanId;
    if (!scanId) return NextResponse.json({ error: "scanId is required" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data: scan, error: fetchError } = await supabase
      .from("scans")
      .select("*")
      .eq("id", scanId)
      .single();

    if (fetchError || !scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    if (scan.payment_status !== "paid") {
      return NextResponse.json({ error: "Scan has not been paid for" }, { status: 402 });
    }
    if (scan.scan_status === "running" || scan.scan_status === "complete") {
      return NextResponse.json({ error: "Scan already run or in progress" }, { status: 409 });
    }

    await supabase.from("scans").update({ scan_status: "running" }).eq("id", scanId);

    const platforms: Platform[] = ["claude", "openai", "gemini", "perplexity"];
    const queries: string[] = scan.queries || [];
    const competitors: string[] = scan.competitors || [];

    const rows = [];
    for (const q of queries) {
      for (const p of platforms) {
        rows.push(await runPlatformCheck(p, q, scan.business_name, scan.business_domain, competitors));
      }
    }

    const summary = await generateSummary(scan.business_name, scan.business_desc, competitors, rows);

    const gapQueries = [...new Set(rows.filter((r) => !r.error && !r.mentioned).map((r) => r.query))].slice(0, 3);
    const fixes = gapQueries.length ? await generateFixes(scan.business_name, scan.business_desc, gapQueries) : [];

    // India citation-check — extracts a city guess from the description if present
    const cityGuess = (scan.business_desc || "").match(
      /\b(Bangalore|Bengaluru|Mumbai|Delhi|Chennai|Hyderabad|Pune|Kolkata|Ahmedabad|Whitefield|Gurgaon|Gurugram|Noida)\b/i
    )?.[0];
    const citation = await runCitationCheck(scan.business_name, cityGuess);

    const results = {
      platforms: platforms.map((p) => ({ claude: "Claude", openai: "ChatGPT", gemini: "Gemini", perplexity: "Perplexity" }[p])),
      rows,
      summary,
      fixes,
      citation,
      ts: Date.now(),
    };

    await supabase
      .from("scans")
      .update({ scan_status: "complete", results })
      .eq("id", scanId);

    return NextResponse.json({ scanId, results });
  } catch (err) {
    if (scanId) {
      const supabase = createSupabaseServiceClient();
      await supabase.from("scans").update({ scan_status: "error" }).eq("id", scanId);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
