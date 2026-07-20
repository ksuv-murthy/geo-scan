import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

// Polled by the report page. Also the trigger for kicking off the actual
// scan the first time the paid report page loads (scan_status transitions
// not_started -> running -> complete here).
export async function GET(req: NextRequest) {
  const scanId = req.nextUrl.searchParams.get("scanId");
  if (!scanId) return NextResponse.json({ error: "scanId is required" }, { status: 400 });

  const supabase = createSupabaseServiceClient();
  const { data: scan, error } = await supabase.from("scans").select("*").eq("id", scanId).single();
  if (error || !scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  return NextResponse.json({ scan });
}
