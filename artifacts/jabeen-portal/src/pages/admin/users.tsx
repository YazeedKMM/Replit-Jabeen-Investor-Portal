import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import {
  useListUsers, useCreateUser, useUpdateUser, useResetUserPassword,
  useResetUserMfa, useActivateUser, useListProjects, useGetCities,
  useGetUserCities, useSetUserCities,
  getListUsersQueryKey, getListProjectsQueryKey, getGetUserCitiesQueryKey,
  type User, type UserInput, type UserUpdate, type ListUsersParams,
} from "@workspace/api-client-react";
import { useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import {
  Check, Copy, KeyRound, MapPin, MoreHorizontal, Plus, Search,
  ShieldOff, UserCheck, UserCog, Users as UsersIcon, UserX,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiErrorMessage } from "@/lib/api-error";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Schemas ──────────────────────────────────────────────────────────────────
const makeCreateUserSchema = (t: TFunction) => z.object({
  fullName: z.string().min(2, t("validation.nameRequired")),
  email: z.string().email(t("validation.invalidEmail")),
  companyName: z.string().min(2, t("validation.companyRequired")),
  title: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(["investor", "top-management", "project-manager", "administrator"]),
});
type CreateUserForm = z.infer<ReturnType<typeof makeCreateUserSchema>>;

// projectId is Select-fed: for a PM activator it is required, so the Select must
// emit a real value or trip the localized required message. Admins get a "none" option.
const makeActivateSchema = (t: TFunction, isPM: boolean) => z.object({
  projectId: isPM
    ? z.string().min(1, t("validation.projectRequiredForPM"))
    : z.string().optional(),
});
type ActivateForm = { projectId?: string };

// ── Account badges (tinted fills per DESIGN.md — account status vocabulary is
// distinct from the derived project StatusBadge, so these are local) ──────────
function RoleBadge({ role }: { role: User["role"] }) {
  const { t } = useTranslation();
  // Roles are categorical: external party (investor) reads neutral; internal
  // staff read as an informational (secondary) chip.
  const staff = role !== "investor";
  return (
    <span className={cn(
      "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
      staff ? "bg-secondary/10 text-foreground" : "bg-muted text-muted-foreground",
    )}>
      {t(`roles.${role}`)}
    </span>
  );
}

function StatusBadge({ status }: { status: User["status"] }) {
  const { t } = useTranslation();
  const tint =
    status === "active" ? "bg-success/15 text-foreground"
    : status === "pending" ? "bg-warning/20 text-foreground"
    : "bg-muted text-muted-foreground";
  const label =
    status === "active" ? t("admin.users.statusActive")
    : status === "pending" ? t("admin.users.statusPending")
    : t("admin.users.statusInactive");
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", tint)}>
      {label}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = currentUser?.role === "administrator";
  const isPM = currentUser?.role === "project-manager";

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ name: string; pass: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [activateTarget, setActivateTarget] = useState<User | null>(null);
  const [selectedCityIds, setSelectedCityIds] = useState<number[]>([]);
  const [manageCitiesTarget, setManageCitiesTarget] = useState<User | null>(null);
  const [manageCityIds, setManageCityIds] = useState<number[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ kind: "deactivate" | "resetPassword" | "resetMfa"; user: User } | null>(null);

  // Debounce the search box so the list queries don't fire per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const roleParam = roleFilter !== "all" ? (roleFilter as ListUsersParams["role"]) : undefined;
  const activeParams: ListUsersParams = { search: search || undefined, role: roleParam, status: "active" };
  const inactiveParams: ListUsersParams = { search: search || undefined, role: roleParam, status: "inactive" };
  // PMs only see investor pending accounts (backend enforces this too).
  const pendingParams: ListUsersParams = { status: "pending", role: isPM ? "investor" : undefined };

  const activeUsersQuery = useListUsers(activeParams, { query: { queryKey: getListUsersQueryKey(activeParams), placeholderData: keepPreviousData } });
  const inactiveUsersQuery = useListUsers(inactiveParams, { query: { queryKey: getListUsersQueryKey(inactiveParams), placeholderData: keepPreviousData } });
  const pendingUsersQuery = useListUsers(pendingParams, { query: { queryKey: getListUsersQueryKey(pendingParams) } });

  const { data: projects } = useListProjects(undefined, { query: { queryKey: getListProjectsQueryKey(), enabled: !!activateTarget } });
  const { data: allCities = [] } = useGetCities();

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();
  const resetMfa = useResetUserMfa();
  const activateUser = useActivateUser();
  const setUserCities = useSetUserCities();

  const createUserSchema = useMemo(() => makeCreateUserSchema(t), [t]);
  const activateSchema = useMemo(() => makeActivateSchema(t, isPM), [t, isPM]);

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { fullName: "", email: "", companyName: "", title: "", phone: "", role: "investor" },
  });
  const activateForm = useForm<ActivateForm>({
    resolver: zodResolver(activateSchema),
    defaultValues: { projectId: "" },
  });
  const watchedRole = form.watch("role");

  // Fetch existing city assignments when the manage-cities dialog opens for a PM.
  const { data: manageCityData } = useGetUserCities(
    manageCitiesTarget?.id ?? 0,
    { query: { queryKey: getGetUserCitiesQueryKey(manageCitiesTarget?.id ?? 0), enabled: !!manageCitiesTarget && manageCitiesTarget.role === "project-manager" } },
  );
  useEffect(() => { if (manageCityData) setManageCityIds(manageCityData); }, [manageCityData]);

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ["/api/users"] });

  const onCreateSubmit = async (data: CreateUserForm) => {
    try {
      const res = await createUser.mutateAsync({ data: data as UserInput });
      invalidateUsers();
      if (data.role === "project-manager") {
        try {
          await setUserCities.mutateAsync({ userId: res.user.id, data: { cityIds: selectedCityIds } });
          queryClient.invalidateQueries({ queryKey: getGetUserCitiesQueryKey(res.user.id) });
        } catch (cityError: unknown) {
          toast({ title: t("admin.users.toast.cityAssignFailed"), description: apiErrorMessage(cityError, t("admin.users.toast.citiesFailed")), variant: "destructive" });
        }
      }
      setSelectedCityIds([]);
      setTempPassword({ name: res.user.fullName, pass: res.temporaryPassword });
      form.reset();
    } catch (error: unknown) {
      toast({ title: t("admin.users.toast.createFailed"), description: apiErrorMessage(error, t("common.somethingWrong")), variant: "destructive" });
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
    } catch (error: unknown) {
      toast({ title: t("admin.users.toast.citiesFailed"), description: apiErrorMessage(error, t("admin.users.toast.citiesFailed")), variant: "destructive" });
    }
  };

  const handleToggleStatus = async (u: User) => {
    const newStatus = u.status === "active" ? "inactive" : "active";
    try {
      await updateUser.mutateAsync({ userId: u.id, data: { status: newStatus } as UserUpdate });
      invalidateUsers();
      toast({ title: t("admin.users.toast.statusUpdated"), description: t("admin.users.toast.statusUpdatedDesc", { name: u.fullName, status: t(`admin.users.status${newStatus === "active" ? "Active" : "Inactive"}`) }) });
    } catch (error: unknown) {
      toast({ title: t("admin.users.toast.error"), description: apiErrorMessage(error, t("admin.users.toast.statusFailed")), variant: "destructive" });
    }
  };

  const handleResetPassword = async (u: User) => {
    try {
      const res = await resetPassword.mutateAsync({ userId: u.id });
      setTempPassword({ name: u.fullName, pass: res.temporaryPassword });
    } catch (error: unknown) {
      toast({ title: t("admin.users.toast.error"), description: apiErrorMessage(error, t("admin.users.toast.passwordResetFailed")), variant: "destructive" });
    }
  };

  const handleResetMfa = async (u: User) => {
    try {
      await resetMfa.mutateAsync({ userId: u.id });
      invalidateUsers();
      toast({ title: t("admin.users.toast.mfaReset"), description: t("admin.users.toast.mfaResetDesc", { name: u.fullName }) });
    } catch (error: unknown) {
      toast({ title: t("admin.users.toast.error"), description: apiErrorMessage(error, t("admin.users.toast.mfaResetFailed")), variant: "destructive" });
    }
  };

  const handleActivateSubmit = async (data: ActivateForm) => {
    if (!activateTarget) return;
    try {
      await activateUser.mutateAsync({
        userId: activateTarget.id,
        data: data.projectId && data.projectId !== "none" ? { projectId: parseInt(data.projectId, 10) } : undefined,
      });
      invalidateUsers();
      toast({ title: t("admin.users.toast.activated"), description: t("admin.users.toast.activatedDesc", { name: activateTarget.fullName }) });
      setActivateTarget(null);
      activateForm.reset();
    } catch (error: unknown) {
      toast({ title: t("admin.users.toast.activationFailed"), description: apiErrorMessage(error, t("common.somethingWrong")), variant: "destructive" });
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

  const allUsers = [...(activeUsersQuery.data ?? []), ...(inactiveUsersQuery.data ?? [])];
  const pendingUsers = pendingUsersQuery.data ?? [];
  const isAllLoading = activeUsersQuery.isLoading || inactiveUsersQuery.isLoading;
  const allColSpan = isAdmin ? 5 : 4;

  const confirmMeta = confirmAction && {
    deactivate: {
      title: t("admin.users.confirm.deactivateTitle"),
      desc: t("admin.users.confirm.deactivateDesc", { name: confirmAction.user.fullName }),
      confirmLabel: t("admin.users.confirm.deactivateConfirm"),
      destructive: true,
      run: () => handleToggleStatus(confirmAction.user),
    },
    resetPassword: {
      title: t("admin.users.confirm.resetPasswordTitle"),
      desc: t("admin.users.confirmResetPassword", { name: confirmAction.user.fullName }),
      confirmLabel: t("admin.users.confirm.resetPasswordConfirm"),
      destructive: false,
      run: () => handleResetPassword(confirmAction.user),
    },
    resetMfa: {
      title: t("admin.users.confirm.resetMfaTitle"),
      desc: t("admin.users.confirmResetMfa", { name: confirmAction.user.fullName }),
      confirmLabel: t("admin.users.confirm.resetMfaConfirm"),
      destructive: true,
      run: () => handleResetMfa(confirmAction.user),
    },
  }[confirmAction.kind];

  const PasswordReveal = ({ pass }: { pass: string }) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted p-4">
      <code className="font-mono text-lg font-medium tracking-wide text-foreground" dir="ltr">{pass}</code>
      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(pass)} aria-label={t("admin.users.copyPassword")}>
        {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </Button>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">{t("admin.users.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.users.subtitle")}</p>
        </div>
        {isAdmin && (
          <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="me-2 h-4 w-4" aria-hidden="true" /> {t("admin.users.createUser")}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "pending")}>
        <TabsList>
          <TabsTrigger value="all">{t("admin.users.tabAll")}</TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            {t("admin.users.tabPending")}
            {pendingUsers.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 px-1.5 text-xs font-semibold tabular-nums text-foreground">
                {pendingUsers.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── All users ── */}
        <TabsContent value="all" className="mt-4">
          <section className="rounded-xl border border-card-border bg-card">
            <div className="flex flex-col gap-3 border-b border-card-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  placeholder={t("admin.users.searchPlaceholder")}
                  aria-label={t("admin.users.searchPlaceholder")}
                  className="bg-background ps-9"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
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
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-5">{t("admin.users.colUser")}</TableHead>
                  <TableHead>{t("admin.users.colCompany")}</TableHead>
                  <TableHead>{t("admin.users.colRole")}</TableHead>
                  <TableHead>{t("admin.users.colStatus")}</TableHead>
                  {isAdmin && <TableHead className="pe-5 text-end">{t("admin.users.colActions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAllLoading ? (
                  [0, 1, 2, 3].map((i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell className="ps-5 py-3"><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-3 w-52" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-md" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
                      {isAdmin && <TableCell className="pe-5"><Skeleton className="ms-auto h-8 w-8 rounded-md" /></TableCell>}
                    </TableRow>
                  ))
                ) : !allUsers.length ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={allColSpan} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <UsersIcon className="h-10 w-10 opacity-20" aria-hidden="true" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{t("admin.users.noUsersFound")}</p>
                          <p className="text-sm">{t("admin.users.noUsersDesc")}</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  allUsers.map((u) => (
                    <TableRow key={u.id} className={cn("hover:bg-muted/60", u.status === "inactive" ? "bg-muted/40" : "even:bg-muted/40")}>
                      <TableCell className="ps-5 py-3">
                        <div className="font-medium text-foreground">{u.fullName}</div>
                        <div className="font-mono text-xs text-muted-foreground" dir="ltr">{u.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-foreground">{u.companyName}</div>
                        <div className="text-xs text-muted-foreground">{u.title || "—"}</div>
                      </TableCell>
                      <TableCell><RoleBadge role={u.role} /></TableCell>
                      <TableCell><StatusBadge status={u.status} /></TableCell>
                      {isAdmin && (
                        <TableCell className="pe-5">
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={t("admin.users.openActions")}>
                                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                {u.role === "project-manager" && (
                                  <DropdownMenuItem onSelect={() => { setManageCitiesTarget(u); setManageCityIds([]); }}>
                                    <MapPin className="h-4 w-4" aria-hidden="true" /> {t("admin.users.tooltipManageCities")}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  disabled={!u.mfaEnabled}
                                  onSelect={() => setConfirmAction({ kind: "resetMfa", user: u })}
                                >
                                  <ShieldOff className="h-4 w-4" aria-hidden="true" /> {u.mfaEnabled ? t("admin.users.tooltipResetMfa") : t("admin.users.tooltipMfaNotEnabled")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setConfirmAction({ kind: "resetPassword", user: u })}>
                                  <KeyRound className="h-4 w-4" aria-hidden="true" /> {t("admin.users.tooltipResetPassword")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {u.status === "active" ? (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => setConfirmAction({ kind: "deactivate", user: u })}
                                  >
                                    <UserX className="h-4 w-4" aria-hidden="true" /> {t("admin.users.tooltipDeactivate")}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onSelect={() => handleToggleStatus(u)}>
                                    <UserCheck className="h-4 w-4" aria-hidden="true" /> {t("admin.users.tooltipActivate")}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>
        </TabsContent>

        {/* ── Pending activation ── */}
        <TabsContent value="pending" className="mt-4">
          <section className="rounded-xl border border-card-border bg-card">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-5">{t("admin.users.colApplicant")}</TableHead>
                  <TableHead>{t("admin.users.colCompany")}</TableHead>
                  <TableHead>{t("admin.users.colRegistered")}</TableHead>
                  <TableHead className="pe-5 text-end">{t("admin.users.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsersQuery.isLoading ? (
                  [0, 1].map((i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell className="ps-5 py-3"><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-3 w-52" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="pe-5"><Skeleton className="ms-auto h-8 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : !pendingUsers.length ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <UserCheck className="h-10 w-10 opacity-20" aria-hidden="true" />
                        <p className="text-sm">{t("admin.users.noPendingAccounts")}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingUsers.map((u) => (
                    <TableRow key={u.id} className="even:bg-muted/40 hover:bg-muted/60">
                      <TableCell className="ps-5 py-3">
                        <div className="font-medium text-foreground">{u.fullName}</div>
                        <div className="font-mono text-xs text-muted-foreground" dir="ltr">{u.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-foreground">{u.companyName}</div>
                        <div className="text-xs text-muted-foreground">{u.title || "—"}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                      <TableCell className="pe-5 text-end">
                        <Button size="sm" onClick={() => { setActivateTarget(u); activateForm.reset(); }}>
                          <UserCog className="me-2 h-4 w-4" aria-hidden="true" /> {t("admin.users.activateButton")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>
        </TabsContent>
      </Tabs>

      {/* ── Create user dialog (dual state: form / temp-password reveal) ── */}
      {isAdmin && (
        <Dialog
          open={createOpen}
          onOpenChange={(o) => { setCreateOpen(o); if (!o) { setSelectedCityIds([]); form.reset(); setTempPassword(null); } }}
        >
          <DialogContent className="gap-0 p-0 sm:max-w-xl">
            <DialogHeader className="border-b border-card-border px-6 py-4">
              <DialogTitle>{tempPassword ? t("admin.users.createdDialog.title") : t("admin.users.createDialog.title")}</DialogTitle>
              <DialogDescription>
                {tempPassword ? t("admin.users.createdDialog.description", { name: tempPassword.name }) : t("admin.users.createDialog.description")}
              </DialogDescription>
            </DialogHeader>

            {tempPassword ? (
              <div className="px-6 py-5">
                <PasswordReveal pass={tempPassword.pass} />
              </div>
            ) : (
              <div className="max-h-[60dvh] overflow-y-auto px-6 py-5">
                <Form {...form}>
                  <form id="create-user-form" onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="fullName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.users.createDialog.fieldFullName")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.users.createDialog.fieldEmail")}</FormLabel>
                          <FormControl><Input type="email" className="font-mono" dir="ltr" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="companyName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.users.createDialog.fieldCompany")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="role" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.users.createDialog.fieldRole")}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder={t("admin.users.createDialog.fieldRolePlaceholder")} /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {roleOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="title" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.users.createDialog.fieldJobTitle")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.users.createDialog.fieldPhone")}</FormLabel>
                          <FormControl><Input type="tel" dir="ltr" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {watchedRole === "project-manager" && (
                      <div className="space-y-2 rounded-lg border border-border p-3">
                        <p className="text-sm font-medium text-foreground">{t("admin.users.createDialog.assignedCities")}</p>
                        <div className="grid grid-cols-2 gap-2" data-testid="pm-cities">
                          {allCities.filter((c) => c.enabled).map((c) => (
                            <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
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
                  </form>
                </Form>
              </div>
            )}

            <DialogFooter className="gap-2 border-t border-card-border px-6 py-4">
              {tempPassword ? (
                <Button type="button" onClick={() => { setTempPassword(null); setCreateOpen(false); }}>
                  {t("common.close")}
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
                  <Button type="submit" form="create-user-form" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Spinner aria-hidden="true" />}
                    {t("admin.users.createDialog.submitCreate")}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Activate account dialog ── */}
      <Dialog open={!!activateTarget} onOpenChange={(o) => { if (!o) { setActivateTarget(null); activateForm.reset(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.users.activateDialog.title")}</DialogTitle>
            <DialogDescription>
              {stripTags(t("admin.users.activateDialog.description", { name: activateTarget?.fullName ?? "", email: activateTarget?.email ?? "", company: activateTarget?.companyName ?? "" }))}
              {activateTarget?.role === "investor" && (isPM ? t("admin.users.activateDialog.descriptionInvestorPM") : t("admin.users.activateDialog.descriptionInvestorAdmin"))}
            </DialogDescription>
          </DialogHeader>
          {activateTarget?.role === "investor" && (
            <Form {...activateForm}>
              <form id="activate-user-form" onSubmit={activateForm.handleSubmit(handleActivateSubmit)}>
                <FormField control={activateForm.control} name="projectId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin.users.activateDialog.linkToProject")}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {isPM ? t("admin.users.activateDialog.linkRequired") : t("admin.users.activateDialog.linkOptional")}
                      </span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder={t("admin.users.activateDialog.selectProject")} /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projectOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </form>
            </Form>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setActivateTarget(null); activateForm.reset(); }}>{t("common.cancel")}</Button>
            {activateTarget?.role === "investor" ? (
              <Button type="submit" form="activate-user-form" disabled={activateUser.isPending}>
                {activateUser.isPending && <Spinner aria-hidden="true" />}
                {t("admin.users.activateDialog.submitActivate")}
              </Button>
            ) : (
              <Button type="button" disabled={activateUser.isPending} onClick={() => handleActivateSubmit({})}>
                {activateUser.isPending && <Spinner aria-hidden="true" />}
                {t("admin.users.activateDialog.submitActivate")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage PM cities dialog ── */}
      <Dialog open={!!manageCitiesTarget} onOpenChange={(o) => { if (!o) { setManageCitiesTarget(null); setManageCityIds([]); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.users.manageCitiesDialog.title")}</DialogTitle>
            <DialogDescription>{stripTags(t("admin.users.manageCitiesDialog.description", { name: manageCitiesTarget?.fullName ?? "" }))}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2" data-testid="pm-cities-edit">
            {allCities.filter((c) => c.enabled).map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={manageCityIds.includes(c.id)}
                  onCheckedChange={(v) => setManageCityIds((prev) => v ? [...prev, c.id] : prev.filter((id) => id !== c.id))}
                  data-testid={`city-checkbox-edit-${c.code}`}
                />
                {c.shortName}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setManageCitiesTarget(null); setManageCityIds([]); }}>{t("common.cancel")}</Button>
            <Button type="button" disabled={setUserCities.isPending} onClick={handleManageCitiesSubmit}>
              {setUserCities.isPending && <Spinner aria-hidden="true" />}
              {t("admin.users.manageCitiesDialog.saveCities")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Password-reset reveal (reset-password flow only; create reuses its own dialog) ── */}
      <Dialog open={!!tempPassword && !createOpen} onOpenChange={(o) => !o && setTempPassword(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.users.passwordResetDialog.title")}</DialogTitle>
            <DialogDescription>{t("admin.users.passwordResetDialog.description", { name: tempPassword?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          {tempPassword && <PasswordReveal pass={tempPassword.pass} />}
          <DialogFooter>
            <Button type="button" onClick={() => setTempPassword(null)}>{t("admin.users.passwordResetDialog.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm (deactivate / reset password / reset MFA) ── */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => { if (!o) setConfirmAction(null); }}>
        <AlertDialogContent>
          {confirmMeta && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmMeta.title}</AlertDialogTitle>
                <AlertDialogDescription>{confirmMeta.desc}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className={cn(confirmMeta.destructive && buttonVariants({ variant: "destructive" }))}
                  onClick={(e) => { e.preventDefault(); confirmMeta.run(); setConfirmAction(null); }}
                >
                  {confirmMeta.confirmLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Strip the i18n emphasis markers (`<1>…</1>`) that wrap {{name}} in some copy. */
function stripTags(s: string): string {
  return s.replace(/<\/?1>/g, "");
}
