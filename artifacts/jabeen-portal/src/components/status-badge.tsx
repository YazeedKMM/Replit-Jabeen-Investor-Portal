import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// ── Status vocabulary ───────────────────────────────────────────────────────
// Chart slices follow the DESIGN.md chart-token policy (chart-1 = primary,
// chart-3 = accent, chart-4 = success, chart-5 = warning); the badge tints
// reuse the same semantic tokens so tables and charts read as one vocabulary.
export type DerivedStatus = "on-track" | "delayed" | "stalled" | "complete";

export const STATUS_ORDER: DerivedStatus[] = ["on-track", "delayed", "stalled", "complete"];

export const STATUS_META: Record<DerivedStatus, { chart: string; dot: string; tint: string }> = {
  "on-track": { chart: "var(--chart-1)", dot: "bg-primary", tint: "bg-primary/10" },
  delayed: { chart: "var(--chart-5)", dot: "bg-warning", tint: "bg-warning/15" },
  stalled: { chart: "var(--chart-3)", dot: "bg-accent", tint: "bg-accent/10" },
  complete: { chart: "var(--chart-4)", dot: "bg-success", tint: "bg-success/15" },
};

/** Tinted status badge — tinted fill + the mode's ink color, per DESIGN.md. */
export function StatusBadge({ status }: { status: DerivedStatus }) {
  const { t } = useTranslation();
  const meta = STATUS_META[status] ?? STATUS_META["on-track"];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium text-foreground",
        meta.tint,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
      {t(`status.${status}`)}
    </span>
  );
}
