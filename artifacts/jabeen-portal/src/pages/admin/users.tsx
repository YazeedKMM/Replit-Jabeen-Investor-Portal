import { useState, useEffect, useMemo } from "react";
import type { TFunction } from "i18next";
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
  User,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { DgaContentCard } from "@/components/ui/dga-card";
import { DgaModal } from "@/components/ui/dga-modal";
import { DgaForm } from "@/components/ui/dga-form";
import { DgaTextField } from "@/components/ui/dga-text-field";
import { DgaDropdownField } from "@/components/ui/dga-fields";
import { DgaBrandButton, DgaSubmitButton } from "@/components/ui/dga-brand-button";
import { DgaTag, DgaStatusTag, DgaButton } from "platformscode-new-react";
import { Search, UserX, UserCheck, KeyRound, Loader2, Copy, Check, UserCog, ShieldOff, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const makeCreateUserSchema = (t: TFunction) => z.object({
  fullName: z.string().min(2, t("validation.nameRequired")),
  email: z.string().email(t("validation.invalidEmail")),
  companyName: z.string().min(2, t("validation.companyRequired")),
  title: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(["investor", "top-management", "project-manager", "administrator"]),
});
type CreateUserForm = z.infer<ReturnType<typeof makeCreateUserSchema>>;

const makeActivateSchemaAdmin = () => z.object({
  projectId: z.string().optional(),
});

const makeActivateSchemaPM = (t: TFunction) => z.object({
  projectId: z.string().min(1, t("validation.projectRequiredForPM")),
});

/**
 * Role → DgaTag variant. Roles are categorical, not severity, so don't borrow
 * warning/error chips. External party (investor) = neutral; internal staff
 * (administrator, project-manager, top-management) = info.
 */
function roleTagVariant(role: string): "neutral" | "info" {
  if (role === "investor") return "neutral";
  return "info";
}

/** User status → DgaStatusTag color. */
function userStatusColor(status: string): "neutral" | "green" | "yellow" {
  if (status === "active") return "green";
  if (status === "pending") return "yellow";
  return "neutral";
}

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

  const createUserSchema = useMemo(() => makeCreateUserSchema(t), [t]);
  const activateSchema = useMemo(() => (isPM ? makeActivateSchemaPM(t) : makeActivateSchemaAdmin()), [t, isPM]);

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      fullName: "", email: "", companyName: "", title: "", phone: "", role: "investor",
    },
  });

  const activateForm = useForm<{ projectId?: string }>({
    resolver: zodResolver(activateSchema),
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

  const roleOptions = [
    { label: t("roles.investor"), value: "investor" },
    { label: t("roles.project-manager"), value: "project-manager" },
    { label: t("roles.top-management"), value: "top-management" },
    { label: t("roles.administrator"), value: "administrator" },
  ];

  const projectOptions = [
    ...(!isPM ? [{ label: t("admin.users.activateDialog.noProjectLink"), value: "none" }] : []),
    ...(projects?.map((p) => ({ label: `${p.name} (${p.agreementNumber})`, value: String(p.id) })) ?? []),
  ];

  // Combine active + inactive for the "All" tab (exclude pending)
  const allUsers = [
    ...(activeUsersQuery.data ?? []),
    ...(inactiveUsersQuery.data ?? []),
  ];
  const pendingUsers = pendingUsersQuery.data ?? [];
  const isAllLoading = activeUsersQuery.isLoading || inactiveUsersQuery.isLoading;

  const createSubmit = form.handleSubmit(onCreateSubmit);
  const activateSubmit = activateForm.handleSubmit(handleActivateSubmit);

  const PasswordReveal = ({ pass }: { pass: string }) => (
    <div className="bg-muted p-4 rounded-md flex items-center justify-between border">
      <code className="font-mono text-lg font-medium">{pass}</code>
      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(pass)} aria-label={t("admin.users.copyPassword")}>
        {copied ? <Check className="h-4 w-4 text-blue-500" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </Button>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("admin.users.title")}</h1>
          <p className="text-muted-foreground">{t("admin.users.subtitle")}</p>
        </div>
        {isAdmin && (
          <DgaBrandButton label={t("admin.users.createUser")} onOnClick={() => setCreateDialogOpen(true)} />
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
          <DgaContentCard className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between gap-4 pb-4 border-b border-border">
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
                        <DgaTag variant={roleTagVariant(u.role)} size="sm" label={t(`roles.${u.role}`)} />
                      </TableCell>
                      <TableCell>
                        <DgaStatusTag color={userStatusColor(u.status)} status="subtle" size="sm" label={t(`admin.users.status${u.status.charAt(0).toUpperCase() + u.status.slice(1)}`)} />
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-end flex gap-2 justify-end">
                          {u.role === "project-manager" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setManageCitiesTarget(u); setManageCityIds([]); }}
                              title={t("admin.users.tooltipManageCities")}
                              aria-label={t("admin.users.tooltipManageCities")}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <MapPin className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleResetMfa(u)}
                            title={u.mfaEnabled ? t("admin.users.tooltipResetMfa") : t("admin.users.tooltipMfaNotEnabled")}
                            aria-label={u.mfaEnabled ? t("admin.users.tooltipResetMfa") : t("admin.users.tooltipMfaNotEnabled")}
                            className={u.mfaEnabled ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-muted-foreground/40 cursor-default"}
                          >
                            <ShieldOff className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleResetPassword(u)} title={t("admin.users.tooltipResetPassword")} aria-label={t("admin.users.tooltipResetPassword")}>
                            <KeyRound className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(u)} title={u.status === "active" ? t("admin.users.tooltipDeactivate") : t("admin.users.tooltipActivate")} aria-label={u.status === "active" ? t("admin.users.tooltipDeactivate") : t("admin.users.tooltipActivate")}>
                            {u.status === "active" ? <UserX className="h-4 w-4 text-destructive" aria-hidden="true" /> : <UserCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DgaContentCard>
        </TabsContent>

        {/* ─── Pending Activation Tab ────────────────────────────── */}
        <TabsContent value="pending">
          <DgaContentCard className="overflow-hidden">
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
                        <UserCheck className="h-8 w-8 text-blue-500/50" />
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
                        <div className="text-sm text-muted-foreground">{fmtDate(u.createdAt)}</div>
                      </TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" onClick={() => { setActivateTarget(u); activateForm.reset(); }}>
                          <UserCog className="h-4 w-4 me-2" /> {t("admin.users.activateButton")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DgaContentCard>
        </TabsContent>
      </Tabs>

      {/* ─── Create User Modal (dual state: form / temp-password reveal) ─── */}
      {isAdmin && (
        <DgaModal
          open={createDialogOpen}
          onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) { setSelectedCityIds([]); form.reset(); setCreatedUserTempPassword(null); } }}
          title={createdUserTempPassword ? t("admin.users.createdDialog.title") : t("admin.users.createDialog.title")}
          footer={
            createdUserTempPassword ? (
              <div className="flex justify-end">
                <DgaButton variant="secondary" label={t("common.close")} onOnClick={() => { setCreatedUserTempPassword(null); setCreateDialogOpen(false); }} />
              </div>
            ) : (
              <div className="flex gap-3 justify-end">
                <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={() => setCreateDialogOpen(false)} />
                <DgaSubmitButton
                  onSubmit={createSubmit}
                  loading={form.formState.isSubmitting}
                  loadingLabel={t("common.loading")}
                  label={t("admin.users.createDialog.submitCreate")}
                />
              </div>
            )
          }
        >
          {createdUserTempPassword ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("admin.users.createdDialog.description", { name: createdUserTempPassword.name })}</p>
              <PasswordReveal pass={createdUserTempPassword.pass} />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">{t("admin.users.createDialog.description")}</p>
              <DgaForm onSubmit={createSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <DgaTextField control={form.control} name="fullName" label={t("admin.users.createDialog.fieldFullName")} required />
                  <DgaTextField control={form.control} name="email" label={t("admin.users.createDialog.fieldEmail")} required />
                  <DgaTextField control={form.control} name="companyName" label={t("admin.users.createDialog.fieldCompany")} required />
                  <DgaDropdownField control={form.control} name="role" label={t("admin.users.createDialog.fieldRole")} placeholder={t("admin.users.createDialog.fieldRolePlaceholder")} options={roleOptions} />
                  <DgaTextField control={form.control} name="title" label={t("admin.users.createDialog.fieldJobTitle")} />
                  <DgaTextField control={form.control} name="phone" label={t("admin.users.createDialog.fieldPhone")} />
                </div>
                {watchedRole === "project-manager" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("admin.users.createDialog.assignedCities")}</label>
                    <div className="grid grid-cols-2 gap-2" data-testid="pm-cities">
                      {allCities.filter((c) => c.enabled).map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={selectedCityIds.includes(c.id)}
                            onCheckedChange={(v) => setSelectedCityIds((prev) => v ? [...prev, c.id] : prev.filter((id) => id !== c.id))}
                            data-testid={`city-checkbox-${c.code}`}
                          />
                          {c.shortName}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </DgaForm>
            </>
          )}
        </DgaModal>
      )}

      {/* ─── Activate Account Modal ─────────────────────────────── */}
      <DgaModal
        open={!!activateTarget}
        onOpenChange={(open) => { if (!open) { setActivateTarget(null); activateForm.reset(); } }}
        title={t("admin.users.activateDialog.title")}
        footer={
          <div className="flex gap-3 justify-end">
            <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={() => { setActivateTarget(null); activateForm.reset(); }} />
            <DgaSubmitButton
              onSubmit={activateSubmit}
              loading={activateUser.isPending}
              loadingLabel={t("common.loading")}
              label={t("admin.users.activateDialog.submitActivate")}
            />
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          {t("admin.users.activateDialog.description", { name: activateTarget?.fullName ?? "", email: activateTarget?.email ?? "", company: activateTarget?.companyName ?? "" })}
          {activateTarget?.role === "investor" && (isPM ? t("admin.users.activateDialog.descriptionInvestorPM") : t("admin.users.activateDialog.descriptionInvestorAdmin"))}
        </p>
        {activateTarget?.role === "investor" && (
          <DgaForm onSubmit={activateSubmit} className="space-y-4">
            <DgaDropdownField
              control={activateForm.control}
              name="projectId"
              label={isPM ? `${t("admin.users.activateDialog.linkToProject")} ${t("admin.users.activateDialog.linkRequired")}` : `${t("admin.users.activateDialog.linkToProject")} ${t("admin.users.activateDialog.linkOptional")}`}
              placeholder={t("admin.users.activateDialog.selectProject")}
              options={projectOptions}
            />
          </DgaForm>
        )}
      </DgaModal>

      {/* ─── Manage PM Cities Modal ─────────────────────────────── */}
      <DgaModal
        open={!!manageCitiesTarget}
        onOpenChange={(open) => { if (!open) { setManageCitiesTarget(null); setManageCityIds([]); } }}
        title={t("admin.users.manageCitiesDialog.title")}
        footer={
          <div className="flex gap-3 justify-end">
            <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={() => { setManageCitiesTarget(null); setManageCityIds([]); }} />
            <DgaSubmitButton
              onSubmit={handleManageCitiesSubmit}
              loading={setUserCities.isPending}
              loadingLabel={t("common.loading")}
              label={t("admin.users.manageCitiesDialog.saveCities")}
            />
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">{t("admin.users.manageCitiesDialog.description", { name: manageCitiesTarget?.fullName ?? "" })}</p>
        <div className="grid grid-cols-2 gap-2" data-testid="pm-cities-edit">
          {allCities.filter((c) => c.enabled).map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={manageCityIds.includes(c.id)}
                onCheckedChange={(v) => setManageCityIds((prev) => v ? [...prev, c.id] : prev.filter((id) => id !== c.id))}
                data-testid={`city-checkbox-edit-${c.code}`}
              />
              {c.shortName}
            </label>
          ))}
        </div>
      </DgaModal>

      {/* ─── Password modal for reset (create flow reuses the create modal) ─── */}
      <DgaModal
        open={!!createdUserTempPassword && !createDialogOpen}
        onOpenChange={(open) => !open && setCreatedUserTempPassword(null)}
        title={t("admin.users.passwordResetDialog.title")}
        footer={
          <div className="flex justify-end">
            <DgaBrandButton label={t("admin.users.passwordResetDialog.done")} onOnClick={() => setCreatedUserTempPassword(null)} />
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">{t("admin.users.passwordResetDialog.description", { name: createdUserTempPassword?.name ?? "" })}</p>
        {createdUserTempPassword && <PasswordReveal pass={createdUserTempPassword.pass} />}
      </DgaModal>
    </div>
  );
}
