"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessDomain, setBusinessDomain] = useState("");
  const [businessDesc, setBusinessDesc] = useState("");
  const [businessComp, setBusinessComp] = useState("");
  const [queries, setQueries] = useState<string[]>(["", "", ""]);
  const [suggesting, setSuggesting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [freeScanAvailable, setFreeScanAvailable] = useState<boolean | null>(null);
  const eligibilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check free-scan eligibility as the user finishes typing their email —
  // first scan for any email is free, every scan after that is Rs 299.
  useEffect(() => {
    if (eligibilityTimer.current) clearTimeout(eligibilityTimer.current);
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      setFreeScanAvailable(null);
      return;
    }
    eligibilityTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/scan/check-eligibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        });
        const data = await res.json();
        if (res.ok) setFreeScanAvailable(data.freeScanAvailable);
      } catch {
        setFreeScanAvailable(null);
      }
    }, 500);
    return () => {
      if (eligibilityTimer.current) clearTimeout(eligibilityTimer.current);
    };
  }, [email]);

  function updateQuery(i: number, value: string) {
    setQueries((qs) => qs.map((q, idx) => (idx === i ? value : q)));
  }
  function removeQuery(i: number) {
    setQueries((qs) => qs.filter((_, idx) => idx !== i));
  }
  function addQuery() {
    setQueries((qs) => [...qs, ""]);
  }

  async function suggestQueries() {
    if (!businessName.trim() || !businessDesc.trim()) {
      setErrorMsg("Add a business name and description first.");
      return;
    }
    setErrorMsg("");
    setSuggesting(true);
    try {
      const res = await fetch("/api/scan/suggest-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, businessDesc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate queries");
      setQueries(data.queries);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggesting(false);
    }
  }

  function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async function startScan() {
    setErrorMsg("");
    if (!email.trim()) return setErrorMsg("Add your email — we'll send the report link there.");
    if (!businessName.trim()) return setErrorMsg("Add the business name.");
    const cleanQueries = queries.map((q) => q.trim()).filter(Boolean);
    if (cleanQueries.length === 0) return setErrorMsg("Add at least one test query.");

    setPaying(true);
    try {
      const competitors = businessComp
        ? businessComp.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const createRes = await fetch("/api/scan/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          businessName,
          businessDomain,
          businessDesc,
          competitors,
          queries: cleanQueries,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || "Could not start scan");

      if (created.free) {
        router.push(`/report/${created.scanId}?email=${encodeURIComponent(email)}`);
        return;
      }

      if (!created.razorpayConfigured) {
        setErrorMsg(
          "Payments aren't live yet on this deployment (Razorpay keys not configured). Your scan was saved as a draft."
        );
        setPaying(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) throw new Error("Could not load payment checkout. Check your connection and try again.");

      const rzp = new window.Razorpay({
        key: created.keyId,
        amount: created.amount,
        currency: created.currency,
        name: "GEO Scan",
        description: `AI visibility audit — ${businessName}`,
        order_id: created.orderId,
        prefill: { email },
        theme: { color: "#2DD4BF" },
        handler: async function (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) {
          const verifyRes = await fetch("/api/scan/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scanId: created.scanId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          const verified = await verifyRes.json();
          if (!verifyRes.ok || !verified.verified) {
            setErrorMsg("Payment could not be verified. If money was deducted, contact support with your email.");
            setPaying(false);
            return;
          }
          router.push(`/report/${created.scanId}?email=${encodeURIComponent(email)}`);
        },
        modal: {
          ondismiss: function () {
            setPaying(false);
          },
        },
      });
      rzp.open();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPaying(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 w-full">
      <div className="mb-10">
        <div className="font-mono text-sm tracking-wide text-teal-400 mb-1">GEO SCAN</div>
        <h1 className="text-2xl font-semibold mb-2">Does the AI even know you exist?</h1>
        <p className="text-[#93A0BE] text-sm leading-relaxed">
          Check whether ChatGPT, Gemini, Perplexity, and Claude mention your business when a real buyer asks —
          plus your visibility on JustDial, IndiaMART, Practo, Quora, and Google Business. Get ready-to-publish
          fixes for the gaps. First scan free, ₹299 after that.
        </p>
      </div>

      <div className="space-y-5 bg-[#141E36] border border-[#1f2a45] rounded-2xl p-6">
        <div>
          <label className="block text-xs text-[#93A0BE] mb-1.5">Your email (report gets sent here)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-[#111A2E] border border-[#1f2a45] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal-400"
          />
        </div>
        <div>
          <label className="block text-xs text-[#93A0BE] mb-1.5">Business name</label>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Deens Academy"
            className="w-full bg-[#111A2E] border border-[#1f2a45] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal-400"
          />
        </div>
        <div>
          <label className="block text-xs text-[#93A0BE] mb-1.5">Website / domain (optional)</label>
          <input
            value={businessDomain}
            onChange={(e) => setBusinessDomain(e.target.value)}
            placeholder="e.g. deensacademy.com"
            className="w-full bg-[#111A2E] border border-[#1f2a45] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal-400"
          />
        </div>
        <div>
          <label className="block text-xs text-[#93A0BE] mb-1.5">What they do + where</label>
          <textarea
            value={businessDesc}
            onChange={(e) => setBusinessDesc(e.target.value)}
            placeholder="e.g. CBSE school in Whitefield, Bangalore, Nursery to Grade 12"
            className="w-full bg-[#111A2E] border border-[#1f2a45] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal-400 min-h-16"
          />
        </div>
        <div>
          <label className="block text-xs text-[#93A0BE] mb-1.5">Competitors (comma-separated, optional)</label>
          <input
            value={businessComp}
            onChange={(e) => setBusinessComp(e.target.value)}
            placeholder="e.g. Vydehi School of Excellence, Glentree Academy"
            className="w-full bg-[#111A2E] border border-[#1f2a45] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal-400"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-[#93A0BE]">Test queries</label>
            <button
              onClick={suggestQueries}
              disabled={suggesting}
              className="text-xs border border-[#1f2a45] rounded-md px-2.5 py-1 text-[#93A0BE] hover:border-[#33436b] disabled:opacity-50"
            >
              {suggesting ? "Writing..." : "Suggest queries"}
            </button>
          </div>
          <div className="space-y-2">
            {queries.map((q, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={q}
                  onChange={(e) => updateQuery(i, e.target.value)}
                  placeholder="e.g. best CBSE school in Whitefield Bangalore"
                  className="flex-1 bg-[#111A2E] border border-[#1f2a45] rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                />
                <button
                  onClick={() => removeQuery(i)}
                  className="w-8 h-8 flex items-center justify-center border border-[#1f2a45] rounded-md text-[#5B6784] hover:text-red-400 hover:border-red-400"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addQuery}
            className="mt-2 w-full text-xs border border-[#1f2a45] rounded-md py-1.5 text-[#93A0BE] hover:border-[#33436b]"
          >
            + Add query
          </button>
          <p className="text-[11px] text-[#5B6784] mt-2 leading-relaxed">
            These are the real questions a buyer would type. &quot;Suggest queries&quot; writes 8 for you free —
            edit freely before running.
          </p>
        </div>

        {errorMsg && (
          <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {errorMsg}
          </div>
        )}

        <button
          onClick={startScan}
          disabled={paying}
          className="w-full bg-teal-400 hover:bg-teal-300 disabled:opacity-50 text-[#052420] font-semibold rounded-lg py-3 text-sm transition"
        >
          {paying
            ? "Starting scan..."
            : freeScanAvailable
            ? "Run free scan"
            : "Pay ₹299 & run scan"}
        </button>
        {freeScanAvailable && (
          <p className="text-center text-[11px] text-teal-400">Your first scan is free — no payment needed.</p>
        )}
        <p className="text-center text-[11px] text-[#5B6784]">
          Already paid?{" "}
          <a href="/dashboard" className="text-teal-400 underline">
            View your reports
          </a>
        </p>
      </div>
    </div>
  );
}
