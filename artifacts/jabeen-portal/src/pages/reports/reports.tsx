import { useState, useMemo, useEffect } from "react";
import {
  useGetReportsDistribution, useGetReportsStageConversion, useGetReportsActivity, useListTemplates,
  getGetReportsDistributionQueryKey, getGetReportsStageConversionQueryKey,
  getGetReportsActivityQueryKey, getListTemplatesQueryKey,
} from "@workspace/api-client-react";
import { keepPreviousData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from "recharts";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

// ── Building blocks ─────────────────────────────────────────────────────────

/** Quiet bordered panel; `action` renders a control (select) at the inline-end of the header. */
function Panel({ title, action, className, children }: {
  title: string; action?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-card-border bg-card p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Per-section query-error state with retry, scoped inside a Panel. */
function PanelError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{t("reports.error")}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>{t("reports.retry")}</Button>
    </div>
  );
}

function PanelEmpty() {
  const { t } = useTranslation();
  return <p className="py-10 text-center text-sm text-muted-foreground">{t("reports.empty")}</p>;
}

/** Duck-typed check for the ApiError thrown by the client (404 = no default template). */
function isNotFound(error: unknown): boolean {
  return !!error && typeof error === "object" && "status" in error
    && (error as { status?: unknown }).status === 404;
}

// ── Section 1: Distribution ─────────────────────────────────────────────────

function DistributionSection() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useGetReportsDistribution({
    query: { queryKey: getGetReportsDistributionQueryKey() },
  });

  // byStage spans all templates: group by templateId, then pipeline order.
  const multiTemplate = useMemo(
    () => new Set((data?.byStage ?? []).map((s) => s.templateId)).size > 1,
    [data?.byStage],
  );
  const stageData = useMemo(() => {
    const rows = [...(data?.byStage ?? [])]
      .sort((a, b) => a.templateId - b.templateId || a.orderIndex - b.orderIndex)
      .map((s) => ({
        id: `stage-${s.stageId}`,
        name: multiTemplate
          ? `${s.stageName} (${s.templateName} v${s.templateVersion}${s.templateArchived ? `, ${t("reports.distribution.archived")}` : ""})`
          : s.stageName,
        count: s.count,
        fill: "var(--chart-1)",
      }));
    if (data) {
      rows.push({
        id: "unstaged",
        name: t("reports.distribution.unstaged"),
        count: data.unstaged,
        fill: "var(--chart-3)",
      });
    }
    return rows;
  }, [data, multiTemplate, t]);

  const cityData = useMemo(
    () => (data?.byCity ?? []).map((c) => ({ name: c.city, count: c.count })),
    [data?.byCity],
  );
  const categoryData = useMemo(
    () => (data?.byCategory ?? []).map((c) => ({ name: c.category, count: c.count })),
    [data?.byCategory],
  );
  const countConfig = useMemo(
    () => ({ count: { label: t("dashboard.charts.count") } }) satisfies ChartConfig,
    [t],
  );

  return (
    <Panel title={t("reports.distribution.title")}>
      {isError ? (
        <PanelError onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-16" />
          </div>
          <Skeleton className="h-44 w-full" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        </div>
      ) : data.total === 0 ? (
        <PanelEmpty />
      ) : (
        <div className="space-y-6">
          {/* Quiet total line */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("reports.distribution.total")}</p>
            <p className="font-display text-3xl font-semibold tabular-nums text-foreground">{data.total}</p>
          </div>

          {/* By stage — full-width, height tracks row count */}
          <div>
            <h3 className="text-sm font-medium text-foreground">{t("reports.distribution.byStage")}</h3>
            {/* Charts render into fixed-coordinate SVG; containers pinned LTR (registered in docs/rtl.md). */}
            <ChartContainer
              dir="ltr"
              config={countConfig}
              className="mt-3 aspect-auto w-full"
              style={{ height: stageData.length * 34 + 12 }}
            >
              <BarChart accessibilityLayer data={stageData} layout="vertical" margin={{ top: 4, bottom: 4, left: 0, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={140} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="count" name={t("dashboard.charts.count")} radius={4} barSize={18} isAnimationActive={false}>
                  {stageData.map((d) => (
                    <Cell key={d.id} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>

          {/* By city / by category */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">{t("reports.distribution.byCity")}</h3>
              <ChartContainer dir="ltr" config={countConfig} className="mt-3 aspect-auto h-[200px] w-full">
                <BarChart accessibilityLayer data={cityData} layout="vertical" margin={{ top: 4, bottom: 4, left: 0, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar dataKey="count" name={t("dashboard.charts.count")} fill="var(--chart-2)" radius={4} barSize={18} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">{t("reports.distribution.byCategory")}</h3>
              <ChartContainer dir="ltr" config={countConfig} className="mt-3 aspect-auto h-[200px] w-full">
                <BarChart accessibilityLayer data={categoryData} layout="vertical" margin={{ top: 4, bottom: 4, left: 0, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar dataKey="count" name={t("dashboard.charts.count")} fill="var(--chart-1)" radius={4} barSize={18} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── Section 2: Stage conversion funnel ──────────────────────────────────────

function ConversionSection() {
  const { t } = useTranslation();

  const templateParams = {};
  const { data: templates, isLoading: templatesLoading } = useListTemplates(
    templateParams,
    { query: { queryKey: getListTemplatesQueryKey(templateParams) } },
  );

  const [templateId, setTemplateId] = useState<number | undefined>(undefined);
  // Once templates load, pass the default template's id explicitly.
  useEffect(() => {
    if (templateId == null && templates?.length) {
      const initial = templates.find((tpl) => tpl.isDefault) ?? templates[0];
      setTemplateId(initial.id);
    }
  }, [templates, templateId]);

  const conversionParams = templateId != null ? { templateId } : {};
  const {
    data: conversion, isLoading, isError, error, refetch,
  } = useGetReportsStageConversion(conversionParams, {
    query: {
      queryKey: getGetReportsStageConversionQueryKey(conversionParams),
      enabled: templateId != null,
      placeholderData: keepPreviousData,
    },
  });

  const stages = useMemo(
    () => [...(conversion?.stages ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
    [conversion?.stages],
  );

  const noTemplates = !templatesLoading && (templates?.length ?? 0) === 0;

  return (
    <Panel
      title={t("reports.conversion.title")}
      action={
        !noTemplates && (templates?.length ?? 0) > 0 ? (
          <Select
            value={templateId != null ? String(templateId) : ""}
            onValueChange={(v) => setTemplateId(Number(v))}
          >
            <SelectTrigger className="w-full sm:w-64" aria-label={t("reports.conversion.template")}>
              <SelectValue placeholder={t("reports.conversion.template")} />
            </SelectTrigger>
            <SelectContent>
              {templates?.map((tpl) => (
                <SelectItem key={tpl.id} value={String(tpl.id)}>
                  {tpl.name}
                  {tpl.versionNumber > 1 && (
                    <span className="ms-1.5 text-xs text-muted-foreground" dir="ltr">v{tpl.versionNumber}</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined
      }
    >
      {noTemplates || (isError && isNotFound(error)) ? (
        <p className="py-6 text-sm text-muted-foreground">{t("reports.conversion.noDefault")}</p>
      ) : isError ? (
        <PanelError onRetry={() => refetch()} />
      ) : templatesLoading || isLoading || !conversion ? (
        <div className="space-y-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : stages.length === 0 ? (
        <PanelEmpty />
      ) : (
        <ol className="space-y-5">
          {stages.map((s) => (
            <li key={s.stageId} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{s.name}</p>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
                  {t("reports.conversion.atStage")} · {s.atStage}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {/* Funnel fill uses logical inline-size so it grows from the inline-start in both directions. */}
                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      inlineSize: `${s.reachedPct}%`,
                      minInlineSize: s.reached > 0 ? "0.5rem" : "0",
                    }}
                  />
                </div>
                <span className="w-12 shrink-0 text-end text-sm font-medium tabular-nums text-foreground" dir="ltr">
                  {s.reachedPct}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("reports.conversion.reached")} · {s.reached}{" "}
                {t("reports.conversion.ofProjects", { count: conversion.totalProjects })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// ── Section 3: Activity over time ───────────────────────────────────────────

const MONTH_OPTIONS = [3, 6, 12, 24];

const ACTIVITY_SERIES = [
  { key: "projectsCreated", color: "var(--chart-1)" },
  { key: "updatesSubmitted", color: "var(--chart-2)" },
  { key: "updatesApproved", color: "var(--chart-4)" },
] as const;

function ActivitySection() {
  const { t } = useTranslation();
  const [months, setMonths] = useState(6);

  const activityParams = { months };
  const { data, isLoading, isError, refetch } = useGetReportsActivity(activityParams, {
    query: {
      queryKey: getGetReportsActivityQueryKey(activityParams),
      placeholderData: keepPreviousData,
    },
  });

  const activityConfig = useMemo(
    () => Object.fromEntries(
      ACTIVITY_SERIES.map((s) => [s.key, { label: t(`reports.activity.${s.key}`), color: s.color }]),
    ) satisfies ChartConfig,
    [t],
  );

  return (
    <Panel
      title={t("reports.activity.title")}
      action={
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="w-36" aria-label={t("reports.activity.range")}>
            <SelectValue placeholder={t("reports.activity.range")} />
          </SelectTrigger>
          <SelectContent>
            {MONTH_OPTIONS.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {t("reports.activity.months", { count: m })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {isError ? (
        <PanelError onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-[260px] w-full" />
          <div className="flex gap-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      ) : data.months.length === 0 ? (
        <PanelEmpty />
      ) : (
        <>
          <ChartContainer dir="ltr" config={activityConfig} className="aspect-auto h-[260px] w-full">
            <LineChart accessibilityLayer data={data.months} margin={{ top: 8, bottom: 4, left: 0, right: 16 }}>
              <CartesianGrid vertical={false} />
              {/* Month labels stay "YYYY-MM" (LTR-safe in both languages; container is already dir="ltr"). */}
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickMargin={8} />
              <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              {ACTIVITY_SERIES.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={t(`reports.activity.${s.key}`)}
                  type="monotone"
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
          {/* HTML legend (mirrors normally in RTL) */}
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
            {ACTIVITY_SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} aria-hidden="true" />
                <span className="text-muted-foreground">{t(`reports.activity.${s.key}`)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

// ── Main Reports Page ───────────────────────────────────────────────────────

export default function ReportsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("reports.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("reports.subtitle")}</p>
      </div>

      <DistributionSection />
      <ConversionSection />
      <ActivitySection />
    </div>
  );
}
