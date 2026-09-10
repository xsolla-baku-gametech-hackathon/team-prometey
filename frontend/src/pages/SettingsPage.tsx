import React from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { useAuth } from "../lib/auth";

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="text-[26px] font-semibold tracking-tight mb-8">Settings</h1>

        <Card className="p-7 mb-5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-4">Account</div>
          <div className="flex items-center justify-between py-2.5 border-b border-line">
            <span className="text-[13.5px] text-ink-muted">Email</span>
            <span className="text-[13.5px] font-medium">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-[13.5px] text-ink-muted">User ID</span>
            <span className="text-[12px] font-mono text-ink-muted">{user?.id}</span>
          </div>
        </Card>

        <Card className="p-7">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-4">Plan</div>
          <div className="flex items-center justify-between">
            <div>
              <Badge tone="accent">{user?.plan}</Badge>
              <p className="text-[12.5px] text-ink-muted mt-2">
                Manage your plan and see what's included on the{" "}
                <Link to="/pricing" className="text-accent hover:underline">
                  pricing page
                </Link>
                .
              </p>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
};
