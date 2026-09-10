import React from "react";

type BadgeTone = "green" | "yellow" | "red" | "neutral" | "accent";

const TONE_CLASSES: Record<BadgeTone, string> = {
  green: "bg-success-soft text-success",
  yellow: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
  neutral: "bg-bg text-ink-muted border border-line",
  accent: "bg-accent-soft text-accent",
};

export const Badge: React.FC<{ tone?: BadgeTone; children: React.ReactNode; className?: string }> = ({
  tone = "neutral",
  children,
  className = "",
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${TONE_CLASSES[tone]} ${className}`}
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
