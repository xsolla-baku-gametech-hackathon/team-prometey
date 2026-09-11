import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

// "Primary" (solid fill), "Bordered" (clear fill + 1px tint border), and
// "Plain" (text-only) per the Apple Glass button spec -- kept as
// secondary/ghost prop names so every call site is unaffected.
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover disabled:opacity-40",
  secondary: "bg-transparent text-accent border border-accent hover:bg-accent-soft disabled:opacity-40",
  ghost: "bg-transparent text-accent hover:bg-accent-soft disabled:opacity-40",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white disabled:opacity-40",
};

export const Button: React.FC<ButtonProps> = ({ variant = "primary", className = "", children, ...rest }) => {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[14.5px] font-semibold
        transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};
