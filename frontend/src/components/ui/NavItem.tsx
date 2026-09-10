import React from "react";
import { NavLink } from "react-router-dom";

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  end?: boolean;
}

export const NavItem: React.FC<NavItemProps> = ({ to, icon, children, end }) => {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-[14px] font-medium transition-colors ${
          isActive ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-bg hover:text-ink"
        }`
      }
    >
      <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0">{icon}</span>
      {children}
    </NavLink>
  );
};
