import { useEffect, useState, useRef } from "react";
import {
  useGetBranding,
  useUpdateBranding,
  useUploadBrandingLogo,
  getGetBrandingQueryKey,
  type Branding,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { hexToOklch, oklchToHex, parseOklch, formatOklch } from "@/lib/oklch";
import { logoUrl } from "@/theme/theme-provider";

const COLOR_KEYS = ["primary", "secondary", "accent", "success", "warning", "error"] as const;
const LOGO_SLOTS = ["light", "dark", "favicon"] as const;
type ColorKey = (typeof COLOR_KEYS)[number];
type LogoSlot = (typeof LOGO_SLOTS)[number];

const LOGO_ACCEPT = ".svg,.png,.ico,image/svg+xml,image/png,image/x-icon";

export default function BrandingPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useGetBranding();
  const updateBranding = useUpdateBranding();
  const uploadLogo = useUploadBrandingLogo();
  const [draft, setDraft] = useState<Branding | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<LogoSlot | null>(null);
  const fileInputs = useRef<Partial<Record<LogoSlot, HTMLInputElement | null>>>({});

  // Seed the draft from the server config once; afterwards the draft is
  // authoritative until saved (so server refetches don't clobber edits).
  useEffect(() => {
    if (data && !draft) setDraft(data);
  }, [data, draft]);

  if (!draft) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const setColor = (key: ColorKey, hex: string) => {
    const oklch = hexToOklch(hex);
    if (!oklch) return;
    setDraft({ ...draft, colors: { ...draft.colors, [key]: formatOklch(oklch) } });
  };

  const colorAsHex = (key: ColorKey): string => {
    const parsed = parseOklch(draft.colors[key]);
    return parsed ? oklchToHex(parsed) : "#000000";
  };

  const onUpload = async (slot: LogoSlot, file: File) => {
    setUploadingSlot(slot);
    try {
      const res = await uploadLogo.mutateAsync({ data: { file } });
      setDraft((d) => (d ? { ...d, logos: { ...d.logos, [slot]: res.key } } : d));
    } catch {
      toast({ title: t("branding.uploadFailed"), variant: "destructive" });
    } finally {
      setUploadingSlot(null);
      const input = fileInputs.current[slot];
      if (input) input.value = "";
    }
  };

  const onSave = async () => {
    try {
      await updateBranding.mutateAsync({ data: draft });
      // ThemeProvider consumes the same query — invalidating re-themes the app live.
      await queryClient.invalidateQueries({ queryKey: getGetBrandingQueryKey() });
      toast({ title: t("branding.saved"), description: t("branding.savedDesc") });
    } catch (error: any) {
      toast({
        title: t("branding.saveFailed"),
        description: error?.data?.error ?? "",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("branding.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("branding.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("branding.brandName")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={draft.name}
            maxLength={120}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            data-testid="branding-name"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("branding.colors")}</CardTitle>
          <CardDescription>{t("branding.colorsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {COLOR_KEYS.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`color-${key}`}>{t(`branding.${key}`)}</Label>
                <div className="flex items-center gap-2">
                  <input
                    id={`color-${key}`}
                    type="color"
                    className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                    value={colorAsHex(key)}
                    onChange={(e) => setColor(key, e.target.value)}
                    data-testid={`branding-color-${key}`}
                  />
                  <span
                    className="inline-block h-6 w-6 shrink-0 rounded-full border border-border"
                    style={{ background: draft.colors[key] }}
                    aria-hidden
                  />
                  <code className="truncate text-xs text-muted-foreground" dir="ltr">
                    {draft.colors[key]}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("branding.logos")}</CardTitle>
          <CardDescription>{t("branding.logosDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-3">
            {LOGO_SLOTS.map((slot) => {
              const src = logoUrl(draft.logos?.[slot]);
              const label =
                slot === "light" ? t("branding.logoLight") : slot === "dark" ? t("branding.logoDark") : t("branding.favicon");
              return (
                <div key={slot} className="space-y-2">
                  <Label>{label}</Label>
                  <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border bg-muted p-2">
                    {src ? (
                      <img src={src} alt={label} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("branding.noLogo")}</span>
                    )}
                  </div>
                  <input
                    ref={(el) => {
                      fileInputs.current[slot] = el;
                    }}
                    type="file"
                    accept={LOGO_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onUpload(slot, file);
                    }}
                    data-testid={`branding-logo-${slot}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={uploadingSlot !== null}
                    onClick={() => fileInputs.current[slot]?.click()}
                  >
                    {uploadingSlot === slot ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span className="ms-1.5">{label}</span>
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={updateBranding.isPending} data-testid="branding-save">
          {updateBranding.isPending && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
          {updateBranding.isPending ? t("branding.saving") : t("branding.save")}
        </Button>
      </div>
    </div>
  );
}
