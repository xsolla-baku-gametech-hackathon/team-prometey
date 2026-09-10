import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover disabled:opacity-40",
  secondary: "bg-surface text-ink border border-line hover:bg-bg disabled:opacity-40",
  ghost: "bg-transparent text-ink-muted hover:text-ink hover:bg-bg disabled:opacity-40",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white disabled:opacity-40",
};

export const Button: React.FC<ButtonProps> = ({ variant = "primary", className = "", children, ...rest }) => {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-medium
        transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};
