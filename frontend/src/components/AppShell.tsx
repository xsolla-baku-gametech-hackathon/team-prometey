import React from "react";
import { LayoutGrid, CreditCard, Settings as SettingsIcon, LogOut, Boxes, ShieldCheck } from "lucide-react";
import { NavItem } from "./ui/NavItem";
import { useAuth } from "../lib/auth";
import { useNavigate } from "react-router-dom";

/** Settings-page-style shell: left-hand nav list, right-hand content -- used across every authenticated page. */
export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-bg">
      <aside className="w-[240px] shrink-0 border-r border-line/70 bg-material-thin backdrop-blur-[30px] backdrop-saturate-[180%] flex flex-col p-4">
        <div className="flex items-center gap-2.5 px-2 py-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center shrink-0">
            <Boxes className="w-4.5 h-4.5" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">TrueLoot</span>
        </div>

        <nav className="flex flex-col gap-1">
          <NavItem to="/dashboard" icon={<LayoutGrid className="w-[18px] h-[18px]" />}>
            Dashboard
          </NavItem>
          <NavItem to="/pricing" icon={<CreditCard className="w-[18px] h-[18px]" />}>
            Pricing
          </NavItem>
          <NavItem to="/settings" icon={<SettingsIcon className="w-[18px] h-[18px]" />}>
            Settings
          </NavItem>
          {user?.is_admin && (
            <NavItem to="/admin" icon={<ShieldCheck className="w-[18px] h-[18px]" />}>
              Admin
            </NavItem>
          )}
        </nav>

        <div className="mt-auto pt-4 border-t border-line">
          <div className="px-2 pb-2">
            <div className="text-[13px] font-medium text-ink truncate">{user?.email}</div>
            <div className="text-[11px] text-ink-muted uppercase tracking-wide">{user?.plan} plan</div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-[14px] font-medium text-ink-muted hover:bg-bg hover:text-ink transition-colors cursor-pointer"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
};
