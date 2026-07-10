import { Fragment } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useListProjects, useGetProject,
  getListProjectsQueryKey, getGetProjectQueryKey,
} from "@workspace/api-client-react";
import type { ProjectSummary, Stage } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { StatusBadge, type DerivedStatus } from "@/components/status-badge";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertCircle, AlertTriangle, ArrowRight, Check, Clock, FolderOpen, Route,
} from "lucide-react";

// ── Stage journey rail ───────────────────────────────────────────────────────

/** Circular step marker: completed = filled + check, current = ringed, upcoming = muted. */
function StageMarker({ done, current }: { done: boolean; current: boolean }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
        done
          ? "border-primary bg-primary text-primary-foreground"
          : current
            ? "border-primary bg-card text-primary"
            : "border-border bg-muted text-muted-foreground",
        current && "ring-2 ring-ring ring-offset-2 ring-offset-card",
      )}
    >
      {done
        ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
        : <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
    </span>
  );
}

/**
 * The full pipeline as a connected horizontal rail. Data-driven — renders however
 * many stages the assigned template has. Flex row, so it mirrors automatically
 * in RTL; connectors are plain lines (direction-neutral, nothing to flip).
 */
function StageRail({ stages, currentIndex }: { stages: Stage[]; currentIndex: number }) {
  const { t } = useTranslation();
  return (
    <ol className="flex" aria-label={t("investor.pipeline.railLabel")}>
      {stages.map((stage, i) => {
        const done =
          currentIndex !== -1 &&
          (i < currentIndex || (i === currentIndex && stage.category === "complete"));
        const current = i === currentIndex;
        const reached = currentIndex !== -1 && i <= currentIndex;
        const nextReached = currentIndex !== -1 && i + 1 <= currentIndex;
        return (
          <li
            key={stage.id}
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
            title={stage.name}
            aria-current={current ? "step" : undefined}
          >
            <div className="flex w-full items-center">
              <span
                className={cn("h-px flex-1", i === 0 ? "bg-transparent" : reached ? "bg-primary/50" : "bg-border")}
                aria-hidden="true"
              />
              <StageMarker done={done} current={current} />
              <span
                className={cn("h-px flex-1", i === stages.length - 1 ? "bg-transparent" : nextReached ? "bg-primary/50" : "bg-border")}
                aria-hidden="true"
              />
            </div>
            <span
              className={cn(
                "hidden w-full px-1 text-center text-xs leading-tight sm:line-clamp-2",
                current ? "font-medium text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/70",
              )}
            >
              {stage.name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Loading placeholder mirroring the rail's silhouette (markers + connectors + caption). */
function RailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Fragment key={i}>
            {i > 0 && <Skeleton className="h-px flex-1" />}
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          </Fragment>
        ))}
      </div>
      <Skeleton className="h-4 w-64 max-w-full" />
    </div>
  );
}

// ── Per-project pipeline block ───────────────────────────────────────────────

/**
 * One full-width block per project. The header renders instantly from the list
 * summary; the stage rail needs `pipeline.stages`, which only the detail
 * endpoint returns, so each block fetches its own detail (investors hold 1–3
 * projects, so the fan-out is tiny).
 */
function ProjectPipelineBlock({ summary }: { summary: ProjectSummary }) {
  const { t } = useTranslation();
  const { data: detail, isLoading, isError, refetch } = useGetProject(summary.id, {
    query: { queryKey: getGetProjectQueryKey(summary.id) },
  });

  const stages = detail?.pipeline?.stages
    ? [...detail.pipeline.stages].sort((a, b) => a.orderIndex - b.orderIndex)
    : [];
  const current = detail?.currentStage ?? summary.currentStage;
  const currentIndex = current ? stages.findIndex((s) => s.id === current.id) : -1;
  const cityCategory = [summary.city?.shortName ?? summary.city?.name, summary.category?.name]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-xl border border-card-border bg-card">
      {/* ── Header row: identity, status, progress, workspace link ── */}
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="min-w-0 text-xl font-semibold leading-tight text-foreground">
                <Link
                  href={`/projects/${summary.id}`}
                  title={summary.name}
                  className="transition-colors duration-150 hover:text-primary hover:underline motion-reduce:transition-none"
                >
                  {summary.name}
                </Link>
              </h2>
              <StatusBadge status={summary.derivedStatus as DerivedStatus} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t("investor.pipeline.agreement")}{" "}
                <span className="font-mono text-foreground" dir="ltr">{summary.agreementNumber}</span>
              </span>
              <span>
                {t("investor.pipeline.plot")}{" "}
                <span className="font-mono text-foreground" dir="ltr">{summary.plotNumber || t("investor.plotTbd")}</span>
              </span>
              {cityCategory && <span>{cityCategory}</span>}
              <span>
                {summary.lastUpdateAt
                  ? t("investor.updatedAt", { date: fmtDate(summary.lastUpdateAt) })
                  : t("investor.updatedNever")}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-5">
            <div className="w-40 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{t("investor.pipeline.progress")}</span>
                <span className="font-medium tabular-nums text-foreground" dir="ltr">
                  {summary.constructionPct}%
                </span>
              </div>
              <Progress
                value={summary.constructionPct}
                className="h-1.5"
                aria-label={t("investor.pipeline.progress")}
              />
            </div>
            <Link
              href={`/projects/${summary.id}`}
              className="flex items-center gap-1 text-sm font-medium text-primary transition-colors duration-150 hover:underline motion-reduce:transition-none"
            >
              {t("investor.pipeline.viewProject")}
              <ArrowRight className="h-4 w-4 rtl-flip" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {summary.attentionFlag && (
          <p className="flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            {t("investor.attentionMessage")}
          </p>
        )}
      </div>

      {/* ── Stage journey rail ── */}
      <div className="border-t border-card-border px-5 py-5 sm:px-6">
        {isLoading ? (
          <RailSkeleton />
        ) : isError ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span>{t("investor.pipeline.detailError")}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              {t("investor.pipeline.retry")}
            </Button>
          </div>
        ) : !detail?.pipeline ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Route className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("investor.pipeline.noPipeline")}
          </p>
        ) : (
          <div className="space-y-4">
            <StageRail stages={stages} currentIndex={currentIndex} />
            {current && currentIndex !== -1 ? (
              <p className="text-sm">
                <span className="text-muted-foreground">{t("investor.pipeline.currentStageLabel")}: </span>
                <span className="font-medium text-foreground">{current.name}</span>
                <span className="text-muted-foreground">
                  {" — "}
                  {t("investor.pipeline.stageOf", { index: currentIndex + 1, total: stages.length })}
                  {current.progressBaseline > 0 &&
                    ` · ${t("investor.pipeline.baselineNote", { pct: current.progressBaseline })}`}
                </span>
                {current.description && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{current.description}</span>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("investor.pipeline.notStarted")}</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ── Page-level states ────────────────────────────────────────────────────────

/** Loading state mirroring the final layout: stacked pipeline blocks. */
function PageSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-card-border bg-card">
          <div className="space-y-3 p-5 sm:p-6">
            <Skeleton className="h-6 w-64 max-w-full" />
            <Skeleton className="h-3.5 w-96 max-w-full" />
          </div>
          <div className="border-t border-card-border px-5 py-5 sm:px-6">
            <RailSkeleton />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function MyProjectsPage() {
  const { user, checkActivationStatus } = useAuth();
  const { t } = useTranslation();
  const { data: projects, isLoading, isError, refetch } = useListProjects(
    undefined,
    { query: { queryKey: getListProjectsQueryKey(), enabled: user?.status === "active" } },
  );

  if (user?.status === "pending") {
    return (
      <div className="space-y-8">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">{t("investor.pipeline.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("investor.pipeline.subtitle")}</p>
        </div>
        <section className="rounded-xl border border-card-border bg-card px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning/15">
            <Clock className="h-7 w-7 text-warning" aria-hidden="true" />
          </span>
          <h2 className="mt-5 font-display text-2xl font-semibold text-foreground">{t("investor.pendingTitle")}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {t("investor.pendingDesc")}
          </p>
          <div className="mx-auto mt-6 max-w-lg rounded-lg bg-warning/15 px-4 py-3 text-start text-sm">
            <p className="font-medium text-foreground">{t("investor.pendingNextStepsTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("investor.pendingNextStepsDesc")}</p>
          </div>
          <Button variant="outline" className="mt-6" onClick={checkActivationStatus}>
            {t("investor.pendingActivateButton")}
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("investor.pipeline.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("investor.pipeline.subtitle")}</p>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : isError ? (
        <section className="rounded-xl border border-card-border bg-card px-6 py-14 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">{t("investor.pipeline.listError")}</p>
          <Button variant="outline" className="mt-5" onClick={() => refetch()}>
            {t("investor.pipeline.retry")}
          </Button>
        </section>
      ) : !projects?.length ? (
        /* ── Empty portfolio: teaches what the portal does (investors can't create) ── */
        <section className="rounded-xl border border-card-border bg-card px-6 py-16 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-foreground">{t("investor.emptyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t("investor.emptyDesc")}</p>
        </section>
      ) : (
        <div className="space-y-6">
          {projects.map((project) => (
            <ProjectPipelineBlock key={project.id} summary={project} />
          ))}
        </div>
      )}
    </div>
  );
}
