import React from "react";
import { Link } from "react-router-dom";
import { Boxes, ShieldCheck, LineChart, Timer, Scale, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Static validation",
    body: "Duplicate ids, unreachable items, drifting advertised rates, broken pity configs -- caught before you ever run a pull.",
  },
  {
    icon: LineChart,
    title: "Monte Carlo simulation",
    body: "Up to 5,000,000 simulated pulls measure your real drop rates, with a proper Bonferroni-corrected significance test -- not just an eyeballed percentage.",
  },
  {
    icon: Timer,
    title: "Pity that's actually verified",
    body: "We check whether your guaranteed-pull promise really holds, not just whether the number looks right.",
  },
];

const PROOF_STATS = [
  { value: "51", label: "automated tests" },
  { value: "5", label: "region rule packs" },
  { value: "5M", label: "pulls per audit" },
  { value: "95%", label: "confidence intervals" },
];

const PREVIEW_ROWS = [
  { item: "legendary_sword", advertised: "1.00%", simulated: "1.41%", status: "red" as const },
  { item: "epic_sword", advertised: "5.00%", simulated: "4.98%", status: "green" as const },
  { item: "rare_sword", advertised: "25.00%", simulated: "25.01%", status: "green" as const },
];

/** Small non-interactive echo of the real Item Compliance table (see AuditResults.tsx) -- gives the hero a concrete product preview instead of an abstract illustration. */
const ProductPreview: React.FC = () => (
  <div
    className="w-full max-w-[560px] rounded-2xl bg-material-regular backdrop-blur-[30px] backdrop-saturate-[180%]
      shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-5 text-left"
  >
    <div className="flex items-center justify-between mb-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Item Compliance</span>
      <Badge tone="red" solid>
        Non-Compliant
      </Badge>
    </div>
    <div className="rounded-[12px] bg-surface overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-tertiary">
            <th className="text-left px-2.5 sm:px-3.5 py-2 whitespace-nowrap">Item</th>
            <th className="text-left px-2.5 sm:px-3.5 py-2 whitespace-nowrap">Advertised</th>
            <th className="text-left px-2.5 sm:px-3.5 py-2 whitespace-nowrap">Simulated</th>
            <th className="text-left px-2.5 sm:px-3.5 py-2 whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {PREVIEW_ROWS.map((row) => (
            <tr key={row.item}>
              <td className="px-2.5 sm:px-3.5 py-2 font-mono text-ink whitespace-nowrap">{row.item}</td>
              <td className="px-2.5 sm:px-3.5 py-2 text-ink-muted whitespace-nowrap">{row.advertised}</td>
              <td className="px-2.5 sm:px-3.5 py-2 text-ink-muted whitespace-nowrap">{row.simulated}</td>
              <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap">
                <Badge tone={row.status} solid>
                  {row.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-bg overflow-x-hidden">
      <header className="sticky top-0 z-40 bg-material-thin backdrop-blur-[30px] backdrop-saturate-[180%] border-b border-line/70">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[10px] bg-accent text-white flex items-center justify-center">
              <Boxes className="w-4.5 h-4.5" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">TrueLoot</span>
          </div>
          <nav className="flex items-center gap-1">
            <Link
              to="/pricing"
              className="hidden sm:inline-block text-[14px] font-medium text-ink-muted hover:text-ink px-3 py-2 rounded-md transition-colors"
            >
              Pricing
            </Link>
            <Link
              to="/login"
              className="hidden sm:inline-block text-[14px] font-medium text-ink-muted hover:text-ink px-3 py-2 rounded-md transition-colors"
            >
              Log in
            </Link>
            <Link to="/signup" className="sm:ml-2">
              <Button className="!px-4 !py-2 !text-[14px] whitespace-nowrap">Sign Up Free</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
        {/* Ambient glow -- one system tint (blue), low alpha, purely atmospheric. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[560px] w-[900px] max-w-[140vw] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]"
        />

        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft text-accent text-[12px] font-semibold px-3 py-1.5 mb-6">
            Now covering 5 compliance regions
          </span>
          <h1 className="text-[38px] sm:text-[44px] md:text-[56px] leading-[1.05] font-semibold tracking-tight text-ink text-balance">
            Prove your loot odds
            <br />
            are what you say they are.
          </h1>
          <p className="mt-6 text-[17px] leading-relaxed text-ink-muted max-w-xl mx-auto">
            Validate loot table configs and Monte Carlo simulate real drop rates against what you advertise to
            players -- catch the compliance gap before a regulator does.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/signup" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto !px-6 !py-3 !text-[15px]">
                Try It Free <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/pricing" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full sm:w-auto !px-6 !py-3 !text-[15px]">
                View Pricing
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-16 flex justify-center px-4">
          <ProductPreview />
        </div>
      </section>

      <section className="border-y border-line/70 bg-surface">
        <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {PROOF_STATS.map((s) => (
            <div key={s.label}>
              <div className="text-[28px] font-semibold tracking-tight text-ink tabular-nums">{s.value}</div>
              <div className="text-[12.5px] text-ink-muted mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <h2 className="text-[28px] font-semibold tracking-tight text-ink">Three checks, one audit</h2>
          <p className="mt-2 text-[15px] text-ink-muted">Every run does all three -- nothing to configure.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-7">
              <div className="w-10 h-10 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center mb-4">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-[16px] font-semibold mb-2">{title}</h3>
              <p className="text-[13.5px] text-ink-muted leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-24">
        <Card className="p-8 flex flex-col sm:flex-row items-start gap-5">
          <div className="w-11 h-11 rounded-[12px] bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-ink mb-1.5">A real regulatory gap, not a hypothetical</h3>
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              Belgium, the Netherlands, China, and South Korea all have gambling- or disclosure-law consequences when
              a game's real odds don't match what's published. This is the audit that stands between a compliance
              pass and a fine.
            </p>
          </div>
        </Card>
      </section>

      <section className="border-t border-line/70">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <h2 className="text-[28px] font-semibold tracking-tight text-ink">Start free, no card required.</h2>
          <div className="mt-7">
            <Link to="/signup">
              <Button className="!px-7 !py-3.5 !text-[15px]">
                Try It Free <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line/70">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[13px] text-ink-muted">
            <Boxes className="w-4 h-4" />
            TrueLoot
          </div>
          <nav className="flex items-center gap-5 text-[13px] text-ink-muted">
            <Link to="/pricing" className="hover:text-ink transition-colors">
              Pricing
            </Link>
            <Link to="/login" className="hover:text-ink transition-colors">
              Log in
            </Link>
            <Link to="/signup" className="hover:text-ink transition-colors">
              Sign up
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};
