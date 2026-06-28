import { useListTemplates, useDeleteTemplate, useArchiveTemplate } from "@workspace/api-client-react";
import { getListTemplatesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { DgaContentCard } from "@/components/ui/dga-card";
import { DgaBrandButton } from "@/components/ui/dga-brand-button";
import { DgaTag } from "platformscode-new-react";
import { Edit2, Trash2, GitMerge, Archive } from "lucide-react";
import { Link, useLocation } from "wouter";
import { fmtDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export default function TemplatesPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { data: templates, isLoading } = useListTemplates(
    { includeArchived: true },
    { query: { queryKey: getListTemplatesQueryKey({ includeArchived: true }) } }
  );
  const deleteMutation = useDeleteTemplate();
  const archiveMutation = useArchiveTemplate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
  };

  const handleDelete = async (id: number, name: string, assignedCount: number) => {
    if (assignedCount > 0) {
      if (!confirm(t("admin.templates.deleteInUseConfirm", { count: assignedCount }))) return;
      try {
        await archiveMutation.mutateAsync({ templateId: id });
        invalidate();
        toast({ title: t("admin.templates.toast.archived") });
      } catch {
        toast({ title: t("admin.templates.toast.error"), description: t("admin.templates.toast.archiveFailed"), variant: "destructive" });
      }
    } else {
      if (!confirm(t("admin.templates.deleteConfirm", { name }))) return;
      try {
        await deleteMutation.mutateAsync({ templateId: id });
        invalidate();
        toast({ title: t("admin.templates.toast.deleted") });
      } catch {
        toast({ title: t("admin.templates.toast.error"), description: t("admin.templates.toast.deleteFailed"), variant: "destructive" });
      }
    }
  };

  const handleArchive = async (id: number) => {
    if (!confirm(t("admin.templates.archiveConfirm"))) return;
    try {
      await archiveMutation.mutateAsync({ templateId: id });
      invalidate();
      toast({ title: t("admin.templates.toast.archived") });
    } catch {
      toast({ title: t("admin.templates.toast.error"), description: t("admin.templates.toast.archiveFailed"), variant: "destructive" });
    }
  };

  const activeTemplates = templates?.filter(t => !t.archivedAt) ?? [];
  const archivedTemplates = templates?.filter(t => !!t.archivedAt) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-start sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("admin.templates.title")}</h1>
          <p className="text-muted-foreground">{t("admin.templates.subtitle")}</p>
        </div>
        <DgaBrandButton label={t("admin.templates.newTemplate")} onOnClick={() => navigate("/templates/new")} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-48 animate-pulse rounded-2xl border border-border bg-muted/20" />)}
        </div>
      ) : !templates?.length ? (
        <DgaContentCard className="flex flex-col items-center justify-center h-64 text-center">
          <GitMerge className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold mb-2">{t("admin.templates.noTemplates")}</h3>
          <p className="text-muted-foreground max-w-sm mb-4">{t("admin.templates.noTemplatesDesc")}</p>
          <DgaBrandButton label={t("admin.templates.createTemplate")} onOnClick={() => navigate("/templates/new")} />
        </DgaContentCard>
      ) : (
        <>
          {activeTemplates.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("admin.templates.activeTemplates")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeTemplates.map(template => (
                  <TemplateCard key={template.id} template={template} onDelete={handleDelete} onArchive={handleArchive} />
                ))}
              </div>
            </div>
          )}

          {archivedTemplates.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-muted-foreground">{t("admin.templates.archivedTemplates")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-60">
                {archivedTemplates.map(template => (
                  <TemplateCard key={template.id} template={template} onDelete={handleDelete} onArchive={handleArchive} archived />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: {
    id: number;
    name: string;
    description?: string | null;
    isDefault: boolean;
    stageCount: number;
    versionNumber: number;
    parentTemplateId?: number | null;
    archivedAt?: string | null;
    assignedProjectCount?: number;
    createdAt: string;
  };
  onDelete: (id: number, name: string, assignedCount: number) => void;
  onArchive: (id: number) => void;
  archived?: boolean;
}

function TemplateCard({ template, onDelete, onArchive, archived = false }: TemplateCardProps) {
  const { t } = useTranslation();
  const assignedCount = template.assignedProjectCount ?? 0;
  const isAssigned = assignedCount > 0;

  return (
    <DgaContentCard className="flex flex-col h-full">
      <div className="flex justify-between items-start">
        <div className="space-y-1 pe-4">
          <h3 className="text-xl font-semibold leading-tight line-clamp-2 text-foreground">{template.name}</h3>
          <div className="flex flex-wrap gap-1.5">
            {template.isDefault && (
              <DgaTag variant="info" size="sm" label={t("admin.templates.defaultBadge")} />
            )}
            <DgaTag variant="neutral" size="sm" outlined label={`v${template.versionNumber}`} />
            {archived && (
              <DgaTag variant="neutral" size="sm" label={t("admin.templates.archivedBadge")} />
            )}
          </div>
        </div>
        <div className="bg-muted p-2 rounded-md flex flex-col items-center justify-center min-w-12 shrink-0">
          <span className="text-lg font-bold">{template.stageCount}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("admin.templates.stagesLabel")}</span>
        </div>
      </div>
      <p className="line-clamp-2 mt-2 text-sm text-muted-foreground">{template.description || t("admin.templates.noDescription")}</p>
      {isAssigned && (
        <p className="text-xs text-muted-foreground mt-1">
          {assignedCount === 1
            ? t("admin.templates.assignedToProjects", { count: assignedCount })
            : t("admin.templates.assignedToProjectsPlural", { count: assignedCount })}
        </p>
      )}
      <div className="flex-1" />
      <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
        <span className="text-xs text-muted-foreground">
          {t("admin.templates.addedDate", { date: fmtDate(template.createdAt) })}
        </span>
        {!archived && (
          <div className="flex gap-2">
            <Link href={`/templates/${template.id}`}>
              <Button variant="outline" size="sm" className="h-8"><Edit2 className="h-3.5 w-3.5 me-1.5" /> {t("admin.templates.editButton")}</Button>
            </Link>
            {isAssigned ? (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                onClick={() => onArchive(template.id)}
                title={t("admin.templates.archiveTitle")}
                aria-label={t("admin.templates.archiveTitle")}
              >
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(template.id, template.name, assignedCount)}
                title={t("common.delete")}
                aria-label={t("common.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>
    </DgaContentCard>
  );
}
