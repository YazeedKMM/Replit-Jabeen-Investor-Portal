import { useState, useMemo } from "react";
import type { TFunction } from "i18next";
import { useLocation } from "wouter";
import {
  useGetDashboard, useListProjects, useCreateProject,
  useListTemplates, useListUsers, useGetCities, useGetProjectCategories,
  getListProjectsQueryKey, getGetDashboardQueryKey, getListUsersQueryKey, getListTemplatesQueryKey,
  getGetCitiesQueryKey, getGetProjectCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useCityFilter } from "@/hooks/use-city-filter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { DgaContentCard } from "@/components/ui/dga-card";
import { DgaModal } from "@/components/ui/dga-modal";
import { DgaBrandButton, DgaSubmitButton } from "@/components/ui/dga-brand-button";
import { DgaTag, DgaStatusTag, DgaButton } from "platformscode-new-react";
import { dgaStatusColor } from "@/lib/dga-status";
import {
  Building2, Search, Download, AlertTriangle, CheckCircle2, Activity,
  Plus, Loader2, FolderOpen,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ── Schema ─────────────────────────────────────────────────────────────────
const makeNewProjectSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t("validation.projectNameRequired")).max(200),
  cityId: z.coerce.number({ required_error: t("validation.cityRequired") }).min(1, t("validation.cityRequired")),
  categoryId: z.coerce.number({ required_error: t("validation.categoryRequired") }).min(1, t("validation.categoryRequired")),
  agreementNumber: z.string().min(1, t("validation.agreementRequired")).max(100),
  plotNumber: z.string().max(100).optional(),
  pipelineId: z.coerce.number().optional(),
  investorId: z.coerce.number().optional(),
  constructionPct: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});
type NewProjectForm = z.infer<ReturnType<typeof makeNewProjectSchema>>;

