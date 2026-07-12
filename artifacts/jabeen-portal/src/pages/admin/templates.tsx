import { useState } from "react";
import {
  useListTemplates, useDeleteTemplate, useArchiveTemplate,
  getListTemplatesQueryKey,
  type TemplateSummary,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Archive, GitMerge, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Badges (tinted fills per DESIGN.md — the template lifecycle vocabulary is
// local to this page, distinct from the derived project StatusBadge) ──────────
function VersionBadge({ version }: { version: number }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground" dir="ltr">
      v{version}
    </span>
  );
}

function StatusBadge({ archived, isDefault }: { archived: boolean; isDefault: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {isDefault && (
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-secondary/10 px-2 py-0.5 text-xs font-medium text-foreground">
          {t("admin.templates.defaultBadge")}
        </span>
      )}
      <span className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        archived ? "bg-muted text-muted-foreground" : "bg-success/15 text-foreground",
      )}>
        {archived ? t("admin.templates.archivedBadge") : t("admin.templates.statusActive")}
      </span>
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
type PendingAction =
  | { kind: "delete"; template: TemplateSummary }
  | { kind: "archive"; template: TemplateSummary };

export default function TemplatesPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const listParams = { includeArchived: true };
  const { data: templates, isLoading } = useListTemplates(
    listParams,
    { query: { queryKey: getListTemplatesQueryKey(listParams) } },
  );
  const deleteTemplate = useDeleteTemplate();
  const archiveTemplate = useArchiveTemplate();

  const [pending, setPending] = useState<PendingAction | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/templates"] });

  const runArchive = async (template: TemplateSummary) => {
    try {
      await archiveTemplate.mutateAsync({ templateId: template.id });
      invalidate();
      toast({ title: t("admin.templates.toast.archived"), description: t("admin.templates.toast.archivedDesc", { name: template.name }) });
    } catch (error: unknown) {
      toast({ title: t("admin.templates.toast.error"), description: apiErrorMessage(error, t("admin.templates.toast.archiveFailed")), variant: "destructive" });
    } finally {
      setPending(null);
    }
  };

  const runDelete = async (template: TemplateSummary) => {
    try {
      await deleteTemplate.mutateAsync({ templateId: template.id });
      invalidate();
      toast({ title: t("admin.templates.toast.deleted"), description: t("admin.templates.toast.deletedDesc", { name: template.name }) });
    } catch (error: unknown) {
      toast({ title: t("admin.templates.toast.error"), description: apiErrorMessage(error, t("admin.templates.toast.deleteFailed")), variant: "destructive" });
    } finally {
      setPending(null);
    }
  };

  // Sort active templates ahead of archived; both keep server order otherwise.
  const rows = [...(templates ?? [])].sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt));
  const isMutating = deleteTemplate.isPending || archiveTemplate.isPending;

  const pendingMeta = pending && ({
    delete: {
      title: t("admin.templates.deleteDialogTitle"),
      desc: t("admin.templates.deleteConfirm", { name: pending.template.name }),
      confirmLabel: t("common.delete"),
      run: () => runDelete(pending.template),
    },
    archive: {
      title: t("admin.templates.archiveDialogTitle"),
      // In-use templates can't be deleted, only archived — the copy explains why.
      desc: (pending.template.assignedProjectCount ?? 0) > 0
        ? t("admin.templates.deleteInUseConfirm", { count: pending.template.assignedProjectCount })
        : t("admin.templates.archiveConfirm"),
      confirmLabel: t("admin.templates.archiveTitle"),
      run: () => runArchive(pending.template),
    },
  }[pending.kind]);

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">{t("admin.templates.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.templates.subtitle")}</p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => navigate("/templates/new")}>
          <Plus className="me-2 h-4 w-4" aria-hidden="true" /> {t("admin.templates.newTemplate")}
        </Button>
      </div>

      {/* ── Table ── */}
      <section className="rounded-xl border border-card-border bg-card">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="ps-5">{t("admin.templates.colName")}</TableHead>
              <TableHead className="text-end">{t("admin.templates.colStages")}</TableHead>
              <TableHead>{t("admin.templates.colVersion")}</TableHead>
              <TableHead>{t("admin.templates.colStatus")}</TableHead>
              <TableHead>{t("admin.templates.colAdded")}</TableHead>
              <TableHead className="pe-5 text-end">{t("admin.templates.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [0, 1, 2].map((i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell className="ps-5 py-3"><Skeleton className="h-4 w-48" /><Skeleton className="mt-2 h-3 w-64" /></TableCell>
                  <TableCell className="text-end"><Skeleton className="ms-auto h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-10 rounded-md" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="pe-5"><Skeleton className="ms-auto h-8 w-20" /></TableCell>
                </TableRow>
              ))
            ) : !rows.length ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-52 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <GitMerge className="h-10 w-10 opacity-20" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{t("admin.templates.noTemplates")}</p>
                      <p className="mx-auto max-w-sm text-sm">{t("admin.templates.noTemplatesDesc")}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate("/templates/new")}>
                      <Plus className="me-1.5 h-3.5 w-3.5" aria-hidden="true" /> {t("admin.templates.createTemplate")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((template) => {
                const archived = !!template.archivedAt;
                const assigned = template.assignedProjectCount ?? 0;
                return (
                  <TableRow key={template.id} className={cn("hover:bg-muted/60", archived ? "bg-muted/40" : "even:bg-muted/40")}>
                    <TableCell className="ps-5 py-3 align-top">
                      <div className="font-medium text-foreground">{template.name}</div>
                      <div className="mt-0.5 line-clamp-1 max-w-md text-xs text-muted-foreground">
                        {template.description || t("admin.templates.noDescription")}
                      </div>
                      {assigned > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {assigned === 1
                            ? t("admin.templates.assignedToProjects", { count: assigned })
                            : t("admin.templates.assignedToProjectsPlural", { count: assigned })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-end align-top tabular-nums text-foreground">
                      <span className="inline-flex items-baseline gap-1">
                        <span className="font-medium">{template.stageCount}</span>
                        <span className="text-xs text-muted-foreground">{t("admin.templates.stagesLabel")}</span>
                      </span>
                    </TableCell>
                    <TableCell className="align-top"><VersionBadge version={template.versionNumber} /></TableCell>
                    <TableCell className="align-top"><StatusBadge archived={archived} isDefault={template.isDefault} /></TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">{fmtDate(template.createdAt)}</TableCell>
                    <TableCell className="pe-5 align-top">
                      <div className="flex justify-end gap-1">
                        {!archived && (
                          <>
                            <Button asChild variant="ghost" size="icon" title={t("admin.templates.editButton")} aria-label={t("admin.templates.editButton")}>
                              <Link href={`/templates/${template.id}`}>
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Link>
                            </Button>
                            {assigned > 0 ? (
                              <Button
                                variant="ghost" size="icon"
                                onClick={() => setPending({ kind: "archive", template })}
                                title={t("admin.templates.archiveTitle")}
                                aria-label={t("admin.templates.archiveTitle")}
                              >
                                <Archive className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost" size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setPending({ kind: "delete", template })}
                                title={t("common.delete")}
                                aria-label={t("common.delete")}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                          </>
                        )}
                        {archived && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>

      {/* ── Archive / delete confirmation ── */}
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          {pendingMeta && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{pendingMeta.title}</AlertDialogTitle>
                <AlertDialogDescription>{pendingMeta.desc}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className={cn(pending?.kind === "delete" && buttonVariants({ variant: "destructive" }))}
                  onClick={(e) => { e.preventDefault(); pendingMeta.run(); }}
                  disabled={isMutating}
                >
                  {isMutating && <Spinner aria-hidden="true" />}
                  {pendingMeta.confirmLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
