import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateMe } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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

/** Card container with an optional title/description header. */
function ProfileCard({
  title,
  description,
  headerAside,
  children,
}: {
  title: string;
  description: string;
  headerAside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {headerAside}
      </div>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, handleAuthResult } = useAuth();
  const { toast } = useToast();
  const updateMe = useUpdateMe();
  const [enrollingMfa, setEnrollingMfa] = useState(false);
  const [isDisablingMfa, setIsDisablingMfa] = useState(false);

  const isPrivileged = MFA_REQUIRED_ROLES.includes(user?.role ?? "");
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
  const submit = form.handleSubmit(onSubmit);

  async function onSubmit(data: z.infer<typeof profileSchema>) {
    try {
      await updateMe.mutateAsync({ data });
      toast({ title: t("profile.toast.updatedTitle"), description: t("profile.toast.updatedDesc") });
    } catch (error: any) {
      toast({
        title: t("profile.toast.errorTitle"),
        description: error.data?.message || t("profile.toast.errorDesc"),
        variant: "destructive",
      });
    }
  }

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
          <MfaSetupFlow mfaToken={accessToken} onComplete={handleMfaEnrollComplete} isRequired={false} />
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

      <ProfileCard title={t("profile.personalInfoTitle")} description={t("profile.personalInfoDesc")}>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="fullName" render={({ field }) => (
                <FormItem><FormLabel>{t("profile.fullName")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="companyName" render={({ field }) => (
                <FormItem><FormLabel>{t("profile.companyName")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem><FormLabel>{t("profile.jobTitle")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>{t("profile.phone")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="pt-2 flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("profile.saving") : t("profile.saveChanges")}
              </Button>
            </div>
          </form>
        </Form>
      </ProfileCard>

      <ProfileCard
        title={t("profile.mfaTitle")}
        description={t("profile.mfaDesc")}
        headerAside={
          <Badge
            variant="outline"
            className={user?.mfaEnabled ? "border-transparent bg-success/15 text-foreground" : ""}
          >
            {user?.mfaEnabled ? t("profile.mfaEnabled") : t("profile.mfaDisabled")}
          </Badge>
        }
      >
        {user?.mfaEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t("profile.mfaActiveDesc")}
            </div>
            {isPrivileged ? (
              <p className="flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                {t("profile.mfaRequiredWarning")}
              </p>
            ) : (
              <Button
                variant="outline"
                className="text-destructive"
                disabled={isDisablingMfa}
                onClick={disableMfa}
              >
                {isDisablingMfa ? t("profile.disabling") : t("profile.disableMfa")}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              {isPrivileged ? t("profile.mfaPrivilegedDesc") : t("profile.mfaOptionalDesc")}
            </div>
            {!isPrivileged && (
              <Button variant="secondary" onClick={() => setEnrollingMfa(true)}>{t("profile.enableMfa")}</Button>
            )}
          </div>
        )}
      </ProfileCard>
    </div>
  );
}
