"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface ScanSummary {
  id: string;
  business_name: string;
  payment_status: string;
  scan_status: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [scans, setScans] = useState<ScanSummary[] | null>(null);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserEmail(user.email || "");

      // backfill any pre-login scans tied to this email
      await fetch("/api/scan/link-account", { method: "POST" });

      const { data } = await supabase
        .from("scans")
        .select("id, business_name, payment_status, scan_status, created_at")
        .order("created_at", { ascending: false });
      setScans(data || []);
    }
    load();
  }, [router]);

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="font-mono text-xs text-teal-400 mb-1">GEO SCAN</div>
          <h1 className="text-xl font-semibold">Your reports</h1>
          {userEmail && <p className="text-xs text-[#5B6784] mt-1">{userEmail}</p>}
        </div>
        <a href="/" className="text-xs border border-[#1f2a45] rounded-md px-3 py-1.5 text-[#93A0BE]">
          New scan
        </a>
      </div>

      {scans === null && <p className="text-sm text-[#5B6784]">Loading…</p>}
      {scans?.length === 0 && (
        <p className="text-sm text-[#5B6784]">No scans yet. Run your first one from the homepage.</p>
      )}

      <div className="space-y-2">
        {scans?.map((s) => (
          <a
            key={s.id}
            href={s.payment_status === "paid" ? `/report/${s.id}` : "/"}
            className="flex items-center justify-between bg-[#141E36] border border-[#1f2a45] rounded-xl px-4 py-3 hover:border-[#33436b]"
          >
            <div>
              <div className="text-sm">{s.business_name}</div>
              <div className="text-[11px] text-[#5B6784]">{new Date(s.created_at).toLocaleDateString()}</div>
            </div>
            <span
              className="text-[11px] font-mono px-2 py-0.5 rounded-full"
              style={{
                background: s.scan_status === "complete" ? "rgba(45,212,191,0.14)" : "rgba(148,163,196,0.16)",
                color: s.scan_status === "complete" ? "#2DD4BF" : "#93A0BE",
              }}
            >
              {s.payment_status !== "paid" ? "unpaid" : s.scan_status}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
