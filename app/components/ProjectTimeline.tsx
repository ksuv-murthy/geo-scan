// Project timeline — actual month-by-month build history, embedded on the
// report page so anyone viewing a scan (client, prospective buyer of the
// tool, etc.) can see this isn't a static one-off script but an actively
// maintained product. Dates below are pulled from PROGRESS.md's real
// build/incident history, not placeholders.

interface TimelineEntry {
  month: string;
  title: string;
  detail: string;
  status: "done" | "in_progress" | "planned";
}

const TIMELINE: TimelineEntry[] = [
  {
    month: "Feb 2026",
    title: "Landing page + scan engine",
    detail: "Business intake form, ₹299 Razorpay checkout, first-scan-free logic, parallelized Claude/ChatGPT/Gemini/Perplexity checks.",
    status: "done",
  },
  {
    month: "Mar 2026",
    title: "India citation graph + report page",
    detail: "JustDial/IndiaMART/Practo/Quora/GMB citation-check via SerpApi, score cards, full results table, AI-written summary.",
    status: "done",
  },
  {
    month: "Apr 2026",
    title: "Auto-implementation pipeline",
    detail: "\"Fix everything\" one-click publish to WordPress or a hosted page we serve, plus per-fix manual publish and copy-paste fallback.",
    status: "done",
  },
  {
    month: "May 2026",
    title: "Auth, dashboard, reliability fixes",
    detail: "Email magic-link login, scan history dashboard, demo-account support, and the [object Object] / Data-API-exposure / scan-timeout incidents resolved.",
    status: "done",
  },
  {
    month: "Jun 2026",
    title: "Model migrations + polish",
    detail: "gemini-2.0-flash → gemini-2.5-flash (shutdown), gpt-4o-mini → gpt-5.4-nano (deprecation); animated scan-in-progress state.",
    status: "done",
  },
  {
    month: "Jul 2026",
    title: "Final-fix HTML + website health check",
    detail: "Schema-correct HTML output across every publish destination, plus a technical/SEO health check layered onto each scan.",
    status: "in_progress",
  },
  {
    month: "Aug 2026",
    title: "Payments + usage limits live",
    detail: "Razorpay out of placeholder mode once KYC clears; usage metering so no single scan can run up the AI/SerpApi bill unbounded.",
    status: "planned",
  },
];

const STATUS_STYLE: Record<TimelineEntry["status"], { dot: string; label: string; text: string }> = {
  done: { dot: "#2DD4BF", label: "Shipped", text: "#2DD4BF" },
  in_progress: { dot: "#F5A524", label: "In progress", text: "#F5A524" },
  planned: { dot: "#5B6784", label: "Planned", text: "#93A0BE" },
};

export default function ProjectTimeline() {
  return (
    <div className="bg-[#141E36] border border-[#1f2a45] rounded-2xl p-6 mb-8">
      <h3 className="font-medium mb-1">Project timeline</h3>
      <p className="text-sm text-[#93A0BE] mb-5">
        How GEO Scan itself has been built out, month by month.
      </p>
      <div className="relative pl-5">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-[#1f2a45]" />
        <div className="space-y-5">
          {TIMELINE.map((entry) => {
            const style = STATUS_STYLE[entry.status];
            return (
              <div key={entry.month} className="relative">
                <span
                  className="absolute -left-5 top-1 w-3 h-3 rounded-full border-2 border-[#141E36]"
                  style={{ background: style.dot }}
                />
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-[11px] uppercase text-[#5B6784]">{entry.month}</span>
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                    style={{ color: style.text, background: `${style.dot}1a` }}
                  >
                    {style.label}
                  </span>
                </div>
                <div className="text-sm font-medium mb-0.5">{entry.title}</div>
                <p className="text-[13px] text-[#93A0BE] leading-relaxed">{entry.detail}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
