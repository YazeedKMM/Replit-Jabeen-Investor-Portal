import { useListProjects, getListProjectsQueryKey } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { DgaStatusTag, DgaTag, DgaLinearProgressBar, DgaInlineAlert, DgaButton } from "platformscode-new-react";
import { DgaContentCard } from "@/components/ui/dga-card";
import { Building2, MapPin, Calendar, ArrowRight, Clock } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { dgaStatusColor } from "@/lib/dga-status";

export default function MyProjectsPage() {
  const { user, checkActivationStatus } = useAuth();
  const { t } = useTranslation();
  const { data: projects, isLoading } = useListProjects(
    undefined,
    { query: { queryKey: getListProjectsQueryKey(), enabled: user?.status === "active" } }
  );

  if (user?.status === "pending") {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("investor.pageTitle")}</h1>
          <p className="text-muted-foreground text-lg">{t("investor.pageSubtitle")}</p>
        </div>
        <DgaContentCard className="flex flex-col items-center justify-center py-10 text-center gap-6">
          <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-5">
            <Clock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-2xl font-bold text-foreground">{t("investor.pendingTitle")}</h3>
            <p className="text-muted-foreground text-base leading-relaxed">
              {t("investor.pendingDesc")}
            </p>
          </div>
          <div className="w-full max-w-md text-start">
            <DgaInlineAlert
              type="warning"
              colored
              leadText={t("investor.pendingNextStepsTitle")}
              helperText={t("investor.pendingNextStepsDesc")}
            />
          </div>
          <DgaButton
            variant="secondary"
            label={t("investor.pendingActivateButton")}
            onOnClick={checkActivationStatus}
          />
        </DgaContentCard>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("investor.pageTitle")}</h1>
        <p className="text-muted-foreground text-lg">{t("investor.pageSubtitle")}</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border border-border bg-muted/20" />
          ))}
        </div>
      ) : !projects?.length ? (
        <DgaContentCard className="flex flex-col items-center justify-center h-64 text-center gap-3">
          <Building2 className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-xl font-semibold text-foreground">{t("investor.emptyTitle")}</h3>
          <p className="text-muted-foreground max-w-sm">{t("investor.emptyDesc")}</p>
        </DgaContentCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <DgaContentCard key={project.id} className="flex flex-col gap-5">
              {/* Header: name + agreement no. + status */}
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1 min-w-0">
                  <h2 className="text-xl font-semibold leading-tight line-clamp-2 text-foreground" title={project.name}>
                    {project.name}
                  </h2>
                  <p className="font-medium text-sm text-primary/80">{project.agreementNumber}</p>
                </div>
                <div className="shrink-0">
                  <DgaStatusTag
                    color={dgaStatusColor(project.derivedStatus)}
                    status="subtle"
                    size="sm"
                    label={t(`status.${project.derivedStatus}`)}
                  />
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                <div className="space-y-1.5 col-span-2">
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">{t("investor.labelCityCategory")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {project.city && (
                      <DgaTag variant="info" size="sm" label={project.city.shortName ?? project.city.name} />
                    )}
                    {project.category && (
                      <DgaTag variant="neutral" size="sm" outlined label={project.category.name} />
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">{t("investor.labelPlot")}</span>
                  <p className="font-medium truncate flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {project.plotNumber || t("investor.plotTbd")}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">{t("investor.labelCurrentStage")}</span>
                  <p className="font-medium truncate">{project.currentStage?.name || t("investor.stageInitializing")}</p>
                </div>
              </div>

              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>{t("investor.labelProgress")}</span>
                  <span>{project.constructionPct}%</span>
                </div>
                <DgaLinearProgressBar
                  style={{ display: "block", width: "100%" }}
                  percentage={project.constructionPct}
                  progressStyle="primary"
                  size="small"
                  showLabel={false}
                  showHelperText={false}
                />
              </div>

              {project.attentionFlag && (
                <DgaInlineAlert type="warning" colored leadText={t("investor.attentionMessage")} />
              )}

              {/* Footer */}
              <div className="mt-auto pt-4 border-t border-border flex justify-between items-center">
                <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{project.lastUpdateAt ? t("investor.updatedAt", { date: fmtDate(project.lastUpdateAt) }) : t("investor.updatedNever")}</span>
                </div>
                <Link href={`/projects/${project.id}`} className="text-sm font-semibold text-primary flex items-center gap-1 hover:underline">
                  {t("investor.viewDetails")} <ArrowRight className="h-4 w-4 rtl-flip" />
                </Link>
              </div>
            </DgaContentCard>
          ))}
        </div>
      )}
    </div>
  );
}
