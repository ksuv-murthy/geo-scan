import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

// Verifies the Razorpay payment signature server-side (never trust the
// client's word that a payment succeeded) and flips the scan to "paid".
export async function POST(req: NextRequest) {
  try {
    const { scanId, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      await req.json();

    if (!scanId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment verification fields" }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: "Payment signature verification failed" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from("scans")
      .update({
        payment_status: "paid",
        razorpay_payment_id,
      })
      .eq("id", scanId)
      .eq("razorpay_order_id", razorpay_order_id);

    if (error) throw error;

    return NextResponse.json({ verified: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
