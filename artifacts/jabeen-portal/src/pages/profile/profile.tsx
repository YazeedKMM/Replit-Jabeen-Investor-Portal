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
import { useTranslation } from "react-i18next";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const profileSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  companyName: z.string().min(2, "Company name is required"),
  title: z.string().optional(),
  phone: z.string().optional(),
});

const MFA_REQUIRED_ROLES = ["administrator", "project-manager"];

export default function ProfilePage() {
  const { t } = useTranslation();
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
      toast({ title: t("profile.toast.updatedTitle"), description: t("profile.toast.updatedDesc") });
    } catch (error: any) {
      toast({
        title: t("profile.toast.errorTitle"),
        description: error.data?.message || t("profile.toast.errorDesc"),
        variant: "destructive"
      });
    }
  };

  const handleMfaEnrollComplete = (newAccessToken: string, updatedUser: any) => {
    handleAuthResult({ accessToken: newAccessToken, user: updatedUser });
    setEnrollingMfa(false);
    toast({ title: t("profile.toast.mfaEnabledTitle"), description: t("profile.toast.mfaEnabledDesc") });
  };

  const disableMfa = async () => {
    if (!confirm(t("profile.disableMfaConfirm"))) return;
    setIsDisablingMfa(true);
    try {
      const res = await fetch(`${BASE}/api/auth/mfa`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: t("profile.toast.cannotDisableMfa"), description: (data as any).error || t("profile.toast.disableMfaErrorDesc"), variant: "destructive" });
        return;
      }
      // Reload to refresh user state
      window.location.reload();
    } catch {
      toast({ title: t("profile.toast.disableMfaError"), description: t("profile.toast.disableMfaErrorDesc"), variant: "destructive" });
    } finally {
      setIsDisablingMfa(false);
    }
  };

  if (enrollingMfa) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("profile.setupMfaTitle")}</h1>
          <p className="text-muted-foreground">{t("profile.setupMfaSubtitle")}</p>
        </div>
        <div className="flex justify-center">
          <MfaSetupFlow
            mfaToken={accessToken}
            onComplete={handleMfaEnrollComplete}
            isRequired={false}
          />
        </div>
        <div className="text-center">
          <Button variant="ghost" onClick={() => setEnrollingMfa(false)}>{t("common.cancel")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("profile.title")}</h1>
        <p className="text-muted-foreground">{t("profile.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.personalInfoTitle")}</CardTitle>
          <CardDescription>{t("profile.personalInfoDesc")}</CardDescription>
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
                      <FormLabel>{t("profile.fullName")}</FormLabel>
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
                      <FormLabel>{t("profile.companyName")}</FormLabel>
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
                      <FormLabel>{t("profile.jobTitle")}</FormLabel>
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
                      <FormLabel>{t("profile.phone")}</FormLabel>
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
                  {form.formState.isSubmitting ? t("profile.saving") : t("profile.saveChanges")}
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
              <CardTitle>{t("profile.mfaTitle")}</CardTitle>
              <CardDescription>{t("profile.mfaDesc")}</CardDescription>
            </div>
            <div className="ms-auto">
              {user?.mfaEnabled
                ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{t("profile.mfaEnabled")}</Badge>
                : <Badge variant="outline" className="text-muted-foreground">{t("profile.mfaDisabled")}</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.mfaEnabled ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("profile.mfaActiveDesc")}
              </p>
              {isPrivileged ? (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{t("profile.mfaRequiredWarning")}</span>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={disableMfa}
                  disabled={isDisablingMfa}
                  className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                >
                  {isDisablingMfa ? t("profile.disabling") : t("profile.disableMfa")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {isPrivileged ? t("profile.mfaPrivilegedDesc") : t("profile.mfaOptionalDesc")}
              </p>
              {!isPrivileged && (
                <Button onClick={() => setEnrollingMfa(true)}>
                  <Shield className="h-4 w-4 me-2" />
                  {t("profile.enableMfa")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
