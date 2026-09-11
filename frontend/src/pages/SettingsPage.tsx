import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { changePassword } from "../lib/api";
import { useAuth } from "../lib/auth";

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    setIsSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(true);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setIsSaving(false);
    }
  };

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

        <Card className="p-7 mb-5">
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

        <Card className="p-7">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-4">Security</div>

          <form onSubmit={handleChangePassword} className="flex flex-col gap-4 mb-6">
            <Input
              type="password"
              label="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Input
              type="password"
              label="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <Input
              type="password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            {passwordError && <div className="text-[13px] text-danger bg-danger-soft rounded-md px-3 py-2">{passwordError}</div>}
            {passwordSuccess && (
              <div className="text-[13px] text-success bg-success-soft rounded-md px-3 py-2">Password updated.</div>
            )}
            <div>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Change Password"}
              </Button>
            </div>
          </form>

          <div className="pt-5 border-t border-line">
            <Button
              variant="secondary"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Log out
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
};
