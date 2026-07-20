"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [sending, setSending] = useState(false);

  async function sendLink() {
    if (!email.trim()) return setErrorMsg("Add your email.");
    setSending(true);
    setErrorMsg("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-24 w-full">
      <div className="font-mono text-xs text-teal-400 mb-2">GEO SCAN</div>
      <h1 className="text-xl font-semibold mb-6">View your reports</h1>

      {sent ? (
        <p className="text-sm text-[#93A0BE]">
          Check <span className="text-white">{email}</span> for a sign-in link. It'll bring you straight to your
          dashboard.
        </p>
      ) : (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-[#111A2E] border border-[#1f2a45] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal-400 mb-3"
          />
          {errorMsg && <p className="text-xs text-red-400 mb-3">{errorMsg}</p>}
          <button
            onClick={sendLink}
            disabled={sending}
            className="w-full bg-teal-400 hover:bg-teal-300 disabled:opacity-50 text-[#052420] font-semibold rounded-lg py-2.5 text-sm"
          >
            {sending ? "Sending..." : "Send sign-in link"}
          </button>
          <p className="text-[11px] text-[#5B6784] mt-4">
            Use the same email you paid with — that's what your scans are linked to.
          </p>
        </>
      )}
    </div>
  );
}
