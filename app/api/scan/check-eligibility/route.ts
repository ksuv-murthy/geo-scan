import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { errorMessage } from "@/lib/error-message";

// Lets the landing page show "Run free scan" vs "Pay ₹299 & run scan"
// before the user commits — checked as they type their email, not just at
// submit time.
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

    const demoEmails = (process.env.DEMO_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (demoEmails.includes(email.trim().toLowerCase())) {
      return NextResponse.json({ freeScanAvailable: true, demo: true });
    }

    const supabase = createSupabaseServiceClient();
    const { count } = await supabase
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .eq("payment_status", "paid");

    return NextResponse.json({ freeScanAvailable: (count || 0) === 0 });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
