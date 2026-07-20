"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";

interface ScanRow {
  query: string;
  platformLabel: string;
  text: string;
  error: string | null;
  mentioned: boolean;
  compHits: string[];
}
interface FixDraft {
  question: string;
  answer: string;
  schema: string;
}
interface CitationResult {
  source: string;
  found: boolean;
  evidence?: string;
  link?: string;
  error?: string;
}
interface ScanResults {
  platforms: string[];
  rows: ScanRow[];
  summary: { summary: string; recommendations: string[] } | null;
  fixes: FixDraft[];
  citation: CitationResult[];
  ts: number;
}
interface Scan {
  id: string;
  business_name: string;
  business_domain: string | null;
  payment_status: string;
  scan_status: string;
  results: ScanResults | null;
}

export default function ReportPage() {
  const params = useParams();
  const scanId = params.id as string;
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [publishOpen, setPublishOpen] = useState<number | null>(null);
  const [wpForm, setWpForm] = useState({ siteUrl: "", username: "", appPassword: "" });
  const [publishStatus, setPublishStatus] = useState<Record<number, string>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [wpConnectOpen, setWpConnectOpen] = useState(false);
  const [fixingAll, setFixingAll] = useState(false);
  const [fixAllSummary, setFixAllSummary] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/scan/status?scanId=${scanId}`);
    const data = await res.json();
    if (res.ok) setScan(data.scan);
    return data.scan as Scan | undefined;
  }, [scanId]);

  const triggerRun = useCallback(async () => {
    try {
      const res = await fetch("/api/scan/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [scanId]);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval>;

    async function init() {
      const s = await fetchStatus();
      if (!s) return;
      if (s.payment_status !== "paid") {
        setErrorMsg("This scan hasn't been paid for yet.");
        setLoading(false);
        return;
      }
      if (s.scan_status === "not_started") {
        triggerRun();
      }
      interval = setInterval(async () => {
        const latest = await fetchStatus();
        if (cancelled || !latest) return;
        if (latest.scan_status === "complete" || latest.scan_status === "error") {
          clearInterval(interval);
          setLoading(false);
        }
      }, 3000);
    }
    init();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  async function publishFix(
    fixIndex: number,
    destination: "wordpress" | "hosted_page" | "copy_paste"
  ): Promise<boolean> {
    setPublishStatus((s) => ({ ...s, [fixIndex]: "publishing" }));
    try {
      const res = await fetch("/api/scan/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId,
          fixIndex,
          destination,
          wordpress: destination === "wordpress" ? wpForm : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      if (destination === "copy_paste") {
        await navigator.clipboard.writeText(data.publish.destination_meta.block);
        setCopiedIndex(fixIndex);
        setTimeout(() => setCopiedIndex(null), 1800);
      }
      setPublishStatus((s) => ({ ...s, [fixIndex]: "done" }));
      return true;
    } catch (err) {
      setPublishStatus((s) => ({ ...s, [fixIndex]: `error: ${err instanceof Error ? err.message : String(err)}` }));
      return false;
    }
  }

  // One-click automation: publishes every drafted fix in one action instead
  // of clicking publish per-fix. Uses WordPress if credentials are filled
  // in above; any fix that fails there (or when no WP is connected at all)
  // automatically falls back to a hosted page, so nothing is left undone.
  async function fixEverything() {
    if (!scan?.results?.fixes?.length) return;
    setFixingAll(true);
    setFixAllSummary(null);
    const wpConnected = !!(wpForm.siteUrl && wpForm.username && wpForm.appPassword);
    let wpCount = 0;
    let hostedCount = 0;

    for (let i = 0; i < scan.results.fixes.length; i++) {
      if (wpConnected) {
        const ok = await publishFix(i, "wordpress");
        if (ok) {
          wpCount++;
          continue;
        }
      }
      const ok = await publishFix(i, "hosted_page");
      if (ok) hostedCount++;
    }

    const total = scan.results.fixes.length;
    const parts: string[] = [];
    if (wpCount) parts.push(`${wpCount} to WordPress`);
    if (hostedCount) parts.push(`${hostedCount} to hosted pages`);
    const published = wpCount + hostedCount;
    setFixAllSummary(
      published === total
        ? `All ${total} fixes published (${parts.join(", ")}).`
        : `${published} of ${total} fixes published (${parts.join(", ") || "none"}). Check individual fixes below for errors.`
    );
    setFixingAll(false);
  }

  if (errorMsg && !scan?.results) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-red-400 text-sm">{errorMsg}</p>
        <a href="/" className="text-teal-400 underline text-sm mt-4 inline-block">
          Back to start
        </a>
      </div>
    );
  }

  if (loading || !scan?.results) {
    return <ScanningState />;
  }

  const r = scan.results;
  const platformStats: Record<string, { total: number; hit: number }> = {};
  r.platforms.forEach((pl) => (platformStats[pl] = { total: 0, hit: 0 }));
  r.rows.forEach((row) => {
    if (row.error) return;
    platformStats[row.platformLabel].total++;
    if (row.mentioned) platformStats[row.platformLabel].hit++;
  });
  const totalHit = r.rows.filter((row) => !row.error && row.mentioned).length;
  const totalChecked = r.rows.filter((row) => !row.error).length;
  const overallPct = totalChecked ? Math.round((100 * totalHit) / totalChecked) : 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 w-full">
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-[#1f2a45]">
        <div>
          <div className="font-mono text-xs text-teal-400 mb-1">GEO SCAN</div>
          <h1 className="text-xl font-semibold">{scan.business_name}</h1>
        </div>
        <button onClick={() => window.print()} className="text-xs border border-[#1f2a45] rounded-md px-3 py-1.5 text-[#93A0BE]">
          Print / Save PDF
        </button>
      </div>

      <div className="flex items-center gap-6 bg-[#1B2846] border border-[#1f2a45] rounded-2xl p-6 mb-6">
        <div className="text-3xl font-mono font-bold" style={{ color: overallPct >= 50 ? "#2DD4BF" : overallPct > 0 ? "#F5A524" : "#FB7185" }}>
          {overallPct}%
        </div>
        <div>
          <h2 className="font-medium mb-1">Overall AI visibility</h2>
          <p className="text-sm text-[#93A0BE]">
            Mentioned in {totalHit} of {totalChecked} checks across {r.platforms.join(", ")}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {r.platforms.map((pl) => {
          const s = platformStats[pl];
          const pct = s.total ? Math.round((100 * s.hit) / s.total) : 0;
          const color = pct >= 50 ? "#2DD4BF" : pct > 0 ? "#F5A524" : "#FB7185";
          return (
            <div key={pl} className="bg-[#141E36] border border-[#1f2a45] rounded-xl p-4">
              <div className="font-mono text-[10px] uppercase text-[#93A0BE] mb-2">{pl}</div>
              <div className="text-2xl font-mono font-bold" style={{ color }}>
                {s.total ? `${pct}%` : "—"}
              </div>
              <div className="text-[11px] text-[#5B6784] mt-1">{s.hit} of {s.total} mentioned</div>
            </div>
          );
        })}
      </div>

      {r.summary && (
        <div className="bg-[#1B2846] border border-[#1f2a45] rounded-2xl p-6 mb-8">
          <h3 className="font-medium mb-2">What this means</h3>
          <p className="text-sm text-[#93A0BE] mb-4 leading-relaxed">{r.summary.summary}</p>
          <ol className="list-decimal list-inside space-y-1.5 text-sm">
            {r.summary.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="bg-[#141E36] border border-[#1f2a45] rounded-2xl p-6 mb-8">
        <h3 className="font-medium mb-4">India citation footprint</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {r.citation?.map((c) => (
            <div key={c.source} className="flex items-center justify-between text-sm border border-[#1f2a45] rounded-lg px-3 py-2">
              <span>{c.source}</span>
              <span className={c.found ? "text-teal-400" : "text-red-400"}>{c.found ? "Found" : c.error ? "—" : "Not found"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#141E36] border border-[#1f2a45] rounded-2xl p-6 mb-8 overflow-x-auto">
        <h3 className="font-medium mb-4">Full results</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-[#5B6784] border-b border-[#1f2a45]">
              <th className="pb-2 pr-3">Query</th>
              <th className="pb-2 pr-3">Platform</th>
              <th className="pb-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row, i) => (
              <tr key={i} className="border-b border-[#1f2a45] align-top">
                <td className="py-2.5 pr-3 max-w-[240px]">{row.query}</td>
                <td className="py-2.5 pr-3 font-mono text-xs text-[#93A0BE] whitespace-nowrap">{row.platformLabel}</td>
                <td className="py-2.5">
                  <span
                    className="inline-flex text-[11px] font-mono px-2 py-0.5 rounded-full"
                    style={{
                      background: row.error ? "rgba(148,163,196,0.16)" : row.mentioned ? "rgba(45,212,191,0.14)" : "rgba(251,113,133,0.14)",
                      color: row.error ? "#5B6784" : row.mentioned ? "#2DD4BF" : "#FB7185",
                    }}
                  >
                    {row.error ? "error" : row.mentioned ? "mentioned" : "absent"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.fixes?.length > 0 && (
        <div className="bg-[#1B2846] border border-[#1f2a45] rounded-2xl p-6">
          <h3 className="font-medium mb-1">Ready to ship — content for the biggest gaps</h3>
          <p className="text-sm text-[#93A0BE] mb-4">
            Drafted from your scan data. Fix everything in one click, or review and publish each one individually
            below — to WordPress, a hosted page we host for you, or copy-paste anywhere (Canva, Google Business
            Q&amp;A, any site builder).
          </p>

          <div className="bg-[#111A2E] border border-[#1f2a45] rounded-xl p-4 mb-5">
            <button
              onClick={() => setWpConnectOpen(!wpConnectOpen)}
              className="text-xs text-[#93A0BE] underline mb-2"
            >
              {wpConnectOpen ? "Hide" : "Have WordPress? Connect it"} (optional — otherwise fixes go to hosted pages)
            </button>
            {wpConnectOpen && (
              <div className="space-y-2 mt-2">
                <input
                  placeholder="https://yoursite.com"
                  value={wpForm.siteUrl}
                  onChange={(e) => setWpForm((s) => ({ ...s, siteUrl: e.target.value }))}
                  className="w-full bg-[#0B1220] border border-[#1f2a45] rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-teal-400"
                />
                <input
                  placeholder="WordPress username"
                  value={wpForm.username}
                  onChange={(e) => setWpForm((s) => ({ ...s, username: e.target.value }))}
                  className="w-full bg-[#0B1220] border border-[#1f2a45] rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-teal-400"
                />
                <input
                  type="password"
                  placeholder="Application password"
                  value={wpForm.appPassword}
                  onChange={(e) => setWpForm((s) => ({ ...s, appPassword: e.target.value }))}
                  className="w-full bg-[#0B1220] border border-[#1f2a45] rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-teal-400"
                />
                <p className="text-[10px] text-[#5B6784] leading-relaxed">
                  Create this in the client&apos;s WP admin: Users → Profile → Application Passwords.
                </p>
              </div>
            )}
            <button
              onClick={fixEverything}
              disabled={fixingAll}
              className="w-full mt-3 bg-teal-400 hover:bg-teal-300 disabled:opacity-50 text-[#052420] font-semibold rounded-lg py-2.5 text-sm transition"
            >
              {fixingAll ? "Publishing all fixes…" : `Fix everything (${r.fixes.length})`}
            </button>
            {fixAllSummary && <p className="text-[11px] text-teal-400 mt-2">{fixAllSummary}</p>}
          </div>

          <div className="space-y-4">
            {r.fixes.map((f, i) => (
              <div key={i} className="bg-[#111A2E] border border-[#1f2a45] rounded-xl p-4">
                <div className="font-mono text-[11px] text-[#5B6784] mb-2">GAP {i + 1} — &quot;{f.question}&quot;</div>
                <p className="text-sm mb-3">{f.answer}</p>
                <details className="mb-3">
                  <summary className="text-[11px] text-[#5B6784] cursor-pointer font-mono">view FAQ schema (JSON-LD)</summary>
                  <pre className="text-[10px] text-[#93A0BE] whitespace-pre-wrap mt-2 bg-[#0B1220] p-2 rounded">{f.schema}</pre>
                </details>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setPublishOpen(publishOpen === i ? null : i)}
                    className="text-xs border border-[#1f2a45] rounded-md px-3 py-1.5 hover:border-[#33436b]"
                  >
                    Publish to WordPress
                  </button>
                  <button
                    onClick={() => publishFix(i, "hosted_page")}
                    className="text-xs border border-[#1f2a45] rounded-md px-3 py-1.5 hover:border-[#33436b]"
                  >
                    Host this page for me
                  </button>
                  <button
                    onClick={() => publishFix(i, "copy_paste")}
                    className="text-xs border border-[#1f2a45] rounded-md px-3 py-1.5 hover:border-[#33436b]"
                  >
                    {copiedIndex === i ? "Copied ✓" : "Copy answer + schema"}
                  </button>
                </div>

                {publishOpen === i && (
                  <div className="mt-3 space-y-2 border-t border-[#1f2a45] pt-3">
                    <input
                      placeholder="https://yoursite.com"
                      value={wpForm.siteUrl}
                      onChange={(e) => setWpForm((s) => ({ ...s, siteUrl: e.target.value }))}
                      className="w-full bg-[#0B1220] border border-[#1f2a45] rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-teal-400"
                    />
                    <input
                      placeholder="WordPress username"
                      value={wpForm.username}
                      onChange={(e) => setWpForm((s) => ({ ...s, username: e.target.value }))}
                      className="w-full bg-[#0B1220] border border-[#1f2a45] rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-teal-400"
                    />
                    <input
                      type="password"
                      placeholder="Application password"
                      value={wpForm.appPassword}
                      onChange={(e) => setWpForm((s) => ({ ...s, appPassword: e.target.value }))}
                      className="w-full bg-[#0B1220] border border-[#1f2a45] rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-teal-400"
                    />
                    <p className="text-[10px] text-[#5B6784] leading-relaxed">
                      Create this in the client&apos;s WP admin: Users → Profile → Application Passwords.
                    </p>
                    <button
                      onClick={() => publishFix(i, "wordpress")}
                      className="text-xs bg-teal-400 text-[#052420] font-medium rounded-md px-3 py-1.5"
                    >
                      Publish now
                    </button>
                  </div>
                )}

                {publishStatus[i] && (
                  <p className={`text-[11px] mt-2 ${publishStatus[i].startsWith("error") ? "text-red-400" : "text-teal-400"}`}>
                    {publishStatus[i] === "publishing" ? "Publishing…" : publishStatus[i] === "done" ? "Published ✓" : publishStatus[i]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Scanning animation ----------
// A real progress signal instead of static "please wait" text — a scan
// genuinely takes 20-40+ seconds (multiple AI platforms, sequential-feeling
// work under the hood), and a motionless screen reads as frozen well before
// that. This sweeps through each platform being checked plus a rotating
// status line, so there's always something visibly moving.
const SCAN_PLATFORMS = [
  { label: "Claude", color: "#2DD4BF" },
  { label: "ChatGPT", color: "#F5A524" },
  { label: "Gemini", color: "#818CF8" },
  { label: "Perplexity", color: "#FB7185" },
];

const SCAN_STATUS_LINES = [
  "Asking real buyer-intent questions…",
  "Checking who gets mentioned…",
  "Cross-referencing competitors…",
  "Scanning JustDial, IndiaMART, Practo…",
  "Checking your Google Business footprint…",
  "Drafting fixes for the biggest gaps…",
];

function ScanningState() {
  const [activePlatform, setActivePlatform] = useState(0);
  const [statusLine, setStatusLine] = useState(0);
  const [dotAngle, setDotAngle] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const platformTimer = setInterval(() => {
      setActivePlatform((p) => (p + 1) % SCAN_PLATFORMS.length);
    }, 1400);
    const statusTimer = setInterval(() => {
      setStatusLine((s) => (s + 1) % SCAN_STATUS_LINES.length);
    }, 2600);

    let start: number | null = null;
    function tick(ts: number) {
      if (start === null) start = ts;
      const elapsed = ts - start;
      setDotAngle((elapsed / 1000) * 90); // 90deg/sec sweep
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      clearInterval(platformTimer);
      clearInterval(statusTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const sweepX = 50 + 42 * Math.cos((dotAngle * Math.PI) / 180);
  const sweepY = 50 + 42 * Math.sin((dotAngle * Math.PI) / 180);

  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      <div className="font-mono text-xs text-teal-400 mb-8 tracking-widest">GEO SCAN</div>

      <div className="relative w-44 h-44 mx-auto mb-8">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <radialGradient id="sweepFade" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
            </radialGradient>
          </defs>
          {[42, 30, 18].map((r) => (
            <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#1f2a45" strokeWidth="1" />
          ))}
          <line x1="50" y1="8" x2="50" y2="92" stroke="#1f2a45" strokeWidth="0.5" />
          <line x1="8" y1="50" x2="92" y2="50" stroke="#1f2a45" strokeWidth="0.5" />
          <path
            d={`M 50 50 L ${sweepX} ${sweepY} A 42 42 0 0 1 ${
              50 + 42 * Math.cos(((dotAngle - 40) * Math.PI) / 180)
            } ${50 + 42 * Math.sin(((dotAngle - 40) * Math.PI) / 180)} Z`}
            fill="url(#sweepFade)"
          />
          <circle cx={sweepX} cy={sweepY} r="2.2" fill="#2DD4BF" />
          <circle cx="50" cy="50" r="3" fill="#0B1220" stroke="#2DD4BF" strokeWidth="1.5" />
        </svg>
      </div>

      <div className="flex items-center justify-center gap-2 mb-6">
        {SCAN_PLATFORMS.map((p, i) => (
          <div
            key={p.label}
            className="px-3 py-1.5 rounded-full text-xs font-mono border transition-all duration-500"
            style={{
              borderColor: i === activePlatform ? p.color : "#1f2a45",
              color: i === activePlatform ? p.color : "#5B6784",
              background: i === activePlatform ? `${p.color}1a` : "transparent",
              transform: i === activePlatform ? "scale(1.08)" : "scale(1)",
            }}
          >
            {p.label}
          </div>
        ))}
      </div>

      <h1 className="text-lg font-medium mb-2">Running your scan…</h1>
      <p className="text-[#93A0BE] text-sm h-5 transition-opacity duration-300">
        {SCAN_STATUS_LINES[statusLine]}
      </p>
      <p className="text-[#5B6784] text-[11px] mt-6">
        This usually takes 20-40 seconds. Feel free to leave this open — it&apos;ll update automatically.
      </p>
    </div>
  );
}
