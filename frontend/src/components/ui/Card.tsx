import React from "react";

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = "", children, ...rest }) => {
  return (
    <div
      className={`bg-surface border border-line rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};
