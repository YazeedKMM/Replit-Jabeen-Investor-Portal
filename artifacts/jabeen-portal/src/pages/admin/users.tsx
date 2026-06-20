import { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useResetUserPassword,
  useResetUserMfa,
  useActivateUser,
  useListProjects,
  getListUsersQueryKey,
  getListProjectsQueryKey,
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
import { Search, Plus, UserX, UserCheck, KeyRound, Loader2, Copy, Check, UserCog, Clock, ShieldOff } from "lucide-react";
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
  const isAdmin = currentUser?.role === "administrator";
  const isPM = currentUser?.role === "project-manager";

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdUserTempPassword, setCreatedUserTempPassword] = useState<{name: string, pass: string} | null>(null);
  const [copied, setCopied] = useState(false);
  const [activateTarget, setActivateTarget] = useState<User | null>(null);

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

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
  };

  const onCreateSubmit = async (data: z.infer<typeof createUserSchema>) => {
    try {
      const res = await createUser.mutateAsync({ data });
      invalidateUsers();
      setCreatedUserTempPassword({ name: res.user.fullName, pass: res.temporaryPassword });
      form.reset();
    } catch (error: any) {
      toast({ title: "Failed to create user", description: error.data?.message || "An error occurred", variant: "destructive" });
    }
  };

  const handleToggleStatus = async (u: User) => {
    const newStatus = u.status === "active" ? "inactive" : "active";
    try {
      await updateUser.mutateAsync({ userId: u.id, data: { status: newStatus as any } });
      invalidateUsers();
      toast({ title: "Status updated", description: `${u.fullName} is now ${newStatus}` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const handleResetPassword = async (u: User) => {
    if (!confirm(`Reset password for ${u.fullName}?`)) return;
    try {
      const res = await resetPassword.mutateAsync({ userId: u.id });
      setCreatedUserTempPassword({ name: u.fullName, pass: res.temporaryPassword });
    } catch (error) {
      toast({ title: "Error", description: "Failed to reset password", variant: "destructive" });
    }
  };

  const handleResetMfa = async (u: User) => {
    if (!u.mfaEnabled) {
      toast({ title: "MFA not enabled", description: `${u.fullName} does not have MFA enabled.` });
      return;
    }
    if (!confirm(`Reset MFA for ${u.fullName}? They will need to re-enroll next time they log in.`)) return;
    try {
      await resetMfa.mutateAsync({ userId: u.id });
      invalidateUsers();
      toast({ title: "MFA Reset", description: `MFA has been disabled for ${u.fullName}.` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to reset MFA", variant: "destructive" });
    }
  };

  const handleActivateSubmit = async (data: { projectId?: string }) => {
    if (!activateTarget) return;
    try {
      await activateUser.mutateAsync({
        userId: activateTarget.id,
        data: data.projectId ? { projectId: parseInt(data.projectId) } : undefined,
      });
      invalidateUsers();
      toast({ title: "Account activated", description: `${activateTarget.fullName} can now access the portal.` });
      setActivateTarget(null);
      activateForm.reset();
    } catch (error: any) {
      toast({ title: "Activation failed", description: error.data?.message || "An error occurred", variant: "destructive" });
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
      case 'active': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>;
      case 'inactive': return <Badge variant="outline" className="bg-muted text-muted-foreground">Inactive</Badge>;
      case 'pending': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">User Administration</h1>
          <p className="text-muted-foreground">Manage portal access and roles.</p>
        </div>

        {isAdmin && (
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Create User</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              {createdUserTempPassword ? (
                <div className="space-y-6">
                  <DialogHeader>
                    <DialogTitle>User Created Successfully</DialogTitle>
                    <DialogDescription>
                      Please copy the temporary password and send it securely to {createdUserTempPassword.name}. They will be prompted to change it upon first login.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="bg-muted p-4 rounded-md flex items-center justify-between border">
                    <code className="font-mono text-lg font-medium">{createdUserTempPassword.pass}</code>
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(createdUserTempPassword.pass)}>
                      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => { setCreatedUserTempPassword(null); setCreateDialogOpen(false); }}>Close</Button>
                  </DialogFooter>
                </div>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                    <DialogDescription>Add a new staff member or investor to the portal.</DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="fullName" render={({ field }) => (
                          <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="email" render={({ field }) => (
                          <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="companyName" render={({ field }) => (
                          <FormItem><FormLabel>Company</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="role" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="investor">Investor</SelectItem>
                                <SelectItem value="project-manager">Project Manager</SelectItem>
                                <SelectItem value="top-management">Top Management</SelectItem>
                                <SelectItem value="administrator">Administrator</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="title" render={({ field }) => (
                          <FormItem><FormLabel>Job Title (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="phone" render={({ field }) => (
                          <FormItem><FormLabel>Phone (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      <DialogFooter className="pt-4">
                        <Button variant="outline" type="button" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Create User
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
          <TabsTrigger value="all">All Users</TabsTrigger>
          <TabsTrigger value="pending" className="relative">
            Pending Activation
            {pendingUsers.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold h-5 min-w-5 px-1.5">
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
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search by name, email, company..."
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="investor">Investor</SelectItem>
                    <SelectItem value="project-manager">Project Manager</SelectItem>
                    <SelectItem value="top-management">Top Management</SelectItem>
                    <SelectItem value="administrator">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isAllLoading ? (
                    <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : !allUsers.length ? (
                    <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="h-24 text-center text-muted-foreground">No users found.</TableCell></TableRow>
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
                          <Badge variant="outline" className={`capitalize ${getRoleColor(u.role)}`}>
                            {u.role.replace(/-/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(u.status)}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleResetMfa(u)}
                              title={u.mfaEnabled ? "Reset MFA" : "MFA not enabled"}
                              className={u.mfaEnabled ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-muted-foreground/40 cursor-default"}
                            >
                              <ShieldOff className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleResetPassword(u)} title="Reset Password">
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(u)} title={u.status === "active" ? "Deactivate User" : "Activate User"}>
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
                    <TableHead>Applicant</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                          <p>No pending accounts — all applicants have been processed.</p>
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
                            {new Date(u.createdAt).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => { setActivateTarget(u); activateForm.reset(); }}
                          >
                            <UserCog className="h-4 w-4 mr-2" /> Activate
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
            <DialogTitle>Activate Account</DialogTitle>
            <DialogDescription>
              Activate <strong>{activateTarget?.fullName}</strong> ({activateTarget?.email}) from {activateTarget?.companyName}.
              {activateTarget?.role === "investor" && (isPM ? " A project link is required." : " Optionally link them to an existing project.")}
            </DialogDescription>
          </DialogHeader>
          <Form {...activateForm}>
            <form onSubmit={activateForm.handleSubmit(handleActivateSubmit)} className="space-y-4 pt-2">
              {activateTarget?.role === "investor" && (
                <FormField control={activateForm.control} name="projectId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Link to Project{" "}
                      {isPM
                        ? <span className="text-destructive font-normal">*</span>
                        : <span className="text-muted-foreground font-normal">(Optional)</span>
                      }
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a project to link…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {!isPM && <SelectItem value="">No project link</SelectItem>}
                        {projects?.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name} <span className="text-muted-foreground ml-1">({p.agreementNumber})</span>
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
                  Cancel
                </Button>
                <Button type="submit" disabled={activateUser.isPending}>
                  {activateUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Activate Account
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ─── Password modal for reset / create ─────────────────── */}
      <Dialog open={!!createdUserTempPassword && !createDialogOpen} onOpenChange={(open) => !open && setCreatedUserTempPassword(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Password Reset Successful</DialogTitle>
            <DialogDescription>
              New temporary password for {createdUserTempPassword?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-md flex items-center justify-between border">
            <code className="font-mono text-lg font-medium">{createdUserTempPassword?.pass}</code>
            <Button variant="ghost" size="icon" onClick={() => createdUserTempPassword && copyToClipboard(createdUserTempPassword.pass)}>
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedUserTempPassword(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
