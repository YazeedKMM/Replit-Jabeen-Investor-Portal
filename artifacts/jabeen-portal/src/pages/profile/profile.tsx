import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateMe } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DgaCardV2, DgaTag, DgaInlineAlert, DgaButton } from "platformscode-new-react";
import { DgaForm } from "@/components/ui/dga-form";
import { DgaTextField } from "@/components/ui/dga-text-field";
import { DgaSubmitButton } from "@/components/ui/dga-brand-button";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldCheck } from "lucide-react";
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

/** DgaCardV2 is a bare themed container; this wraps it with padding + an optional
 *  title/description header, replacing the shadcn Card/CardHeader/CardContent. */
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
    <DgaCardV2 effect="stroke">
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {headerAside}
        </div>
        {children}
      </div>
    </DgaCardV2>
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
          <DgaButton variant="transparent" label={t("common.cancel")} onOnClick={() => setEnrollingMfa(false)} />
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
        <DgaForm onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DgaTextField control={form.control} name="fullName" label={t("profile.fullName")} required />
            <DgaTextField control={form.control} name="companyName" label={t("profile.companyName")} required />
            <DgaTextField control={form.control} name="title" label={t("profile.jobTitle")} />
            <DgaTextField control={form.control} name="phone" label={t("profile.phone")} />
          </div>
          <div className="pt-2 flex justify-end">
            <DgaSubmitButton
              onSubmit={submit}
              loading={form.formState.isSubmitting}
              loadingLabel={t("profile.saving")}
              label={t("profile.saveChanges")}
            />
          </div>
        </DgaForm>
      </ProfileCard>

      <ProfileCard
        title={t("profile.mfaTitle")}
        description={t("profile.mfaDesc")}
        headerAside={
          <DgaTag
            variant={user?.mfaEnabled ? "info" : "neutral"}
            size="md"
            outlined
            label={user?.mfaEnabled ? t("profile.mfaEnabled") : t("profile.mfaDisabled")}
          />
        }
      >
        {user?.mfaEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t("profile.mfaActiveDesc")}
            </div>
            {isPrivileged ? (
              <DgaInlineAlert type="warning" colored leadText={t("profile.mfaRequiredWarning")} />
            ) : (
              <DgaButton
                variant="des-secondary-outline"
                label={isDisablingMfa ? t("profile.disabling") : t("profile.disableMfa")}
                disabled={isDisablingMfa}
                onOnClick={disableMfa}
              />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              {isPrivileged ? t("profile.mfaPrivilegedDesc") : t("profile.mfaOptionalDesc")}
            </div>
            {!isPrivileged && (
              <DgaButton variant="secondary" label={t("profile.enableMfa")} onOnClick={() => setEnrollingMfa(true)} />
            )}
          </div>
        )}
      </ProfileCard>
    </div>
  );
}
