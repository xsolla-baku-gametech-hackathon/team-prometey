import React from "react";

type BadgeTone = "green" | "yellow" | "red" | "neutral" | "accent";

const SOFT_TONE_CLASSES: Record<BadgeTone, string> = {
  green: "bg-success-soft text-success",
  yellow: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
  neutral: "bg-bg text-ink-muted border border-line",
  accent: "bg-accent-soft text-accent",
};

// Solid, filled pills (white text) -- used where a status needs to read at
// a glance in a dense data table, distinct from the softer tinted pills
// used for section-level flags elsewhere.
const SOLID_TONE_CLASSES: Record<BadgeTone, string> = {
  green: "bg-success text-white",
  yellow: "bg-warning text-white",
  red: "bg-danger text-white",
  neutral: "bg-ink-muted text-white",
  accent: "bg-accent text-white",
};

export const Badge: React.FC<{ tone?: BadgeTone; solid?: boolean; children: React.ReactNode; className?: string }> = ({
  tone = "neutral",
  solid = false,
  children,
  className = "",
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] ${
        solid ? SOLID_TONE_CLASSES[tone] : SOFT_TONE_CLASSES[tone]
      } ${className}`}
    >
      {children}
    </span>
  );
};

/** A small colored dot, for the dashboard's card-grid status indicator. */
export const StatusDot: React.FC<{ tone: BadgeTone }> = ({ tone }) => {
  const dotColor: Record<BadgeTone, string> = {
    green: "bg-success",
    yellow: "bg-warning",
    red: "bg-danger",
    neutral: "bg-ink-muted",
    accent: "bg-accent",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${dotColor[tone]}`} />;
};
