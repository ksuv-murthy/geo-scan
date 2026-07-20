import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

// Scans are created by email at checkout time, before any login exists
// (guest checkout, agreed flow). When someone later signs in via magic
// link, this backfills user_id onto any past scans matching their email so
// the dashboard can show full history under RLS.
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("scans")
    .update({ user_id: user.id })
    .eq("email", user.email)
    .is("user_id", null)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ linked: data?.length || 0 });
}
