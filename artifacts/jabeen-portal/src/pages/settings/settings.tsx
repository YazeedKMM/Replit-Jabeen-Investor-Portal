import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DgaContentCard } from "@/components/ui/dga-card";
import { DgaForm } from "@/components/ui/dga-form";
import { DgaTextField } from "@/components/ui/dga-text-field";
import { DgaSwitchField } from "@/components/ui/dga-fields";
import { DgaSubmitButton } from "@/components/ui/dga-brand-button";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const settingsSchema = z.object({
  stalledThresholdDays: z.coerce.number().min(1),
  delayedThresholdDays: z.coerce.number().min(1),
  outOfBandNotificationsEnabled: z.boolean(),
  loginThrottleMaxAttempts: z.coerce.number().min(1),
  loginThrottleWindowSeconds: z.coerce.number().min(1),
});

export default function SettingsPage() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      stalledThresholdDays: 30,
      delayedThresholdDays: 14,
      outOfBandNotificationsEnabled: false,
      loginThrottleMaxAttempts: 5,
      loginThrottleWindowSeconds: 300,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset(settings);
    }
  }, [settings, form]);

  const onSubmit = async (data: z.infer<typeof settingsSchema>) => {
    try {
      await updateSettings.mutateAsync({ data });
      toast({ title: t("settings.toast.updatedTitle"), description: t("settings.toast.updatedDesc") });
    } catch (error: any) {
      toast({ title: t("settings.toast.errorTitle"), description: error.data?.message || t("settings.toast.errorDesc"), variant: "destructive" });
    }
  };

  const submit = form.handleSubmit(onSubmit);

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <DgaForm onSubmit={submit} className="space-y-6">
        <DgaContentCard className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("settings.thresholdsTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("settings.thresholdsDesc")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <DgaTextField control={form.control} name="delayedThresholdDays" label={t("settings.delayedThreshold")} required />
              <p className="text-xs text-muted-foreground">{t("settings.delayedThresholdDesc")}</p>
            </div>
            <div className="space-y-1">
              <DgaTextField control={form.control} name="stalledThresholdDays" label={t("settings.stalledThreshold")} required />
              <p className="text-xs text-muted-foreground">{t("settings.stalledThresholdDesc")}</p>
            </div>
          </div>
        </DgaContentCard>

        <DgaContentCard className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("settings.securityTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("settings.securityDesc")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DgaTextField control={form.control} name="loginThrottleMaxAttempts" label={t("settings.maxLoginAttempts")} required />
            <DgaTextField control={form.control} name="loginThrottleWindowSeconds" label={t("settings.throttleWindow")} required />
          </div>
          <div className="rounded-lg border border-border p-4">
            <DgaSwitchField
              control={form.control}
              name="outOfBandNotificationsEnabled"
              label={t("settings.emailNotifications")}
              helperText={t("settings.emailNotificationsDesc")}
            />
          </div>
        </DgaContentCard>

        <div className="flex justify-end">
          <DgaSubmitButton
            onSubmit={submit}
            size="lg"
            loading={form.formState.isSubmitting}
            loadingLabel={t("settings.saving")}
            label={t("settings.saveConfig")}
          />
        </div>
      </DgaForm>
    </div>
  );
}
