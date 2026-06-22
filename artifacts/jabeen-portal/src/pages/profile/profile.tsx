import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateMe } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, AlertTriangle } from "lucide-react";
import { MfaSetupFlow } from "@/pages/auth/mfa-setup";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const profileSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  companyName: z.string().min(2, "Company name is required"),
  title: z.string().optional(),
  phone: z.string().optional(),
});

const MFA_REQUIRED_ROLES = ["administrator", "project-manager"];

export default function ProfilePage() {
  const { user, handleAuthResult } = useAuth();
  const { toast } = useToast();
  const updateMe = useUpdateMe();
  const [enrollingMfa, setEnrollingMfa] = useState(false);
  const [isDisablingMfa, setIsDisablingMfa] = useState(false);

  const isPrivileged = MFA_REQUIRED_ROLES.includes(user?.role ?? "");

  // The regular access token works for the MFA setup endpoints (requireMfaStepToken accepts any valid JWT)
  const accessToken = localStorage.getItem("jabeen_access_token") ?? "";

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user?.fullName || "",
      companyName: user?.companyName || "",
      title: user?.title || "",
      phone: user?.phone || "",
    },
  });

  const onSubmit = async (data: z.infer<typeof profileSchema>) => {
    try {
      await updateMe.mutateAsync({ data });
      toast({ title: "Profile updated", description: "Your profile has been saved successfully." });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.data?.message || "Failed to update profile", 
        variant: "destructive" 
      });
    }
  };

  const handleMfaEnrollComplete = (newAccessToken: string, updatedUser: any) => {
    handleAuthResult({ accessToken: newAccessToken, user: updatedUser });
    setEnrollingMfa(false);
    toast({ title: "MFA Enabled", description: "Two-factor authentication is now active on your account." });
  };

  const disableMfa = async () => {
    if (!confirm("Disable two-factor authentication? Your account will be less secure.")) return;
    setIsDisablingMfa(true);
    try {
      const res = await fetch(`${BASE}/api/auth/mfa`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Cannot disable MFA", description: (data as any).error || "Operation failed", variant: "destructive" });
        return;
      }
      // Reload to refresh user state
      window.location.reload();
    } catch {
      toast({ title: "Error", description: "Failed to disable MFA", variant: "destructive" });
    } finally {
      setIsDisablingMfa(false);
    }
  };

  if (enrollingMfa) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Set Up Two-Factor Authentication</h1>
          <p className="text-muted-foreground">Secure your account with an authenticator app.</p>
        </div>
        <div className="flex justify-center">
          <MfaSetupFlow
            mfaToken={accessToken}
            onComplete={handleMfaEnrollComplete}
            isRequired={false}
          />
        </div>
        <div className="text-center">
          <Button variant="ghost" onClick={() => setEnrollingMfa(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground">Manage your personal information and contact details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update how you are identified in the portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Title</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* MFA Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {user?.mfaEnabled
              ? <ShieldCheck className="h-5 w-5 text-emerald-600" />
              : <Shield className="h-5 w-5 text-muted-foreground" />}
            <div>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>Add an extra layer of security to your account.</CardDescription>
            </div>
            <div className="ms-auto">
              {user?.mfaEnabled
                ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Enabled</Badge>
                : <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.mfaEnabled ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your account is protected with two-factor authentication using an authenticator app.
              </p>
              {isPrivileged ? (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>MFA is required for your role and cannot be disabled. Contact an administrator if you need to reset your authenticator.</span>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={disableMfa}
                  disabled={isDisablingMfa}
                  className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                >
                  {isDisablingMfa ? "Disabling..." : "Disable Two-Factor Authentication"}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {isPrivileged
                  ? "Your role requires MFA enrollment. You will be prompted to enroll on your next login."
                  : "Protect your account by enabling two-factor authentication with an authenticator app like Google Authenticator or Authy."}
              </p>
              {!isPrivileged && (
                <Button onClick={() => setEnrollingMfa(true)}>
                  <Shield className="h-4 w-4 me-2" />
                  Enable Two-Factor Authentication
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
