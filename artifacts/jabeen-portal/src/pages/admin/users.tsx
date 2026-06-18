import { useState } from "react";
import { useListUsers, useCreateUser, useUpdateUser, useResetUserPassword, UserRole, User } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Search, Plus, UserX, UserCheck, KeyRound, Loader2, Copy, Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const createUserSchema = z.object({
  fullName: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email"),
  companyName: z.string().min(2, "Company is required"),
  title: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(["investor", "top-management", "project-manager", "administrator"]),
});

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdUserTempPassword, setCreatedUserTempPassword] = useState<{name: string, pass: string} | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: users, isLoading } = useListUsers({ 
    search: search || undefined, 
    role: roleFilter !== "all" ? roleFilter as any : undefined 
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();

  const form = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      fullName: "", email: "", companyName: "", title: "", phone: "", role: "investor",
    },
  });

  const onCreateSubmit = async (data: z.infer<typeof createUserSchema>) => {
    try {
      const res = await createUser.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setCreatedUserTempPassword({ name: res.user.fullName, pass: res.temporaryPassword });
      form.reset();
    } catch (error: any) {
      toast({ title: "Failed to create user", description: error.data?.message || "An error occurred", variant: "destructive" });
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await updateUser.mutateAsync({ userId: user.id, data: { active: !user.active } });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Status updated", description: `${user.fullName} is now ${!user.active ? "active" : "inactive"}` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const handleResetPassword = async (user: User) => {
    if (!confirm(`Reset password for ${user.fullName}?`)) return;
    try {
      const res = await resetPassword.mutateAsync({ userId: user.id });
      setCreatedUserTempPassword({ name: user.fullName, pass: res.temporaryPassword });
    } catch (error) {
      toast({ title: "Error", description: "Failed to reset password", variant: "destructive" });
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">User Administration</h1>
          <p className="text-muted-foreground">Manage portal access and roles.</p>
        </div>

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
      </div>

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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : !users?.length ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No users found.</TableCell></TableRow>
              ) : (
                users.map(u => (
                  <TableRow key={u.id} className={!u.active ? "bg-muted/50" : ""}>
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
                        {u.role.replace('-', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.active ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="icon" onClick={() => handleResetPassword(u)} title="Reset Password">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(u)} title={u.active ? "Deactivate User" : "Activate User"}>
                        {u.active ? <UserX className="h-4 w-4 text-destructive" /> : <UserCheck className="h-4 w-4 text-emerald-600" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
