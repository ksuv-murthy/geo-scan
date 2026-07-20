import { NextRequest, NextResponse } from "next/server";
import { suggestQueries } from "@/lib/scan-engine";

// Free to call (no payment gate) — generating candidate queries costs
// fractions of a cent and helps conversion by showing value before checkout.
export async function POST(req: NextRequest) {
  try {
    const { businessName, businessDesc } = await req.json();
    if (!businessName || !businessDesc) {
      return NextResponse.json({ error: "businessName and businessDesc are required" }, { status: 400 });
    }
    const queries = await suggestQueries(businessName, businessDesc);
    return NextResponse.json({ queries });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
