import React from "react";
import { Boxes, Sparkles, Activity } from "lucide-react";

interface HeaderProps {
  status: string;
  isError?: boolean;
  isLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ status, isError, isLoading }) => {
  return (
    <header className="h-[52px] bg-[#13161c] border-b border-[#293040] flex items-center justify-between px-4 z-10 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Boxes className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-white tracking-tight">MeshDiff</span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            GameTech Studio
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#202632] border border-[#293040] text-gray-300">
          <div
            className={`w-2 h-2 rounded-full ${
              isError
                ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                : isLoading
                ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse"
                : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            }`}
          />
          <span className="font-medium text-gray-300">{status}</span>
        </div>
      </div>
    </header>
  );
};
