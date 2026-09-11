import React from "react";
import { Link } from "react-router-dom";
import { Boxes, ShieldCheck, LineChart, Timer } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Static validation",
    body: "Duplicate ids, unreachable items, drifting advertised rates, broken pity configs -- caught before you ever run a pull.",
  },
  {
    icon: LineChart,
    title: "Monte Carlo simulation",
    body: "Hundreds of thousands of simulated pulls measure your real drop rates, not just what the config claims.",
  },
  {
    icon: Timer,
    title: "Pity that's actually verified",
    body: "We check whether your guaranteed-pull promise really holds, not just whether the number looks right.",
  },
];

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-bg">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center">
            <Boxes className="w-4.5 h-4.5" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">TrueLoot</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/pricing" className="text-[14px] text-ink-muted hover:text-ink px-3 py-2">
            Pricing
          </Link>
          <Link to="/login" className="text-[14px] text-ink-muted hover:text-ink px-3 py-2">
            Log in
          </Link>
          <Link to="/signup">
            <Button className="!px-4 !py-2">Sign Up Free</Button>
          </Link>
        </nav>
      </header>

      <section className="max-w-3xl mx-auto text-center px-6 pt-20 pb-16">
        <h1 className="text-[52px] leading-[1.08] font-semibold tracking-tight text-ink">
          Prove your loot odds<br />are what you say they are.
        </h1>
        <p className="mt-6 text-[19px] leading-relaxed text-ink-muted max-w-xl mx-auto">
          Validate loot table configs and Monte Carlo simulate real drop rates against what you advertise to
          players -- catch the compliance gap before a regulator does.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3">
          <Link to="/signup">
            <Button className="!px-6 !py-3 !text-[15px]">Try It Free</Button>
          </Link>
          <Link to="/pricing">
            <Button variant="secondary" className="!px-6 !py-3 !text-[15px]">
              View Pricing
            </Button>
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-7">
              <div className="w-10 h-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center mb-4">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-[16px] font-semibold mb-2">{title}</h3>
              <p className="text-[13.5px] text-ink-muted leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto text-center px-6 pb-28">
        <p className="text-[13px] text-ink-muted leading-relaxed">
          Belgium, the Netherlands, China, and South Korea all have gambling- or disclosure-law consequences when a
          game's real odds don't match what's published. This is the audit that stands between a compliance pass and
          a fine.
        </p>
      </section>
    </div>
  );
};
