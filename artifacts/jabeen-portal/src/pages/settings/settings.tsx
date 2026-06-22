import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.thresholdsTitle")}</CardTitle>
              <CardDescription>{t("settings.thresholdsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="delayedThresholdDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.delayedThreshold")}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>{t("settings.delayedThresholdDesc")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="stalledThresholdDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.stalledThreshold")}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>{t("settings.stalledThresholdDesc")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("settings.securityTitle")}</CardTitle>
              <CardDescription>{t("settings.securityDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="loginThrottleMaxAttempts"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.maxLoginAttempts")}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="loginThrottleWindowSeconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.throttleWindow")}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="outOfBandNotificationsEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t("settings.emailNotifications")}</FormLabel>
                      <FormDescription>
                        {t("settings.emailNotificationsDesc")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("settings.saving") : t("settings.saveConfig")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
