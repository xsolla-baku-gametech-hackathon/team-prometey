import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Boxes } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { fetchPlans } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Plan, PlanLimits } from "../types";

const PLAN_META: Record<Plan, { label: string; price: string; per: string; recommended?: boolean; support: string }> = {
  free: { label: "Free", price: "$0", per: "/month", support: "Community support" },
  studio: { label: "Studio", price: "$49", per: "/month", recommended: true, support: "Email support" },
  enterprise: { label: "Enterprise", price: "Custom", per: "", support: "Priority / dedicated support" },
};

function bulletsFor(plan: Plan, limits: PlanLimits): string[] {
  return [
    `${limits.max_tables === null ? "Unlimited" : limits.max_tables} saved loot table${limits.max_tables === 1 ? "" : "s"}`,
    `${limits.max_pulls.toLocaleString()} pulls per simulation`,
    limits.export ? "Compliance report export" : "No report export",
    limits.full_history ? "Full audit history per table" : "Last audit run only",
    PLAN_META[plan].support,
    ...(plan === "enterprise" ? ["Multi-region compliance rule packs"] : []),
  ];
}

export const PricingContent: React.FC<{ currentPlan?: Plan }> = ({ currentPlan }) => {
  const [plans, setPlans] = useState<Record<Plan, PlanLimits> | null>(null);

  useEffect(() => {
    fetchPlans().then(setPlans);
  }, []);

  if (!plans) return <div className="text-ink-muted text-sm py-16 text-center">Loading...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
      {(Object.keys(PLAN_META) as Plan[]).map((plan) => {
        const meta = PLAN_META[plan];
        const isCurrent = currentPlan === plan;
        return (
          <Card
            key={plan}
            className={`p-7 flex flex-col relative ${meta.recommended ? "border-accent border-2 shadow-[0_8px_30px_-10px_rgba(0,113,227,0.35)]" : ""}`}
          >
            {meta.recommended && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-[10.5px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full">
                Recommended
              </span>
            )}
            <h3 className="text-[16px] font-semibold">{meta.label}</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-[32px] font-semibold tracking-tight">{meta.price}</span>
              <span className="text-[13px] text-ink-muted">{meta.per}</span>
            </div>
            <ul className="flex flex-col gap-2.5 mt-6 mb-7 flex-1">
              {bulletsFor(plan, plans[plan]).map((b) => (
                <li key={b} className="flex items-start gap-2 text-[13px] text-ink-muted">
                  <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  {b}
                </li>
              ))}
            </ul>
            {isCurrent ? (
              <Button variant="secondary" disabled>
                Current Plan
              </Button>
            ) : plan === "enterprise" ? (
              <Button variant="secondary" onClick={() => alert("Contact sales -- not wired up in this demo.")}>
                Contact Sales
              </Button>
            ) : (
              <Button
                variant={meta.recommended ? "primary" : "secondary"}
                onClick={() => alert("Upgrade flow isn't wired to real billing in this demo -- see README's Known Weaknesses.")}
              >
                {plan === "free" ? "Get Started" : "Upgrade"}
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export const PricingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    return (
      <AppShell>
        <div className="max-w-5xl mx-auto px-8 py-10">
          <h1 className="text-[26px] font-semibold tracking-tight mb-1">Plans</h1>
          <p className="text-[13.5px] text-ink-muted mb-8">Compare plans and see what's included.</p>
          <PricingContent currentPlan={user.plan} />
        </div>
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate("/")}>
          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center">
            <Boxes className="w-4.5 h-4.5" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Loot Auditor</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/login" className="text-[14px] text-ink-muted hover:text-ink px-3 py-2">
            Log in
          </Link>
          <Link to="/signup">
            <Button className="!px-4 !py-2">Sign Up Free</Button>
          </Link>
        </nav>
      </header>
      <div className="text-center px-6 pt-8 pb-14">
        <h1 className="text-[38px] font-semibold tracking-tight">Simple, usage-based pricing</h1>
        <p className="text-[15px] text-ink-muted mt-3">Start free. Upgrade when your audits outgrow it.</p>
      </div>
      <div className="px-6 pb-24">
        <PricingContent />
      </div>
    </div>
  );
};