// ── Inline "New Project" Dialog ────────────────────────────────────────────
function NewProjectDialog({
  open, onOpenChange,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const investorParams = { role: "investor" as const, status: "active" as const };
  const templateParams = {};

  // Only fetch when dialog is open
  const { data: templates } = useListTemplates(
    templateParams,
    { query: { queryKey: getListTemplatesQueryKey(templateParams), enabled: open } },
  );
  const { data: investors } = useListUsers(
    investorParams,
    { query: { queryKey: getListUsersQueryKey(investorParams), enabled: open } },
  );
  const { data: allCities } = useGetCities({ query: { queryKey: getGetCitiesQueryKey(), enabled: open } });
  const { data: allCategories } = useGetProjectCategories({ query: { queryKey: getGetProjectCategoriesQueryKey(), enabled: open } });
  const enabledCities = allCities?.filter((c) => c.enabled) ?? [];
  const enabledCategories = allCategories?.filter((c) => c.enabled) ?? [];

  const createMutation = useCreateProject();

  const newProjectSchema = useMemo(() => makeNewProjectSchema(t), [t]);
  const form = useForm<NewProjectForm>({
    resolver: zodResolver(newProjectSchema),
    defaultValues: {
      name: "",
      agreementNumber: "",
      plotNumber: "",
      notes: "",
      constructionPct: 0,
    },
  });

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  const onSubmit = async (data: NewProjectForm) => {
    try {
      const project = await createMutation.mutateAsync({
        data: {
          name: data.name,
          cityId: data.cityId,
          categoryId: data.categoryId,
          agreementNumber: data.agreementNumber,
          ...(data.plotNumber ? { plotNumber: data.plotNumber } : {}),
          ...(data.pipelineId ? { pipelineId: data.pipelineId } : {}),
          ...(data.investorId ? { investorId: data.investorId } : {}),
          ...(data.constructionPct != null ? { constructionPct: data.constructionPct } : {}),
          ...(data.notes ? { notes: data.notes } : {}),
        },
      });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      toast({ title: t("projects.newDialog.toastCreatedTitle"), description: t("projects.newDialog.toastCreatedDesc", { name: project.name }) });
      handleClose();
      navigate(`/projects/${project.id}`);
    } catch (error: any) {
      toast({
        title: t("projects.newDialog.toastFailedTitle"),
        description: error.data?.message ?? t("projects.newDialog.toastFailedDesc"),
        variant: "destructive",
      });
    }
  };

  return (
    <DgaModal
      open={open}
      onOpenChange={handleClose}
      title={t("projects.newDialog.title")}
      footer={
        <div className="flex gap-3 justify-end">
          <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={handleClose} />
          <DgaSubmitButton
            onSubmit={form.handleSubmit(onSubmit)}
            loading={createMutation.isPending}
            loadingLabel={t("projects.newDialog.submitCreating")}
            label={t("projects.newDialog.submitCreate")}
          />
        </div>
      }
    >
      <p className="text-sm text-muted-foreground mb-4">{t("projects.newDialog.description")}</p>
      <div className="max-h-[65vh] overflow-y-auto pe-1">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* ── Section: Project Identity ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("projects.newDialog.sectionIdentity")}</p>

              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.newDialog.fieldName")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("projects.newDialog.fieldNamePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="cityId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.newDialog.fieldCity")}</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value ? String(field.value) : ""}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder={t("projects.newDialog.fieldCityPlaceholder")} /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {enabledCities.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="categoryId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.newDialog.fieldCategory")}</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value ? String(field.value) : ""}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder={t("projects.newDialog.fieldCategoryPlaceholder")} /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {enabledCategories.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="agreementNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.newDialog.fieldAgreementNumber")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("projects.newDialog.fieldAgreementNumberPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="plotNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.newDialog.fieldPlotNumber")} <span className="text-muted-foreground font-normal text-xs">{t("auth.optional")}</span></FormLabel>
                  <FormControl>
                    <Input placeholder={t("projects.newDialog.fieldPlotNumberPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <Separator />

            {/* ── Section: Assignment ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("projects.newDialog.sectionAssignment")}</p>

              <FormField control={form.control} name="investorId" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.newDialog.fieldInvestor")} <span className="text-muted-foreground font-normal text-xs">{t("projects.newDialog.fieldInvestorOptional")}</span></FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))} defaultValue="none">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("projects.newDialog.fieldInvestorPlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">{t("projects.newDialog.fieldInvestorNone")}</SelectItem>
                      {investors?.map((u) => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.fullName}
                          {u.companyName && <span className="text-muted-foreground ms-1.5 text-xs">({u.companyName})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="pipelineId" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.newDialog.fieldPipeline")} <span className="text-muted-foreground font-normal text-xs">{t("projects.newDialog.fieldPipelineOptional")}</span></FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))} defaultValue="none">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("projects.newDialog.fieldPipelinePlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">{t("projects.newDialog.fieldPipelineNone")}</SelectItem>
                      {templates?.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.name}
                          {t.versionNumber && t.versionNumber > 1 && (
                            <span className="text-muted-foreground ms-1.5 text-xs">v{t.versionNumber}</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <Separator />

            {/* ── Section: Initial Progress ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("projects.newDialog.sectionInitialState")}</p>

              <FormField control={form.control} name="constructionPct" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.newDialog.fieldConstructionPct")} <span className="text-muted-foreground font-normal text-xs">{t("projects.newDialog.fieldConstructionPctOptional")}</span></FormLabel>
                  <FormControl>
                    <Input type="number" min="0" max="100" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.newDialog.fieldNotes")} <span className="text-muted-foreground font-normal text-xs">{t("projects.newDialog.fieldNotesOptional")}</span></FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("projects.newDialog.fieldNotesPlaceholder")}
                      className="min-h-[80px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

          </form>
        </Form>
      </div>
    </DgaModal>
  );
}

// ── Main Dashboard Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const { activeCityId } = useCityFilter();

  const canCreate = user?.role === "administrator" || user?.role === "project-manager";

  const { data: stats, isLoading: statsLoading } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() },
  });
  const projectParams = { search, ...(activeCityId != null ? { cityId: activeCityId } : {}) };
  const { data: projects, isLoading: projectsLoading } = useListProjects(
    projectParams,
    { query: { queryKey: getListProjectsQueryKey(projectParams) } },
  );

  const handleExport = () => {
    const token = localStorage.getItem("jabeen_access_token");
    fetch("/api/projects/export", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `jabeen-portfolio-${format(new Date(), "yyyy-MM-dd")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="me-2 h-4 w-4" /> {t("dashboard.exportCsv")}
          </Button>
          {canCreate && (
            <DgaBrandButton label={t("dashboard.newProject")} onOnClick={() => setNewProjectOpen(true)} />
          )}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("dashboard.kpi.total"), value: stats?.total, icon: Building2, color: "text-muted-foreground" },
          { label: t("dashboard.kpi.inProgress"), value: stats?.inProgress, icon: Activity, color: "text-blue-500" },
          { label: t("dashboard.kpi.needsAttention"), value: stats?.needsAttention, icon: AlertTriangle, color: "text-amber-500" },
          { label: t("dashboard.kpi.completed"), value: stats?.complete, icon: CheckCircle2, color: "text-blue-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <DgaContentCard key={label} className="space-y-2">
            <div className="flex flex-row items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
              <Icon className={cn("h-4 w-4", color)} />
            </div>
            <div className={cn("text-3xl font-bold", color !== "text-muted-foreground" && color)}>
              {statsLoading ? "—" : (value ?? 0)}
            </div>
          </DgaContentCard>
        ))}
      </div>

      {/* ── Breakdown: By Category & By City ── */}
      {!statsLoading && ((stats?.byCategory?.length ?? 0) > 0 || (stats?.byCity?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(stats?.byCategory?.length ?? 0) > 0 && (
            <DgaContentCard className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("dashboard.breakdown.byCategory")}</h3>
              {stats!.byCategory.map(({ category, count }) => (
                <div key={category} className="flex items-center justify-between text-sm">
                  <span className="truncate text-foreground">{category}</span>
                  <DgaTag variant="neutral" size="sm" outlined label={String(count)} />
                </div>
              ))}
            </DgaContentCard>
          )}
          {(stats?.byCity?.length ?? 0) > 0 && (
            <DgaContentCard className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("dashboard.breakdown.byCity")}</h3>
              {stats!.byCity.map(({ city, count }) => (
                <div key={city} className="flex items-center justify-between text-sm">
                  <span className="truncate text-foreground">{city}</span>
                  <DgaTag variant="neutral" size="sm" outlined label={String(count)} />
                </div>
              ))}
            </DgaContentCard>
          )}
        </div>
      )}

      {/* ── Projects Table ── */}
      <DgaContentCard className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center pb-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{t("dashboard.table.title")}</h2>
          <div className="relative w-full sm:w-72">
            <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("dashboard.table.searchPlaceholder")}
              className="ps-8 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[300px]">{t("dashboard.table.colName")}</TableHead>
                <TableHead>{t("dashboard.table.colInvestor")}</TableHead>
                <TableHead>{t("dashboard.table.colCityCategory")}</TableHead>
                <TableHead>{t("dashboard.table.colStage")}</TableHead>
                <TableHead>{t("dashboard.table.colStatus")}</TableHead>
                <TableHead className="text-end">{t("dashboard.table.colProgress")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : !projects?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <FolderOpen className="h-10 w-10 opacity-20" />
                      <p>{search ? t("dashboard.table.emptySearch") : t("dashboard.table.emptyAll")}</p>
                      {canCreate && !search && (
                        <Button size="sm" variant="outline" onClick={() => setNewProjectOpen(true)}>
                          <Plus className="me-1.5 h-3.5 w-3.5" /> {t("dashboard.table.createFirst")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((project) => (
                  <TableRow key={project.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {project.attentionFlag && (
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                        <Link
                          href={`/projects/${project.id}`}
                          className="hover:underline hover:text-primary line-clamp-1"
                        >
                          {project.name}
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{project.agreementNumber}</div>
                    </TableCell>
                    <TableCell>
                      <span className="truncate max-w-[200px] block" title={project.investor?.companyName}>
                        {project.investor?.companyName || <span className="text-muted-foreground italic">{t("dashboard.table.unassigned")}</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {project.city?.shortName && (
                          <DgaTag variant="info" size="sm" label={project.city.shortName} />
                        )}
                        {project.category?.name && (
                          <DgaTag variant="neutral" size="sm" outlined label={project.category.name} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm truncate max-w-[150px] inline-block" title={project.currentStage?.name}>
                        {project.currentStage?.name || t("dashboard.table.initializing")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DgaStatusTag color={dgaStatusColor(project.derivedStatus)} status="subtle" size="sm" label={t(`status.${project.derivedStatus}`)} />
                    </TableCell>
                    <TableCell className="text-end font-medium tabular-nums">
                      {project.constructionPct}%
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
      </DgaContentCard>

      {/* ── Dialog ── */}
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </div>
  );
}
