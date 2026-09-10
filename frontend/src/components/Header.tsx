import React from "react";
import { Boxes } from "lucide-react";

interface HeaderProps {
  status: string;
  isError?: boolean;
  isLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ status, isError, isLoading }) => {
  return (
    <header className="h-[60px] bg-white border-b border-[#e2e8f0] flex items-center justify-between px-6 z-10 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center">
          <Boxes className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-[#0f172a] tracking-tight">MeshDiff</span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
            GameTech Studio
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#f8fafc] border border-[#e2e8f0] text-[#334155]">
          <div
            className={`w-2 h-2 rounded-full ${
              isError ? "bg-red-500" : isLoading ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
            }`}
          />
          <span className="font-medium">{status}</span>
        </div>
      </div>
    </header>
  );
};
