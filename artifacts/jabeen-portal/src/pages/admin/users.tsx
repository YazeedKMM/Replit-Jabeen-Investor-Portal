import { useState, useEffect } from "react";
import { fmtDate } from "@/lib/format";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useResetUserPassword,
  useResetUserMfa,
  useActivateUser,
  useListProjects,
  useGetCities,
  useGetUserCities,
  useSetUserCities,
  getListUsersQueryKey,
  getListProjectsQueryKey,
  getGetUserCitiesQueryKey,
  UserRole,
  User,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, UserX, UserCheck, KeyRound, Loader2, Copy, Check, UserCog, Clock, ShieldOff, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const createUserSchema = z.object({
  fullName: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email"),
  companyName: z.string().min(2, "Company is required"),
  title: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(["investor", "top-management", "project-manager", "administrator"]),
});

const activateSchemaAdmin = z.object({
  projectId: z.string().optional(),
});

const activateSchemaPM = z.object({
  projectId: z.string().min(1, "Project is required for Project Manager activation"),
});

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();
  const isAdmin = currentUser?.role === "administrator";
  const isPM = currentUser?.role === "project-manager";

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdUserTempPassword, setCreatedUserTempPassword] = useState<{name: string, pass: string} | null>(null);
  const [copied, setCopied] = useState(false);
  const [activateTarget, setActivateTarget] = useState<User | null>(null);
  const [selectedCityIds, setSelectedCityIds] = useState<number[]>([]);
  const [manageCitiesTarget, setManageCitiesTarget] = useState<User | null>(null);
  const [manageCityIds, setManageCityIds] = useState<number[]>([]);

  const activeUsersQuery = useListUsers(
    { search: search || undefined, role: roleFilter !== "all" ? roleFilter as any : undefined, status: "active" as any },
    { query: { queryKey: getListUsersQueryKey({ search: search || undefined, role: roleFilter !== "all" ? roleFilter as any : undefined, status: "active" as any }) } }
  );

  const inactiveUsersQuery = useListUsers(
    { search: search || undefined, role: roleFilter !== "all" ? roleFilter as any : undefined, status: "inactive" as any },
    { query: { queryKey: getListUsersQueryKey({ search: search || undefined, role: roleFilter !== "all" ? roleFilter as any : undefined, status: "inactive" as any }) } }
  );

  // PMs only see investor pending accounts (backend enforces this too, but filter here for clarity)
  const pendingUsersQuery = useListUsers(
    { status: "pending" as any, role: isPM ? ("investor" as any) : undefined },
    { query: { queryKey: getListUsersQueryKey({ status: "pending" as any, role: isPM ? ("investor" as any) : undefined }) } }
  );

  const { data: projects } = useListProjects(
    undefined,
    { query: { queryKey: getListProjectsQueryKey(), enabled: !!activateTarget } }
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();
  const resetMfa = useResetUserMfa();
  const activateUser = useActivateUser();
  const setUserCities = useSetUserCities();
  const { data: allCities = [] } = useGetCities();

  const form = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      fullName: "", email: "", companyName: "", title: "", phone: "", role: "investor",
    },
  });

  const activateForm = useForm<{ projectId?: string }>({
    resolver: zodResolver(isPM ? activateSchemaPM : activateSchemaAdmin),
    defaultValues: { projectId: "" },
  });

  const watchedRole = form.watch("role");

  // Fetch existing city assignments when the manage-cities dialog is open for a PM
  const { data: manageCityData } = useGetUserCities(
    manageCitiesTarget?.id ?? 0,
    { query: { queryKey: getGetUserCitiesQueryKey(manageCitiesTarget?.id ?? 0), enabled: !!manageCitiesTarget && manageCitiesTarget.role === "project-manager" } }
  );

  // Prefill manageCityIds when data loads
  useEffect(() => {
    if (manageCityData) {
      setManageCityIds(manageCityData);
    }
  }, [manageCityData]);

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
  };

  const onCreateSubmit = async (data: z.infer<typeof createUserSchema>) => {
    try {
      const res = await createUser.mutateAsync({ data });
      invalidateUsers();
      if (data.role === "project-manager") {
        try {
          await setUserCities.mutateAsync({ userId: res.user.id, data: { cityIds: selectedCityIds } });
          queryClient.invalidateQueries({ queryKey: getGetUserCitiesQueryKey(res.user.id) });
        } catch (cityError: any) {
          toast({ title: t("admin.users.toast.cityAssignFailed"), description: cityError.data?.message || t("admin.users.toast.citiesFailed"), variant: "destructive" });
        }
      }
      setSelectedCityIds([]);
      setCreatedUserTempPassword({ name: res.user.fullName, pass: res.temporaryPassword });
      form.reset();
    } catch (error: any) {
      toast({ title: t("admin.users.toast.createFailed"), description: error.data?.message || t("common.loading"), variant: "destructive" });
    }
  };

  const handleManageCitiesSubmit = async () => {
    if (!manageCitiesTarget) return;
    try {
      await setUserCities.mutateAsync({ userId: manageCitiesTarget.id, data: { cityIds: manageCityIds } });
      queryClient.invalidateQueries({ queryKey: getGetUserCitiesQueryKey(manageCitiesTarget.id) });
      toast({ title: t("admin.users.toast.citiesUpdated"), description: t("admin.users.toast.citiesUpdatedDesc", { name: manageCitiesTarget.fullName }) });
      setManageCitiesTarget(null);
      setManageCityIds([]);
    } catch (error: any) {
      toast({ title: t("admin.users.toast.citiesFailed"), description: error.data?.message || t("admin.users.toast.citiesFailed"), variant: "destructive" });
    }
  };

  const handleToggleStatus = async (u: User) => {
    const newStatus = u.status === "active" ? "inactive" : "active";
    try {
      await updateUser.mutateAsync({ userId: u.id, data: { status: newStatus as any } });
      invalidateUsers();
      toast({ title: t("admin.users.toast.statusUpdated"), description: t("admin.users.toast.statusUpdatedDesc", { name: u.fullName, status: newStatus }) });
    } catch (error) {
      toast({ title: t("admin.users.toast.error"), description: t("admin.users.toast.statusFailed"), variant: "destructive" });
    }
  };

  const handleResetPassword = async (u: User) => {
    if (!confirm(t("admin.users.confirmResetPassword", { name: u.fullName }))) return;
    try {
      const res = await resetPassword.mutateAsync({ userId: u.id });
      setCreatedUserTempPassword({ name: u.fullName, pass: res.temporaryPassword });
    } catch (error) {
      toast({ title: t("admin.users.toast.error"), description: t("admin.users.toast.passwordResetFailed"), variant: "destructive" });
    }
  };

  const handleResetMfa = async (u: User) => {
    if (!u.mfaEnabled) {
      toast({ title: t("admin.users.toast.mfaNotEnabled"), description: t("admin.users.toast.mfaNotEnabledDesc", { name: u.fullName }) });
      return;
    }
    if (!confirm(t("admin.users.confirmResetMfa", { name: u.fullName }))) return;
    try {
      await resetMfa.mutateAsync({ userId: u.id });
      invalidateUsers();
      toast({ title: t("admin.users.toast.mfaReset"), description: t("admin.users.toast.mfaResetDesc", { name: u.fullName }) });
    } catch (error) {
      toast({ title: t("admin.users.toast.error"), description: t("admin.users.toast.mfaResetFailed"), variant: "destructive" });
    }
  };

  const handleActivateSubmit = async (data: { projectId?: string }) => {
    if (!activateTarget) return;
    try {
      await activateUser.mutateAsync({
        userId: activateTarget.id,
        data: data.projectId && data.projectId !== "none" ? { projectId: parseInt(data.projectId) } : undefined,
      });
      invalidateUsers();
      toast({ title: t("admin.users.toast.activated"), description: t("admin.users.toast.activatedDesc", { name: activateTarget.fullName }) });
      setActivateTarget(null);
      activateForm.reset();
    } catch (error: any) {
      toast({ title: t("admin.users.toast.activationFailed"), description: error.data?.message || t("common.loading"), variant: "destructive" });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'administrator': return 'bg-purple-500/15 text-purple-700 border-purple-200';
      case 'top-management': return 'bg-blue-500/15 text-blue-700 border-blue-200';
      case 'project-manager': return 'bg-emerald-500/15 text-emerald-700 border-emerald-200';
      case 'investor': return 'bg-amber-500/15 text-amber-700 border-amber-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{t("admin.users.statusActive")}</Badge>;
      case 'inactive': return <Badge variant="outline" className="bg-muted text-muted-foreground">{t("admin.users.statusInactive")}</Badge>;
      case 'pending': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="h-3 w-3 me-1" />{t("admin.users.statusPending")}</Badge>;
      default: return null;
    }
  };

  // Combine active + inactive for the "All" tab (exclude pending)
  const allUsers = [
    ...(activeUsersQuery.data ?? []),
    ...(inactiveUsersQuery.data ?? []),
  ];
  const pendingUsers = pendingUsersQuery.data ?? [];
  const isAllLoading = activeUsersQuery.isLoading || inactiveUsersQuery.isLoading;

  // Investors without an assigned project (for linking during activation)
  const unassignedProjects = projects?.filter(p => !p.investor) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("admin.users.title")}</h1>
          <p className="text-muted-foreground">{t("admin.users.subtitle")}</p>
        </div>

        {isAdmin && (
          <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) { setSelectedCityIds([]); form.reset(); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="me-2 h-4 w-4" /> {t("admin.users.createUser")}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              {createdUserTempPassword ? (
                <div className="space-y-6">
                  <DialogHeader>
                    <DialogTitle>{t("admin.users.createdDialog.title")}</DialogTitle>
                    <DialogDescription>
                      {t("admin.users.createdDialog.description", { name: createdUserTempPassword.name })}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="bg-muted p-4 rounded-md flex items-center justify-between border">
                    <code className="font-mono text-lg font-medium">{createdUserTempPassword.pass}</code>
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(createdUserTempPassword.pass)}>
                      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => { setCreatedUserTempPassword(null); setCreateDialogOpen(false); }}>{t("common.close")}</Button>
                  </DialogFooter>
                </div>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>{t("admin.users.createDialog.title")}</DialogTitle>
                    <DialogDescription>{t("admin.users.createDialog.description")}</DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="fullName" render={({ field }) => (
                          <FormItem><FormLabel>{t("admin.users.createDialog.fieldFullName")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="email" render={({ field }) => (
                          <FormItem><FormLabel>{t("admin.users.createDialog.fieldEmail")}</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="companyName" render={({ field }) => (
                          <FormItem><FormLabel>{t("admin.users.createDialog.fieldCompany")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="role" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("admin.users.createDialog.fieldRole")}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder={t("admin.users.createDialog.fieldRolePlaceholder")} /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="investor">{t("roles.investor")}</SelectItem>
                                <SelectItem value="project-manager">{t("roles.project-manager")}</SelectItem>
                                <SelectItem value="top-management">{t("roles.top-management")}</SelectItem>
                                <SelectItem value="administrator">{t("roles.administrator")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="title" render={({ field }) => (
                          <FormItem><FormLabel>{t("admin.users.createDialog.fieldJobTitle")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="phone" render={({ field }) => (
                          <FormItem><FormLabel>{t("admin.users.createDialog.fieldPhone")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      {watchedRole === "project-manager" && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("admin.users.createDialog.assignedCities")}</label>
                          <div className="grid grid-cols-2 gap-2" data-testid="pm-cities">
                            {allCities.filter((c) => c.enabled).map((c) => {
                              const checked = selectedCityIds.includes(c.id);
                              return (
                                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) =>
                                      setSelectedCityIds((prev) =>
                                        v ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                                      )
                                    }
                                    data-testid={`city-checkbox-${c.code}`}
                                  />
                                  {c.shortName}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <DialogFooter className="pt-4">
                        <Button variant="outline" type="button" onClick={() => setCreateDialogOpen(false)}>{t("common.cancel")}</Button>
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                          {form.formState.isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                          {t("admin.users.createDialog.submitCreate")}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">{t("admin.users.tabAll")}</TabsTrigger>
          <TabsTrigger value="pending" className="relative">
            {t("admin.users.tabPending")}
            {pendingUsers.length > 0 && (
              <span className="ms-2 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold h-5 min-w-5 px-1.5">
                {pendingUsers.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── All Users Tab ─────────────────────────────────────── */}
        <TabsContent value="all">
          <Card>
            <CardHeader className="pb-4 border-b bg-muted/10">
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder={t("admin.users.searchPlaceholder")}
                    className="ps-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t("admin.users.filterByRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.users.allRoles")}</SelectItem>
                    <SelectItem value="investor">{t("roles.investor")}</SelectItem>
                    <SelectItem value="project-manager">{t("roles.project-manager")}</SelectItem>
                    <SelectItem value="top-management">{t("roles.top-management")}</SelectItem>
                    <SelectItem value="administrator">{t("roles.administrator")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.users.colUser")}</TableHead>
                    <TableHead>{t("admin.users.colCompany")}</TableHead>
                    <TableHead>{t("admin.users.colRole")}</TableHead>
                    <TableHead>{t("admin.users.colStatus")}</TableHead>
                    {isAdmin && <TableHead className="text-end">{t("admin.users.colActions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isAllLoading ? (
                    <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : !allUsers.length ? (
                    <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="h-24 text-center text-muted-foreground">{t("admin.users.noUsersFound")}</TableCell></TableRow>
                  ) : (
                    allUsers.map(u => (
                      <TableRow key={u.id} className={u.status === "inactive" ? "bg-muted/50" : ""}>
                        <TableCell>
                          <div className="font-medium text-foreground">{u.fullName}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{u.companyName}</div>
                          <div className="text-xs text-muted-foreground">{u.title || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getRoleColor(u.role)}>
                            {t(`roles.${u.role}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(u.status)}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-end flex gap-2 justify-end">
                            {u.role === "project-manager" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setManageCitiesTarget(u); setManageCityIds([]); }}
                                title={t("admin.users.tooltipManageCities")}
                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              >
                                <MapPin className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleResetMfa(u)}
                              title={u.mfaEnabled ? t("admin.users.tooltipResetMfa") : t("admin.users.tooltipMfaNotEnabled")}
                              className={u.mfaEnabled ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-muted-foreground/40 cursor-default"}
                            >
                              <ShieldOff className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleResetPassword(u)} title={t("admin.users.tooltipResetPassword")}>
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(u)} title={u.status === "active" ? t("admin.users.tooltipDeactivate") : t("admin.users.tooltipActivate")}>
                              {u.status === "active" ? <UserX className="h-4 w-4 text-destructive" /> : <UserCheck className="h-4 w-4 text-emerald-600" />}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Pending Activation Tab ────────────────────────────── */}
        <TabsContent value="pending">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.users.colApplicant")}</TableHead>
                    <TableHead>{t("admin.users.colCompany")}</TableHead>
                    <TableHead>{t("admin.users.colRegistered")}</TableHead>
                    <TableHead className="text-end">{t("admin.users.colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsersQuery.isLoading ? (
                    <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : !pendingUsers.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <UserCheck className="h-8 w-8 text-emerald-500/50" />
                          <p>{t("admin.users.noPendingAccounts")}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingUsers.map(u => (
                      <TableRow key={u.id} className="bg-amber-50/30 dark:bg-amber-950/10">
                        <TableCell>
                          <div className="font-medium text-foreground">{u.fullName}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{u.companyName}</div>
                          <div className="text-xs text-muted-foreground">{u.title || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {fmtDate(u.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell className="text-end">
                          <Button
                            size="sm"
                            onClick={() => { setActivateTarget(u); activateForm.reset(); }}
                          >
                            <UserCog className="h-4 w-4 me-2" /> {t("admin.users.activateButton")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Activate Account Modal ─────────────────────────────── */}
      <Dialog open={!!activateTarget} onOpenChange={(open) => { if (!open) { setActivateTarget(null); activateForm.reset(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t("admin.users.activateDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.users.activateDialog.description", { name: activateTarget?.fullName ?? "", email: activateTarget?.email ?? "", company: activateTarget?.companyName ?? "" })}
              {activateTarget?.role === "investor" && (isPM ? t("admin.users.activateDialog.descriptionInvestorPM") : t("admin.users.activateDialog.descriptionInvestorAdmin"))}
            </DialogDescription>
          </DialogHeader>
          <Form {...activateForm}>
            <form onSubmit={activateForm.handleSubmit(handleActivateSubmit)} className="space-y-4 pt-2">
              {activateTarget?.role === "investor" && (
                <FormField control={activateForm.control} name="projectId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin.users.activateDialog.linkToProject")}{" "}
                      {isPM
                        ? <span className="text-destructive font-normal">{t("admin.users.activateDialog.linkRequired")}</span>
                        : <span className="text-muted-foreground font-normal">{t("admin.users.activateDialog.linkOptional")}</span>
                      }
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("admin.users.activateDialog.selectProject")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {!isPM && <SelectItem value="none">{t("admin.users.activateDialog.noProjectLink")}</SelectItem>}
                        {projects?.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name} <span className="text-muted-foreground ms-1">({p.agreementNumber})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <DialogFooter className="pt-4">
                <Button variant="outline" type="button" onClick={() => { setActivateTarget(null); activateForm.reset(); }}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={activateUser.isPending}>
                  {activateUser.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t("admin.users.activateDialog.submitActivate")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ─── Manage PM Cities Modal ─────────────────────────────── */}
      <Dialog open={!!manageCitiesTarget} onOpenChange={(open) => { if (!open) { setManageCitiesTarget(null); setManageCityIds([]); } }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t("admin.users.manageCitiesDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.users.manageCitiesDialog.description", { name: manageCitiesTarget?.fullName ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div className="grid grid-cols-2 gap-2" data-testid="pm-cities-edit">
              {allCities.filter((c) => c.enabled).map((c) => {
                const checked = manageCityIds.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setManageCityIds((prev) =>
                          v ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                        )
                      }
                      data-testid={`city-checkbox-edit-${c.code}`}
                    />
                    {c.shortName}
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setManageCitiesTarget(null); setManageCityIds([]); }}>{t("common.cancel")}</Button>
            <Button onClick={handleManageCitiesSubmit} disabled={setUserCities.isPending}>
              {setUserCities.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("admin.users.manageCitiesDialog.saveCities")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Password modal for reset / create ─────────────────── */}
      <Dialog open={!!createdUserTempPassword && !createDialogOpen} onOpenChange={(open) => !open && setCreatedUserTempPassword(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("admin.users.passwordResetDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.users.passwordResetDialog.description", { name: createdUserTempPassword?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-md flex items-center justify-between border">
            <code className="font-mono text-lg font-medium">{createdUserTempPassword?.pass}</code>
            <Button variant="ghost" size="icon" onClick={() => createdUserTempPassword && copyToClipboard(createdUserTempPassword.pass)}>
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedUserTempPassword(null)}>{t("admin.users.passwordResetDialog.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
