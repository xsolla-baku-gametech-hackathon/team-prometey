import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Input: React.FC<InputProps> = ({ label, hint, className = "", id, ...rest }) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-medium text-ink-muted">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-[10px] bg-bg px-[14px] py-[11px] text-[14px] text-ink
          outline-none transition-shadow focus:ring-4 focus:ring-accent/[0.18] placeholder:text-ink-tertiary ${className}`}
        {...rest}
      />
      {hint && <span className="text-[12px] text-ink-muted">{hint}</span>}
    </div>
  );
};

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }> = ({
  label,
  className = "",
  id,
  ...rest
}) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-medium text-ink-muted">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={`w-full rounded-[10px] bg-bg px-[14px] py-[11px] text-[13px] font-mono text-ink
          outline-none transition-shadow focus:ring-4 focus:ring-accent/[0.18] resize-y ${className}`}
        {...rest}
      />
    </div>
  );
};
