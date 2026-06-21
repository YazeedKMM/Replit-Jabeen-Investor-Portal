import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetDashboard, useListProjects, useCreateProject,
  useListTemplates, useListUsers, useGetCities, useGetProjectCategories,
  getListProjectsQueryKey, getGetDashboardQueryKey, getListUsersQueryKey, getListTemplatesQueryKey,
} from "@workspace/api-client-react";
import { useCityFilter } from "@/hooks/use-city-filter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Building2, Search, Download, AlertTriangle, CheckCircle2, Activity,
  Plus, Loader2, FolderOpen,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ── Schema ─────────────────────────────────────────────────────────────────
const newProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  cityId: z.coerce.number({ required_error: "City is required" }).min(1, "City is required"),
  categoryId: z.coerce.number({ required_error: "Project category is required" }).min(1, "Project category is required"),
  agreementNumber: z.string().min(1, "Agreement number is required").max(100),
  plotNumber: z.string().max(100).optional(),
  pipelineId: z.coerce.number().optional(),
  investorId: z.coerce.number().optional(),
  constructionPct: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});
type NewProjectForm = z.infer<typeof newProjectSchema>;

// ── Inline "New Project" Dialog ────────────────────────────────────────────
function NewProjectDialog({
  open, onOpenChange,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
  const { data: allCities } = useGetCities({ query: { enabled: open } });
  const { data: allCategories } = useGetProjectCategories({ query: { enabled: open } });
  const enabledCities = allCities?.filter((c) => c.enabled) ?? [];
  const enabledCategories = allCategories?.filter((c) => c.enabled) ?? [];

  const createMutation = useCreateProject();

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
      toast({ title: "Project created", description: `"${project.name}" is now in the portfolio.` });
      handleClose();
      navigate(`/projects/${project.id}`);
    } catch (error: any) {
      toast({
        title: "Failed to create project",
        description: error.data?.message ?? "An error occurred.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> New Investment Project
          </DialogTitle>
          <DialogDescription>
            Register a new industrial project in the JABEEN portfolio. Required fields are marked with *.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* ── Section: Project Identity ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project Identity</p>

              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Acme Plastics Manufacturing Plant" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="cityId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>City *</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value ? String(field.value) : ""}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select city…" /></SelectTrigger>
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
                    <FormLabel>Project Category *</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value ? String(field.value) : ""}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
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
                  <FormLabel>Agreement Number *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. RCJY-2026-0042" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="plotNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Plot Number <span className="text-muted-foreground font-normal text-xs">(Optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. P-4217" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <Separator />

            {/* ── Section: Assignment ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment</p>

              <FormField control={form.control} name="investorId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Investor <span className="text-muted-foreground font-normal text-xs">(Optional — can be assigned later)</span></FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))} defaultValue="none">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select investor…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">— No investor yet —</SelectItem>
                      {investors?.map((u) => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.fullName}
                          {u.companyName && <span className="text-muted-foreground ml-1.5 text-xs">({u.companyName})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="pipelineId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lifecycle Pipeline <span className="text-muted-foreground font-normal text-xs">(Optional — can be assigned later)</span></FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))} defaultValue="none">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select pipeline template…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">— No pipeline yet —</SelectItem>
                      {templates?.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.name}
                          {t.versionNumber && t.versionNumber > 1 && (
                            <span className="text-muted-foreground ml-1.5 text-xs">v{t.versionNumber}</span>
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Initial State</p>

              <FormField control={form.control} name="constructionPct" render={({ field }) => (
                <FormItem>
                  <FormLabel>Starting Project Progress <span className="text-muted-foreground font-normal text-xs">(0 for new projects)</span></FormLabel>
                  <FormControl>
                    <Input type="number" min="0" max="100" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes <span className="text-muted-foreground font-normal text-xs">(Optional)</span></FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Background information, special conditions, early milestones…"
                      className="min-h-[80px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</>
                  : <><Plus className="mr-2 h-4 w-4" /> Create Project</>}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Status helpers ──────────────────────────────────────────────────────────
function getStatusColor(status: string) {
  switch (status) {
    case "on-track": return "bg-emerald-500/15 text-emerald-700 border-emerald-200";
    case "delayed": return "bg-amber-500/15 text-amber-700 border-amber-200";
    case "stalled": return "bg-destructive/15 text-destructive border-destructive/30";
    case "complete": return "bg-blue-500/15 text-blue-700 border-blue-200";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

// ── Main Dashboard Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
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
          <h1 className="text-3xl font-bold tracking-tight">Portfolio Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of all JABEEN projects across Royal Commission cities</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setNewProjectOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Project
            </Button>
          )}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Projects", value: stats?.total, icon: Building2, color: "text-muted-foreground" },
          { label: "In Progress", value: stats?.inProgress, icon: Activity, color: "text-blue-500" },
          { label: "Needs Attention", value: stats?.needsAttention, icon: AlertTriangle, color: "text-amber-500" },
          { label: "Completed", value: stats?.complete, icon: CheckCircle2, color: "text-emerald-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={cn("h-4 w-4", color)} />
            </CardHeader>
            <CardContent>
              <div className={cn("text-3xl font-bold", color !== "text-muted-foreground" && color)}>
                {statsLoading ? "—" : (value ?? 0)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Breakdown: By Category & By City ── */}
      {!statsLoading && ((stats?.byCategory?.length ?? 0) > 0 || (stats?.byCity?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(stats?.byCategory?.length ?? 0) > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">By Category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats!.byCategory.map(({ category, count }) => (
                  <div key={category} className="flex items-center justify-between text-sm">
                    <span className="truncate text-foreground">{category}</span>
                    <Badge variant="outline" className="ml-2 shrink-0 tabular-nums">{count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {(stats?.byCity?.length ?? 0) > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">By City</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats!.byCity.map(({ city, count }) => (
                  <div key={city} className="flex items-center justify-between text-sm">
                    <span className="truncate text-foreground">{city}</span>
                    <Badge variant="outline" className="ml-2 shrink-0 tabular-nums">{count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Projects Table ── */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-4 border-b bg-muted/10">
          <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
            <CardTitle className="text-lg">Project Directory</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search projects, investors…"
                className="pl-8 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[300px]">Project Name</TableHead>
                <TableHead>Investor</TableHead>
                <TableHead>City / Category</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Progress</TableHead>
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
                      <p>{search ? "No JABEEN projects match your search." : "No JABEEN projects yet."}</p>
                      {canCreate && !search && (
                        <Button size="sm" variant="outline" onClick={() => setNewProjectOpen(true)}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> Create the first project
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
                        {project.investor?.companyName || <span className="text-muted-foreground italic">Unassigned</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {project.city?.shortName && (
                          <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 bg-blue-500/10 text-blue-700 border-blue-200">
                            {project.city.shortName}
                          </Badge>
                        )}
                        {project.category?.name && (
                          <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 bg-muted text-muted-foreground">
                            {project.category.name}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm truncate max-w-[150px] inline-block" title={project.currentStage?.name}>
                        {project.currentStage?.name || "Initializing"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "uppercase tracking-wider text-[10px] font-bold px-2 py-0.5",
                          getStatusColor(project.derivedStatus),
                        )}
                      >
                        {project.derivedStatus.replace("-", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {project.constructionPct}%
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Dialog ── */}
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </div>
  );
}
