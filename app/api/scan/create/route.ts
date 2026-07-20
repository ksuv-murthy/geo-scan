import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

// Creates a pending scan row + a Razorpay order for the flat Rs 299 fee.
// Payment happens before the scan runs (agreed flow), so nothing here calls
// any AI platform yet — this just reserves the scan and returns checkout info.
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

    const { data: scan, error: dbError } = await supabase
      .from("scans")
      .insert({
        email,
        business_name: businessName,
        business_domain: businessDomain || null,
        business_desc: businessDesc || null,
        competitors: competitors || [],
        queries,
        amount_paise: AMOUNT_PAISE,
        payment_status: "pending",
        scan_status: "not_started",
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // If Razorpay keys aren't configured yet (placeholder mode), return the
    // scan without a real order — the frontend should show a "payments not
    // yet live" state rather than crash.
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({
        scanId: scan.id,
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
      razorpayConfigured: true,
      orderId: order.id,
      amount: AMOUNT_PAISE,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
