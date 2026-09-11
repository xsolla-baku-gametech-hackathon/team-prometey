import React, { useEffect } from "react";
import { FileSpreadsheet, FileText, Braces, X } from "lucide-react";
import type { AuditRunOut, LootTable } from "../types";
import { downloadComplianceReportCsv, downloadComplianceReportJson, openPrintableComplianceReport } from "../lib/report";

interface ExportOption {
  key: "csv" | "pdf" | "json";
  icon: React.ElementType;
  label: string;
  description: string;
}

const OPTIONS: ExportOption[] = [
  { key: "csv", icon: FileSpreadsheet, label: "CSV", description: "Opens cleanly in Excel or Google Sheets -- one row per item, full stats." },
  { key: "pdf", icon: FileText, label: "Printable PDF", description: "Formatted report in a new tab -- use your browser's Save as PDF." },
  { key: "json", icon: Braces, label: "JSON", description: "Raw audit data -- the full table config and result, for a second tool or a regulator's own pipeline." },
];

/**
 * Report-export sheet: a translucent material surface over a blurred
 * backdrop, per the Apple Glass "Sheets / modals" spec (--material-regular
 * over backdrop-filter blur(30px), rounded corners, no drop shadow on top
 * of the material). Centered rather than bottom-anchored -- there's no
 * touch-device detent model to honor on a desktop web dashboard.
 */
export const ExportReportModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  table: LootTable;
  result: AuditRunOut;
}> = ({ isOpen, onClose, table, result }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleExport = (key: ExportOption["key"]) => {
    if (key === "csv") downloadComplianceReportCsv(table, result);
    if (key === "pdf") openPrintableComplianceReport(table, result);
    if (key === "json") downloadComplianceReportJson(table, result);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-report-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl bg-material-regular backdrop-blur-[30px] backdrop-saturate-[180%]
          shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <h2 id="export-report-title" className="text-[17px] font-semibold text-ink">
            Export Report
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-tertiary hover:text-ink transition-colors cursor-pointer p-1 -m-1"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex flex-col gap-1 px-3 pb-3">
          {OPTIONS.map(({ key, icon: Icon, label, description }) => (
            <button
              key={key}
              onClick={() => handleExport(key)}
              className="flex items-start gap-3 rounded-[12px] px-3 py-3 text-left hover:bg-black/[0.04] transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="text-[14.5px] font-medium text-ink">{label}</div>
                <p className="text-[12.5px] text-ink-muted leading-snug mt-0.5">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
