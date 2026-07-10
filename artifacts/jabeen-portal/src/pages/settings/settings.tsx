import { useMemo } from "react";
import type { TFunction } from "i18next";
import { useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetSettings, useUpdateSettings, getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";

// ── Schema ───────────────────────────────────────────────────────────────────
// Mirrors PATCH /settings server validation (positive integers; boolean toggle).
// Built with `t` so coercion/range messages are localized in both scripts.
const makeSchema = (t: TFunction) => {
  const posInt = z.coerce
    .number({ invalid_type_error: t("settings.validation.min") })
    .int(t("settings.validation.min"))
    .min(1, t("settings.validation.min"));
  return z.object({
    delayedThresholdDays: posInt,
    stalledThresholdDays: posInt,
    loginThrottleMaxAttempts: posInt,
    loginThrottleWindowSeconds: posInt,
    outOfBandNotificationsEnabled: z.boolean(),
  });
};
type SettingsForm = z.infer<ReturnType<typeof makeSchema>>;

// ── Building blocks ──────────────────────────────────────────────────────────

/** Quiet bordered settings group with a heading + explanatory line. */
function Section({ title, description, children }: {
  title: string; description: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-card-border bg-card p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-base font-medium text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

/** Compact numeric field with a muted unit hint sitting at the inline-end. */
function NumberField({ control, name, label, description, unit }: {
  control: Control<SettingsForm>;
  name: "delayedThresholdDays" | "stalledThresholdDays" | "loginThrottleMaxAttempts" | "loginThrottleWindowSeconds";
  label: string; description: string; unit: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {/* FormControl must wrap the Input directly so its id/aria-invalid/
              aria-describedby land on the field, not the layout wrapper. */}
          <div className="flex items-center gap-2">
            <FormControl>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                className="max-w-40 tabular-nums"
                {...field}
              />
            </FormControl>
            <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>
          </div>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: settings, isLoading, isError, refetch } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const updateSettings = useUpdateSettings();

  const schema = useMemo(() => makeSchema(t), [t]);
  const form = useForm<SettingsForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      delayedThresholdDays: 30,
      stalledThresholdDays: 45,
      loginThrottleMaxAttempts: 10,
      loginThrottleWindowSeconds: 60,
      outOfBandNotificationsEnabled: false,
    },
    // Server-sync: RHF re-seeds the form whenever `settings` resolves/changes,
    // with no first-render flash of the placeholder defaults.
    values: settings,
  });

  const onSubmit = async (values: SettingsForm) => {
    try {
      const updated = await updateSettings.mutateAsync({ data: values });
      // Re-baseline so tabular fields reflect the persisted (normalized) values.
      form.reset(updated);
      toast({
        title: t("settings.toast.updatedTitle"),
        description: t("settings.toast.updatedDesc"),
      });
    } catch (error: unknown) {
      toast({
        title: t("settings.toast.errorTitle"),
        description: apiErrorMessage(error, t("settings.toast.errorDesc")),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      {isError ? (
        <section className="rounded-xl border border-card-border bg-card px-6 py-14 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">{t("settings.error.title")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("settings.error.desc")}</p>
          <Button variant="outline" className="mt-5" onClick={() => refetch()}>
            {t("settings.error.retry")}
          </Button>
        </section>
      ) : isLoading || !settings ? (
        <div className="space-y-6">
          {[2, 3].map((rows) => (
            <div key={rows} className="rounded-xl border border-card-border bg-card p-5 sm:p-6">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-2 h-4 w-72" />
              <div className="mt-6 space-y-5">
                {Array.from({ length: rows }, (_, j) => (
                  <Skeleton key={j} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Section title={t("settings.thresholdsTitle")} description={t("settings.thresholdsDesc")}>
              <NumberField
                control={form.control}
                name="delayedThresholdDays"
                label={t("settings.delayedThreshold")}
                description={t("settings.delayedThresholdDesc")}
                unit={t("settings.units.days")}
              />
              <NumberField
                control={form.control}
                name="stalledThresholdDays"
                label={t("settings.stalledThreshold")}
                description={t("settings.stalledThresholdDesc")}
                unit={t("settings.units.days")}
              />
            </Section>

            <Section title={t("settings.securityTitle")} description={t("settings.securityDesc")}>
              <NumberField
                control={form.control}
                name="loginThrottleMaxAttempts"
                label={t("settings.maxLoginAttempts")}
                description={t("settings.maxLoginAttemptsDesc")}
                unit={t("settings.units.attempts")}
              />
              <NumberField
                control={form.control}
                name="loginThrottleWindowSeconds"
                label={t("settings.throttleWindow")}
                description={t("settings.throttleWindowDesc")}
                unit={t("settings.units.seconds")}
              />

              <FormField
                control={form.control}
                name="outOfBandNotificationsEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border border-card-border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.emailNotifications")}</FormLabel>
                      <FormDescription>{t("settings.emailNotificationsDesc")}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label={t("settings.emailNotifications")}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </Section>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending && <Spinner aria-hidden="true" />}
                {updateSettings.isPending ? t("settings.saving") : t("settings.saveConfig")}
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}
