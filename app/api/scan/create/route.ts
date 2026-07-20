import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { errorMessage } from "@/lib/error-message";

// Creates a scan row, then either:
//  - marks it paid immediately for free (first scan for this email — a
//    genuine growth offer, not just a test bypass), or
//  - creates a Razorpay order for the flat Rs 299 fee (every scan after the
//    first one from the same email).
// Either way, nothing here calls any AI platform yet — the actual scan is
// triggered from the report page once payment_status is 'paid'.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, businessName, businessDomain, businessDesc, competitors, queries } = body;

    if (!email || !businessName || !queries?.length) {
      return NextResponse.json(
        { error: "email, businessName, and at least one query are required" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServiceClient();
    const AMOUNT_PAISE = 29900; // Rs 299.00 flat

    // Demo/testing accounts — unlimited free scans, no payment ever. Set via
    // DEMO_EMAILS env var as a comma-separated list (e.g.
    // "ksuvmurthy@gmail.com,other@example.com"). Not a code-level hack —
    // this is meant to stay configurable for whoever needs demo access.
    const demoEmails = (process.env.DEMO_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isDemoAccount = demoEmails.includes(email.trim().toLowerCase());

    // Has this email ever had a paid (or free-first) scan before?
    const { count: priorPaidCount } = await supabase
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .eq("payment_status", "paid");

    const isFreeFirstScan = isDemoAccount || (priorPaidCount || 0) === 0;

    const { data: scan, error: dbError } = await supabase
      .from("scans")
      .insert({
        email,
        business_name: businessName,
        business_domain: businessDomain || null,
        business_desc: businessDesc || null,
        competitors: competitors || [],
        queries,
        amount_paise: isFreeFirstScan ? 0 : AMOUNT_PAISE,
        payment_status: isFreeFirstScan ? "paid" : "pending",
        scan_status: "not_started",
      })
      .select()
      .single();

    if (dbError) throw dbError;

    if (isFreeFirstScan) {
      return NextResponse.json({
        scanId: scan.id,
        free: true,
      });
    }

    // If Razorpay keys aren't configured yet (placeholder mode), return the
    // scan without a real order — the frontend should show a "payments not
    // yet live" state rather than crash.
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({
        scanId: scan.id,
        free: false,
        razorpayConfigured: false,
      });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount: AMOUNT_PAISE,
      currency: "INR",
      receipt: scan.id,
      notes: { scan_id: scan.id, business_name: businessName },
    });

    await supabase.from("scans").update({ razorpay_order_id: order.id }).eq("id", scan.id);

    return NextResponse.json({
      scanId: scan.id,
      free: false,
      razorpayConfigured: true,
      orderId: order.id,
      amount: AMOUNT_PAISE,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) },
      { status: 500 }
    );
  }
}
