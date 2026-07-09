import { useState, useMemo, useEffect } from "react";
import type { TFunction } from "i18next";
import { useLocation, Link } from "wouter";
import {
  useGetDashboard, useListProjects, useCreateProject,
  useListTemplates, useListUsers, useGetCities, useGetProjectCategories,
  getListProjectsQueryKey, getGetDashboardQueryKey, getListUsersQueryKey, getListTemplatesQueryKey,
  getGetCitiesQueryKey, getGetProjectCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useCityFilter } from "@/hooks/use-city-filter";
import { useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Search, Download, AlertTriangle, AlertCircle, Plus, FolderOpen,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fmtDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";
import { StatusBadge, STATUS_META, STATUS_ORDER, type DerivedStatus } from "@/components/status-badge";
import { cn } from "@/lib/utils";

// ── Schema ─────────────────────────────────────────────────────────────────
// cityId/categoryId deliberately avoid z.coerce: an untouched Select submits
// undefined, and coercion would turn that into NaN, skipping required_error
// and surfacing a raw untranslated Zod message. The Selects emit real numbers.
const makeNewProjectSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t("validation.projectNameRequired")).max(200),
  cityId: z.number({ required_error: t("validation.cityRequired"), invalid_type_error: t("validation.cityRequired") }).min(1, t("validation.cityRequired")),
  categoryId: z.number({ required_error: t("validation.categoryRequired"), invalid_type_error: t("validation.categoryRequired") }).min(1, t("validation.categoryRequired")),
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
    } catch (error: unknown) {
      toast({
        title: t("projects.newDialog.toastFailedTitle"),
        description: apiErrorMessage(error, t("projects.newDialog.toastFailedDesc")),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-card-border px-6 py-4">
          <DialogTitle>{t("projects.newDialog.title")}</DialogTitle>
          <DialogDescription>{t("projects.newDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60dvh] overflow-y-auto px-6 py-5">
          <Form {...form}>
            <form id="new-project-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* ── Section: Project Identity ── */}
              <div className="space-y-4">
                <p className="text-sm font-medium text-foreground">{t("projects.newDialog.sectionIdentity")}</p>

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
                      <Input className="font-mono" placeholder={t("projects.newDialog.fieldAgreementNumberPlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="plotNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.newDialog.fieldPlotNumber")} <span className="text-xs font-normal text-muted-foreground">{t("auth.optional")}</span></FormLabel>
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
                <p className="text-sm font-medium text-foreground">{t("projects.newDialog.sectionAssignment")}</p>

                <FormField control={form.control} name="investorId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.newDialog.fieldInvestor")} <span className="text-xs font-normal text-muted-foreground">{t("projects.newDialog.fieldInvestorOptional")}</span></FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                      value={field.value != null ? String(field.value) : "none"}
                    >
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
                            {u.companyName && <span className="ms-1.5 text-xs text-muted-foreground">({u.companyName})</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="pipelineId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.newDialog.fieldPipeline")} <span className="text-xs font-normal text-muted-foreground">{t("projects.newDialog.fieldPipelineOptional")}</span></FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                      value={field.value != null ? String(field.value) : "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("projects.newDialog.fieldPipelinePlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">{t("projects.newDialog.fieldPipelineNone")}</SelectItem>
                        {templates?.map((tpl) => (
                          <SelectItem key={tpl.id} value={tpl.id.toString()}>
                            {tpl.name}
                            {tpl.versionNumber && tpl.versionNumber > 1 && (
                              <span className="ms-1.5 text-xs text-muted-foreground" dir="ltr">v{tpl.versionNumber}</span>
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
                <p className="text-sm font-medium text-foreground">{t("projects.newDialog.sectionInitialState")}</p>

                <FormField control={form.control} name="constructionPct" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.newDialog.fieldConstructionPct")} <span className="text-xs font-normal text-muted-foreground">{t("projects.newDialog.fieldConstructionPctOptional")}</span></FormLabel>
                    <FormControl>
                      <Input type="number" min="0" max="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.newDialog.fieldNotes")} <span className="text-xs font-normal text-muted-foreground">{t("projects.newDialog.fieldNotesOptional")}</span></FormLabel>
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

        <DialogFooter className="gap-2 border-t border-card-border px-6 py-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="new-project-form" disabled={createMutation.isPending}>
            {createMutation.isPending && <Spinner aria-hidden="true" />}
            {createMutation.isPending ? t("projects.newDialog.submitCreating") : t("projects.newDialog.submitCreate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

/** Quiet bordered panel used for charts and the recent-updates list. */
function Panel({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-card-border bg-card p-5", className)}>
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Loading state mirroring the final layout: KPI strip, chart row, table. */
function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-card-border bg-card lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn("space-y-3 p-5", KPI_CELL_BORDERS[i])}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

// Hairline separators for the KPI strip: 2-up on mobile, 4-up from lg.
const KPI_CELL_BORDERS = [
  "",
  "border-s border-card-border",
  "border-t border-card-border lg:border-s lg:border-t-0",
  "border-s border-t border-card-border lg:border-t-0",
];

// ── Main Dashboard Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const { activeCityId } = useCityFilter();

  // Debounce the search box so the list query doesn't fire per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const canCreate = user?.role === "administrator" || user?.role === "project-manager";

  const {
    data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats,
  } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() },
  });
  const projectParams = { search, ...(activeCityId != null ? { cityId: activeCityId } : {}) };
  const {
    data: projects, isLoading: projectsLoading, isError: projectsError, refetch: refetchProjects,
  } = useListProjects(
    projectParams,
    { query: { queryKey: getListProjectsQueryKey(projectParams), placeholderData: keepPreviousData } },
  );

  const handleExport = async () => {
    const token = localStorage.getItem("jabeen_access_token");
    try {
      const r = await fetch("/api/projects/export", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jabeen-portfolio-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: t("dashboard.error.title"),
        description: t("dashboard.exportFailed"),
        variant: "destructive",
      });
    }
  };

  const statusData = useMemo(
    () => (stats?.byStatus ?? [])
      .slice()
      .sort((a, b) => STATUS_ORDER.indexOf(a.status as DerivedStatus) - STATUS_ORDER.indexOf(b.status as DerivedStatus))
      .map((s) => ({
        ...s,
        label: t(`status.${s.status}`),
        fill: STATUS_META[s.status as DerivedStatus]?.chart ?? "var(--chart-1)",
      })),
    [stats?.byStatus, t],
  );
  const cityData = useMemo(
    () => (stats?.byCity ?? []).map((c) => ({ name: c.city, count: c.count })),
    [stats?.byCity],
  );
  const categoryData = useMemo(
    () => (stats?.byCategory ?? []).map((c) => ({ name: c.category, count: c.count })),
    [stats?.byCategory],
  );
  const countConfig = useMemo(() => ({ count: { label: t("dashboard.charts.count") } }), [t]);

  const recentUpdates = stats?.recentUpdates ?? [];
  const portfolioEmpty = !statsLoading && !statsError && (stats?.total ?? 0) === 0;

  const kpis = [
    { label: t("dashboard.kpi.total"), value: stats?.total },
    { label: t("dashboard.kpi.inProgress"), value: stats?.inProgress },
    { label: t("dashboard.kpi.needsAttention"), value: stats?.needsAttention },
    { label: t("dashboard.kpi.completed"), value: stats?.complete },
  ];

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="me-2 h-4 w-4" aria-hidden="true" /> {t("dashboard.exportCsv")}
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setNewProjectOpen(true)}>
              <Plus className="me-2 h-4 w-4" aria-hidden="true" /> {t("dashboard.newProject")}
            </Button>
          )}
        </div>
      </div>

      {statsError ? (
        /* ── Stats query-error state (scoped to KPIs/charts; the table below has its own) ── */
        <section className="rounded-xl border border-card-border bg-card px-6 py-14 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">{t("dashboard.error.title")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("dashboard.error.desc")}</p>
          <Button variant="outline" className="mt-5" onClick={() => refetchStats()}>
            {t("dashboard.error.retry")}
          </Button>
        </section>
      ) : statsLoading ? (
        <DashboardSkeleton />
      ) : portfolioEmpty ? (
        /* ── Empty portfolio (teaches) ── */
        <section className="rounded-xl border border-card-border bg-card px-6 py-16 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-foreground">{t("dashboard.empty.title")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {canCreate ? t("dashboard.empty.desc") : t("dashboard.empty.descReadOnly")}
          </p>
          {canCreate && (
            <Button className="mt-6" onClick={() => setNewProjectOpen(true)}>
              <Plus className="me-2 h-4 w-4" aria-hidden="true" /> {t("dashboard.table.createFirst")}
            </Button>
          )}
        </section>
      ) : (
        <>
          {/* ── KPI strip: one bordered row, hairline-separated stat blocks ── */}
          <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-card-border bg-card lg:grid-cols-4">
            {kpis.map(({ label, value }, i) => (
              <div key={label} className={cn("space-y-1 p-5", KPI_CELL_BORDERS[i])}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="font-display text-3xl font-semibold tabular-nums text-foreground">{value ?? 0}</p>
              </div>
            ))}
          </section>

          {/* ── Charts + recent updates ── */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Panel title={t("dashboard.breakdown.byCity")}>
                {/* Charts render into fixed-coordinate SVG; the container is pinned LTR (registered in docs/rtl.md). */}
                <ChartContainer dir="ltr" config={countConfig} className="aspect-auto h-[220px] w-full">
                  <BarChart accessibilityLayer data={cityData} layout="vertical" margin={{ top: 4, bottom: 4, left: 0, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="count" name={t("dashboard.charts.count")} fill="var(--chart-2)" radius={4} barSize={18} isAnimationActive={false} />
                  </BarChart>
                </ChartContainer>
              </Panel>

              <Panel title={t("dashboard.breakdown.byCategory")}>
                <ChartContainer dir="ltr" config={countConfig} className="aspect-auto h-[220px] w-full">
                  <BarChart accessibilityLayer data={categoryData} layout="vertical" margin={{ top: 4, bottom: 4, left: 0, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="count" name={t("dashboard.charts.count")} fill="var(--chart-1)" radius={4} barSize={18} isAnimationActive={false} />
                  </BarChart>
                </ChartContainer>
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel title={t("dashboard.breakdown.byStatus")}>
                <ChartContainer dir="ltr" config={countConfig} className="mx-auto aspect-square h-[180px]">
                  <PieChart accessibilityLayer>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                    <Pie data={statusData} dataKey="count" nameKey="label" innerRadius={48} outerRadius={76} isAnimationActive={false}>
                      {statusData.map((d) => (
                        <Cell key={d.status} fill={d.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <ul className="mt-4 space-y-1.5">
                  {statusData.map((d) => (
                    <li key={d.status} className="flex items-center gap-2 text-sm">
                      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: d.fill }} aria-hidden="true" />
                      <span className="flex-1 truncate text-muted-foreground">{d.label}</span>
                      <span className="font-medium tabular-nums text-foreground">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title={t("dashboard.recent.title")}>
                {recentUpdates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("dashboard.recent.empty")}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {recentUpdates.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <Link
                            href={`/projects/${p.id}`}
                            className="block truncate text-sm font-medium text-foreground transition-colors duration-150 hover:text-primary hover:underline"
                          >
                            {p.name}
                          </Link>
                          {p.lastUpdateAt && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {fmtDate(p.lastUpdateAt)}
                            </p>
                          )}
                        </div>
                        <StatusBadge status={p.derivedStatus as DerivedStatus} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </section>
        </>
      )}

      {/* ── Projects table (independent of the stats query) ── */}
      {!statsLoading && !portfolioEmpty && (
          <section className="rounded-xl border border-card-border bg-card">
            <div className="flex flex-col justify-between gap-4 border-b border-card-border p-5 sm:flex-row sm:items-center">
              <h2 className="text-lg font-semibold text-foreground">{t("dashboard.table.title")}</h2>
              <div className="relative w-full sm:w-72">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  placeholder={t("dashboard.table.searchPlaceholder")}
                  aria-label={t("dashboard.table.searchPlaceholder")}
                  className="bg-background ps-9"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[300px] ps-5">{t("dashboard.table.colName")}</TableHead>
                  <TableHead>{t("dashboard.table.colInvestor")}</TableHead>
                  <TableHead>{t("dashboard.table.colCityCategory")}</TableHead>
                  <TableHead>{t("dashboard.table.colStage")}</TableHead>
                  <TableHead>{t("dashboard.table.colStatus")}</TableHead>
                  <TableHead className="pe-5 text-end">{t("dashboard.table.colProgress")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectsError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
                        <p>{t("dashboard.table.error")}</p>
                        <Button size="sm" variant="outline" onClick={() => refetchProjects()}>
                          {t("dashboard.error.retry")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : projectsLoading ? (
                  [0, 1, 2, 3].map((i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell className="ps-5 py-3">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="mt-2 h-3 w-28" />
                      </TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-md" /></TableCell>
                      <TableCell className="pe-5"><Skeleton className="ms-auto h-4 w-10" /></TableCell>
                    </TableRow>
                  ))
                ) : !projects?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <FolderOpen className="h-10 w-10 opacity-20" aria-hidden="true" />
                        <p>{search ? t("dashboard.table.emptySearch") : t("dashboard.table.emptyAll")}</p>
                        {canCreate && !search && (
                          <Button size="sm" variant="outline" onClick={() => setNewProjectOpen(true)}>
                            <Plus className="me-1.5 h-3.5 w-3.5" aria-hidden="true" /> {t("dashboard.table.createFirst")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  projects.map((project) => (
                    <TableRow key={project.id} className="even:bg-muted/40 hover:bg-muted/60">
                      <TableCell className="ps-5 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {project.attentionFlag && (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                          )}
                          <Link
                            href={`/projects/${project.id}`}
                            title={project.name}
                            className="line-clamp-1 transition-colors duration-150 hover:text-primary hover:underline"
                          >
                            {project.name}
                          </Link>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          <span className="font-mono" dir="ltr">{project.agreementNumber}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[200px] truncate" title={project.investor?.companyName}>
                          {project.investor?.companyName || <span className="italic text-muted-foreground">{t("dashboard.table.unassigned")}</span>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-foreground">{project.city?.shortName}</div>
                        {project.category?.name && (
                          <div className="text-xs text-muted-foreground">{project.category.name}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-block max-w-[150px] truncate text-sm" title={project.currentStage?.name}>
                          {project.currentStage?.name || t("dashboard.table.initializing")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={project.derivedStatus as DerivedStatus} />
                      </TableCell>
                      <TableCell className="pe-5 text-end font-medium tabular-nums">
                        <span dir="ltr">{project.constructionPct}%</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>
      )}

      {/* ── Dialog ── */}
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </div>
  );
}
