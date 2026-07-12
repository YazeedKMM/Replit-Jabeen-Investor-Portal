import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetTemplate,
  getGetTemplateQueryKey,
  useCreateTemplate,
  useReplaceTemplate,
  type TemplateInput,
  type StageInput,
  type StageFieldInput,
  type StageInputCategory,
  type StageFieldInputBaseType,
  type StageFieldInputWidget,
  type StageFieldInputConfig,
} from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ChevronDown, ChevronUp, Eye, GitBranch, GripVertical,
  Layers, Plus, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";

const genId = () => Math.random().toString(36).slice(2, 11);

// `config` is carried opaquely (the builder doesn't edit it) so a template whose
// fields have config don't lose it on save. `optionsStr` is the editable form of `options`.
type LocalField = Omit<StageFieldInput, "options"> & { id: string; optionsStr: string; config?: StageFieldInputConfig };
type LocalStage = Omit<StageInput, "fields"> & { id: string; fields: LocalField[] };
type LocalTemplate = Omit<TemplateInput, "stages"> & { stages: LocalStage[] };

const EMPTY_TEMPLATE: LocalTemplate = { name: "", description: "", isDefault: false, stages: [] };

/** Widgets available for each base type — the exact base-type → widget mapping. */
const WIDGETS_BY_TYPE: Record<string, { value: StageFieldInputWidget; labelKey: string }[]> = {
  text:            [{ value: "single-line", labelKey: "admin.templateBuilder.stages.widgetSingleLine" }, { value: "multi-line", labelKey: "admin.templateBuilder.stages.widgetMultiLine" }],
  number:          [{ value: "number", labelKey: "admin.templateBuilder.stages.widgetNumber" }],
  date:            [{ value: "date", labelKey: "admin.templateBuilder.stages.widgetDate" }],
  boolean:         [{ value: "toggle", labelKey: "admin.templateBuilder.stages.widgetToggle" }],
  "single-choice": [{ value: "drop-list", labelKey: "admin.templateBuilder.stages.widgetDropList" }, { value: "radio", labelKey: "admin.templateBuilder.stages.widgetRadio" }],
  "multi-choice":  [{ value: "checkbox-list", labelKey: "admin.templateBuilder.stages.widgetCheckboxList" }],
  file:            [{ value: "file-upload", labelKey: "admin.templateBuilder.stages.widgetFileUpload" }],
  image:           [{ value: "single-photo", labelKey: "admin.templateBuilder.stages.widgetSinglePhoto" }, { value: "photo-gallery", labelKey: "admin.templateBuilder.stages.widgetPhotoGallery" }],
};

const DEFAULT_WIDGET: Record<string, StageFieldInputWidget> = {
  text: "single-line", number: "number", date: "date",
  boolean: "toggle", "single-choice": "drop-list", "multi-choice": "checkbox-list",
  file: "file-upload", image: "single-photo",
};

const CATEGORY_TINT: Record<StageInputCategory, string> = {
  "on-hold": "bg-warning/20 text-foreground",
  active: "bg-secondary/10 text-foreground",
  complete: "bg-success/15 text-foreground",
};

// ── Live field preview ─────────────────────────────────────────────────────────
function FieldPreview({ field }: { field: LocalField }) {
  const { t } = useTranslation();
  const options = field.optionsStr.split("\n").map((o) => o.trim()).filter(Boolean);
  const label = field.name || t("admin.templateBuilder.stages.previewFieldLabel");
  const placeholder = t("admin.templateBuilder.stages.previewEnterValue", { label });

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/10 p-3">
      <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Eye className="h-3 w-3" aria-hidden="true" /> {t("admin.templateBuilder.stages.previewLabel")}
      </p>
      <div className="max-w-xs space-y-1.5">
        <Label className="text-xs font-medium">
          {label}{field.required && <span className="text-destructive ms-0.5">*</span>}
        </Label>
        {field.widget === "single-line" && <Input className="h-8 text-sm" placeholder={placeholder} disabled />}
        {field.widget === "multi-line" && <Textarea className="min-h-[60px] resize-none text-sm" placeholder={placeholder} disabled />}
        {field.widget === "number" && <Input type="number" className="h-8 text-sm" placeholder="0" disabled />}
        {field.widget === "date" && <Input type="date" className="h-8 text-sm" disabled />}
        {field.widget === "toggle" && (
          <div className="flex items-center gap-2">
            <Switch disabled />
            <span className="text-xs text-muted-foreground">{t("admin.templateBuilder.stages.previewYesNo")}</span>
          </div>
        )}
        {field.widget === "file-upload" && (
          <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
            {t("admin.templateBuilder.stages.previewUploadFile")}
          </div>
        )}
        {(field.widget === "single-photo" || field.widget === "photo-gallery") && (
          <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
            {field.widget === "photo-gallery" ? t("admin.templateBuilder.stages.previewUploadPhotos") : t("admin.templateBuilder.stages.previewUploadPhoto")}
          </div>
        )}
        {field.widget === "drop-list" && (
          <Select disabled>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={options.length ? options[0] : t("admin.templateBuilder.stages.previewChooseOption")} />
            </SelectTrigger>
          </Select>
        )}
        {field.widget === "radio" && (options.length > 0 ? (
          <RadioGroup disabled className="space-y-1">
            {options.slice(0, 4).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`prev-radio-${field.id}-${i}`} />
                <Label htmlFor={`prev-radio-${field.id}-${i}`} className="text-xs font-normal">{opt}</Label>
              </div>
            ))}
          </RadioGroup>
        ) : (
          <p className="text-xs italic text-muted-foreground">{t("admin.templateBuilder.stages.previewAddOptions")}</p>
        ))}
        {field.widget === "checkbox-list" && (options.length > 0 ? (
          <div className="space-y-1">
            {options.slice(0, 4).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Checkbox id={`prev-cb-${field.id}-${i}`} disabled />
                <Label htmlFor={`prev-cb-${field.id}-${i}`} className="text-xs font-normal">{opt}</Label>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground">{t("admin.templateBuilder.stages.previewAddOptionsCheckbox")}</p>
        ))}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TemplateBuilderPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isNew = !params.id || params.id === "new";
  const templateId = isNew ? 0 : parseInt(params.id!, 10);

  const { data: serverTemplate, isLoading: loadingTemplate } = useGetTemplate(templateId, {
    // Don't refetch mid-edit — a focus/reconnect refetch would overwrite unsaved local edits.
    query: {
      enabled: !isNew && !!templateId,
      queryKey: getGetTemplateQueryKey(templateId),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  const createTemplate = useCreateTemplate();
  const replaceTemplate = useReplaceTemplate();

  const [template, setTemplate] = useState<LocalTemplate>(EMPTY_TEMPLATE);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify(EMPTY_TEMPLATE));
  const [confirmKind, setConfirmKind] = useState<null | "save" | "discard" | "leave">(null);

  const isArchived = !isNew && !!serverTemplate?.archivedAt;
  const assignedProjectCount = !isNew ? serverTemplate?.assignedProjectCount ?? 0 : 0;
  const readOnly = isArchived;

  // Seed local state from the server template (edit mode), once it resolves.
  useEffect(() => {
    if (!serverTemplate || isNew) return;
    const mapped: LocalTemplate = {
      name: serverTemplate.name,
      description: serverTemplate.description || "",
      isDefault: serverTemplate.isDefault,
      stages: serverTemplate.stages.map((s) => ({
        id: genId(),
        name: s.name,
        description: s.description || "",
        progressBaseline: s.progressBaseline,
        category: s.category as StageInputCategory,
        fields: (s.fields || []).map((f) => ({
          id: genId(),
          name: f.name,
          baseType: f.baseType as StageFieldInputBaseType,
          widget: f.widget as StageFieldInputWidget,
          required: f.required,
          optionsStr: f.options ? f.options.join("\n") : "",
          config: f.config,
        })),
      })),
    };
    setTemplate(mapped);
    setSavedSnapshot(JSON.stringify(mapped));
    setSelectedStageId(mapped.stages[0]?.id ?? null);
  }, [serverTemplate, isNew]);

  const dirty = useMemo(() => JSON.stringify(template) !== savedSnapshot, [template, savedSnapshot]);
  const selectedStage = template.stages.find((s) => s.id === selectedStageId) ?? null;

  // ── Stage / field mutations (local) ──
  const addStage = () => {
    const stage: LocalStage = {
      id: genId(),
      name: t("admin.templateBuilder.stages.newStageName"),
      description: "",
      progressBaseline: 0,
      category: "active",
      fields: [],
    };
    setTemplate((prev) => ({ ...prev, stages: [...prev.stages, stage] }));
    setSelectedStageId(stage.id);
  };

  const removeStage = (stageId: string) => {
    // Compute the next selection outside the state updater (no side effects in updaters).
    if (selectedStageId === stageId) {
      const idx = template.stages.findIndex((s) => s.id === stageId);
      const remaining = template.stages.filter((s) => s.id !== stageId);
      setSelectedStageId((remaining[idx] ?? remaining[idx - 1] ?? null)?.id ?? null);
    }
    setTemplate((prev) => ({ ...prev, stages: prev.stages.filter((s) => s.id !== stageId) }));
  };

  const updateStage = (stageId: string, updates: Partial<LocalStage>) => {
    setTemplate((prev) => ({ ...prev, stages: prev.stages.map((s) => (s.id === stageId ? { ...s, ...updates } : s)) }));
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= template.stages.length) return;
    setTemplate((prev) => {
      const stages = [...prev.stages];
      [stages[index], stages[target]] = [stages[target], stages[index]];
      return { ...prev, stages };
    });
  };

  const addField = (stageId: string) => {
    const field: LocalField = {
      id: genId(),
      name: t("admin.templateBuilder.stages.newFieldName"),
      baseType: "text",
      widget: "single-line",
      required: false,
      optionsStr: "",
    };
    setTemplate((prev) => ({
      ...prev,
      stages: prev.stages.map((s) => (s.id !== stageId ? s : { ...s, fields: [...s.fields, field] })),
    }));
  };

  const removeField = (stageId: string, fieldId: string) => {
    setTemplate((prev) => ({
      ...prev,
      stages: prev.stages.map((s) => (s.id !== stageId ? s : { ...s, fields: s.fields.filter((f) => f.id !== fieldId) })),
    }));
  };

  const updateField = (stageId: string, fieldId: string, updates: Partial<LocalField>) => {
    setTemplate((prev) => ({
      ...prev,
      stages: prev.stages.map((s) => (s.id !== stageId ? s : {
        ...s,
        fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
      })),
    }));
  };

  const changeBaseType = (stageId: string, fieldId: string, baseType: StageFieldInputBaseType) => {
    updateField(stageId, fieldId, { baseType, widget: DEFAULT_WIDGET[baseType] ?? "single-line" });
  };

  // ── Save ──
  const buildPayload = (): TemplateInput => ({
    name: template.name.trim(),
    description: template.description,
    isDefault: template.isDefault,
    stages: template.stages.map((s) => ({
      name: s.name,
      description: s.description,
      progressBaseline: Number(s.progressBaseline),
      category: s.category,
      fields: s.fields.map((f) => {
        const isChoice = f.baseType === "single-choice" || f.baseType === "multi-choice";
        return {
          name: f.name,
          baseType: f.baseType,
          widget: f.widget,
          required: f.required,
          // Only choice fields carry options; otherwise stale options from a since-changed
          // base type would be persisted onto a non-choice field.
          options: isChoice ? f.optionsStr.split("\n").map((o) => o.trim()).filter(Boolean) : [],
          ...(f.config !== undefined ? { config: f.config } : {}),
        };
      }),
    })),
  });

  const doSave = async () => {
    const payload = buildPayload();
    try {
      if (isNew) {
        await createTemplate.mutateAsync({ data: payload });
        toast({ title: t("admin.templateBuilder.toast.created"), description: t("admin.templateBuilder.toast.createdDesc", { name: payload.name }) });
      } else {
        const result = await replaceTemplate.mutateAsync({ templateId, data: payload });
        if (result.versionCreated) {
          toast({ title: t("admin.templateBuilder.toast.newVersion"), description: t("admin.templateBuilder.toast.newVersionDesc") });
        } else {
          toast({ title: t("admin.templateBuilder.toast.updated"), description: t("admin.templateBuilder.toast.updatedDesc", { name: payload.name }) });
        }
      }
      setSavedSnapshot(JSON.stringify(template));
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setLocation("/templates");
    } catch (error: unknown) {
      toast({ title: t("admin.templateBuilder.toast.saveFailed"), description: apiErrorMessage(error, t("common.somethingWrong")), variant: "destructive" });
    }
  };

  const handleSaveClick = () => {
    if (!template.name.trim()) {
      toast({ title: t("admin.templateBuilder.nameRequired"), variant: "destructive" });
      return;
    }
    // Saving an in-use template creates a new version — confirm before proceeding.
    if (!isNew && assignedProjectCount > 0) {
      setConfirmKind("save");
      return;
    }
    doSave();
  };

  const handleDiscard = () => {
    const restored: LocalTemplate = JSON.parse(savedSnapshot);
    setTemplate(restored);
    // Keep the current stage selected if it still exists after discarding.
    setSelectedStageId((prev) =>
      restored.stages.some((s) => s.id === prev) ? prev : restored.stages[0]?.id ?? null,
    );
    setConfirmKind(null);
    toast({ title: t("admin.templateBuilder.toast.discarded") });
  };

  // Back navigation guards unsaved edits behind the discard-style confirm.
  const handleBack = () => {
    if (dirty && !readOnly) setConfirmKind("leave");
    else setLocation("/templates");
  };

  const isSaving = createTemplate.isPending || replaceTemplate.isPending;

  // ── Loading skeleton ──
  if (!isNew && loadingTemplate) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-4 border-b border-card-border pb-4">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="flex-1 space-y-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-32" /></div>
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-4 border-b border-card-border pb-4">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label={t("common.back")}>
          <ArrowLeft className="h-4 w-4 rtl-flip" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {isNew ? t("admin.templateBuilder.newTitle") : t("admin.templateBuilder.editTitle")}
          </h1>
          {!isNew && serverTemplate && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
              {t("admin.templateBuilder.versionLabel", { version: serverTemplate.versionNumber })}
              {isArchived && <span className="text-warning ms-1">{t("admin.templateBuilder.archivedLabel")}</span>}
            </p>
          )}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!dirty || isSaving} onClick={() => setConfirmKind("discard")}>
              {t("admin.templateBuilder.discard")}
            </Button>
            <Button size="sm" disabled={isSaving} onClick={handleSaveClick}>
              {isSaving && <Spinner aria-hidden="true" />}
              {t("admin.templateBuilder.saveTemplate")}
            </Button>
          </div>
        )}
      </div>

      {/* ── Status banners ── */}
      {isArchived && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
          {t("admin.templateBuilder.archivedAlert")}
        </div>
      )}
      {!isNew && !isArchived && assignedProjectCount > 0 && (
        <div className="rounded-lg border border-secondary/30 bg-secondary/10 px-4 py-3 text-sm text-foreground">
          {stripTags(t("admin.templateBuilder.inUseAlert", { count: assignedProjectCount, version: serverTemplate?.versionNumber }))}
        </div>
      )}

      {/* ── Template details ── */}
      <section className="rounded-xl border border-card-border bg-card p-5 sm:p-6">
        <div className="space-y-1">
          <h2 className="text-base font-medium text-foreground">{t("admin.templateBuilder.detailsCard.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("admin.templateBuilder.detailsCard.description")}</p>
        </div>
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">{t("admin.templateBuilder.detailsCard.fieldName")}</Label>
              <Input
                id="tpl-name"
                value={template.name}
                onChange={(e) => setTemplate((p) => ({ ...p, name: e.target.value }))}
                placeholder={t("admin.templateBuilder.detailsCard.fieldNamePlaceholder")}
                disabled={readOnly}
              />
            </div>
            <div className="flex items-center gap-3 md:pt-8">
              <Switch
                id="tpl-default"
                checked={template.isDefault}
                onCheckedChange={(c) => setTemplate((p) => ({ ...p, isDefault: c }))}
                disabled={readOnly}
              />
              <Label htmlFor="tpl-default">{t("admin.templateBuilder.detailsCard.fieldDefault")}</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-desc">{t("admin.templateBuilder.detailsCard.fieldDescription")}</Label>
            <Textarea
              id="tpl-desc"
              value={template.description}
              onChange={(e) => setTemplate((p) => ({ ...p, description: e.target.value }))}
              disabled={readOnly}
            />
          </div>
        </div>
      </section>

      {/* ── Stages: rail + editor ── */}
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold text-foreground">{t("admin.templateBuilder.stages.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.templateBuilder.stages.subtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Stage rail */}
        <div className="space-y-3">
          <div className="rounded-xl border border-card-border bg-card p-2">
            {template.stages.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("admin.templateBuilder.stages.noStages")}
                {!readOnly && t("admin.templateBuilder.stages.noStagesHint")}
              </p>
            ) : (
              <ul className="space-y-1">
                {template.stages.map((stage, index) => {
                  const active = stage.id === selectedStageId;
                  return (
                    <li key={stage.id}>
                      <div
                        className={cn(
                          "group flex items-center gap-1 rounded-lg border border-transparent px-1.5 py-1.5 transition-colors duration-150",
                          active ? "border-border bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                        <button
                          type="button"
                          onClick={() => setSelectedStageId(stage.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-start"
                        >
                          <span className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                            active ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-foreground",
                          )}>
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {stage.name || t("admin.templateBuilder.stages.unnamedStage")}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {stage.progressBaseline}% {t("admin.templateBuilder.stages.baselineLabel")}
                            </span>
                          </span>
                        </button>
                        {!readOnly && (
                          <div className="flex shrink-0 flex-col">
                            <button
                              type="button"
                              className="flex h-4 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                              disabled={index === 0}
                              onClick={() => moveStage(index, -1)}
                              aria-label={t("common.moveUp")}
                            >
                              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="flex h-4 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                              disabled={index === template.stages.length - 1}
                              onClick={() => moveStage(index, 1)}
                              aria-label={t("common.moveDown")}
                            >
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {!readOnly && (
            <Button variant="outline" size="sm" className="w-full" onClick={addStage}>
              <Plus className="me-2 h-4 w-4" aria-hidden="true" /> {t("admin.templateBuilder.stages.addStage")}
            </Button>
          )}
        </div>

        {/* Selected-stage editor */}
        <div className="min-w-0">
          {!selectedStage ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center">
              <Layers className="h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{t("admin.templateBuilder.stages.selectStageTitle")}</p>
                <p className="mx-auto max-w-xs text-sm text-muted-foreground">{t("admin.templateBuilder.stages.selectStageDesc")}</p>
              </div>
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={addStage}>
                  <Plus className="me-1.5 h-3.5 w-3.5" aria-hidden="true" /> {t("admin.templateBuilder.stages.addStage")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6 rounded-xl border border-card-border bg-card p-5 sm:p-6">
              {/* Stage meta */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", CATEGORY_TINT[selectedStage.category])}>
                    {t(`admin.templateBuilder.stages.category${selectedStage.category === "on-hold" ? "OnHold" : selectedStage.category === "active" ? "Active" : "Complete"}`)}
                  </span>
                </div>
                {!readOnly && (
                  <Button
                    variant="ghost" size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeStage(selectedStage.id)}
                    aria-label={t("admin.templateBuilder.stages.removeStage")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={`st-name-${selectedStage.id}`}>{t("admin.templateBuilder.stages.fieldStageName")}</Label>
                  <Input id={`st-name-${selectedStage.id}`} value={selectedStage.name} onChange={(e) => updateStage(selectedStage.id, { name: e.target.value })} disabled={readOnly} />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.templateBuilder.stages.fieldCategory")}</Label>
                  <Select value={selectedStage.category} onValueChange={(v: StageInputCategory) => updateStage(selectedStage.id, { category: v })} disabled={readOnly}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on-hold">{t("admin.templateBuilder.stages.categoryOnHold")}</SelectItem>
                      <SelectItem value="active">{t("admin.templateBuilder.stages.categoryActive")}</SelectItem>
                      <SelectItem value="complete">{t("admin.templateBuilder.stages.categoryComplete")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`st-base-${selectedStage.id}`}>{t("admin.templateBuilder.stages.fieldProgressBaseline")}</Label>
                  <Input
                    id={`st-base-${selectedStage.id}`}
                    type="number" min={0} max={100} inputMode="numeric"
                    className="tabular-nums"
                    value={selectedStage.progressBaseline}
                    onChange={(e) => updateStage(selectedStage.id, { progressBaseline: Number(e.target.value) })}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label htmlFor={`st-desc-${selectedStage.id}`}>{t("admin.templateBuilder.stages.fieldDescription")}</Label>
                  <Input id={`st-desc-${selectedStage.id}`} value={selectedStage.description} onChange={(e) => updateStage(selectedStage.id, { description: e.target.value })} disabled={readOnly} />
                </div>
              </div>

              {/* Fields */}
              <div className="border-t border-border pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <Label className="text-base font-medium">{t("admin.templateBuilder.stages.customFields")}</Label>
                  {!readOnly && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addField(selectedStage.id)}>
                      <Plus className="me-1 h-3 w-3" aria-hidden="true" /> {t("admin.templateBuilder.stages.addField")}
                    </Button>
                  )}
                </div>

                {selectedStage.fields.length === 0 ? (
                  <p className="ps-1 text-sm italic text-muted-foreground">{t("admin.templateBuilder.stages.noFields")}</p>
                ) : (
                  <div className="space-y-4">
                    {selectedStage.fields.map((field) => {
                      const availableWidgets = WIDGETS_BY_TYPE[field.baseType] ?? WIDGETS_BY_TYPE.text;
                      const needsOptions = field.baseType === "single-choice" || field.baseType === "multi-choice";
                      return (
                        <div key={field.id} className="overflow-hidden rounded-lg border border-border bg-background">
                          <div className="flex flex-col items-start gap-3 p-3 md:flex-row">
                            <div className="grid w-full flex-1 grid-cols-2 gap-3 md:grid-cols-4">
                              <div className="space-y-1">
                                <Label className="text-xs">{t("admin.templateBuilder.stages.fieldLabel")}</Label>
                                <Input className="h-8 text-sm" value={field.name} onChange={(e) => updateField(selectedStage.id, field.id, { name: e.target.value })} disabled={readOnly} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{t("admin.templateBuilder.stages.fieldDataType")}</Label>
                                <Select value={field.baseType} onValueChange={(v: StageFieldInputBaseType) => changeBaseType(selectedStage.id, field.id, v)} disabled={readOnly}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="text">{t("admin.templateBuilder.stages.typeText")}</SelectItem>
                                    <SelectItem value="number">{t("admin.templateBuilder.stages.typeNumber")}</SelectItem>
                                    <SelectItem value="date">{t("admin.templateBuilder.stages.typeDate")}</SelectItem>
                                    <SelectItem value="boolean">{t("admin.templateBuilder.stages.typeBoolean")}</SelectItem>
                                    <SelectItem value="single-choice">{t("admin.templateBuilder.stages.typeSingleChoice")}</SelectItem>
                                    <SelectItem value="multi-choice">{t("admin.templateBuilder.stages.typeMultiChoice")}</SelectItem>
                                    <SelectItem value="file">{t("admin.templateBuilder.stages.typeFile")}</SelectItem>
                                    <SelectItem value="image">{t("admin.templateBuilder.stages.typeImage")}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{t("admin.templateBuilder.stages.fieldWidget")}</Label>
                                <Select value={field.widget} onValueChange={(v: StageFieldInputWidget) => updateField(selectedStage.id, field.id, { widget: v })} disabled={readOnly}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {availableWidgets.map((w) => (
                                      <SelectItem key={w.value} value={w.value}>{t(w.labelKey)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex flex-col justify-end space-y-1 pb-1">
                                <div className="flex items-center gap-2">
                                  <Switch id={`req-${field.id}`} checked={field.required} onCheckedChange={(c) => updateField(selectedStage.id, field.id, { required: c })} disabled={readOnly} />
                                  <Label htmlFor={`req-${field.id}`} className="text-xs font-normal">{t("admin.templateBuilder.stages.fieldRequired")}</Label>
                                </div>
                              </div>
                            </div>
                            {!readOnly && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 shrink-0 self-end text-destructive hover:text-destructive md:self-center"
                                onClick={() => removeField(selectedStage.id, field.id)}
                                aria-label={t("admin.templateBuilder.stages.removeField")}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                          </div>

                          {needsOptions && (
                            <div className="px-3 pb-3">
                              <Label className="text-xs">
                                {t("admin.templateBuilder.stages.fieldOptions")}{" "}
                                <span className="font-normal text-muted-foreground">{t("admin.templateBuilder.stages.fieldOptionsHint")}</span>
                              </Label>
                              <Textarea
                                className="mt-1 h-20 resize-none text-xs"
                                value={field.optionsStr}
                                onChange={(e) => updateField(selectedStage.id, field.id, { optionsStr: e.target.value })}
                                placeholder={t("admin.templateBuilder.stages.fieldOptionsPlaceholder")}
                                disabled={readOnly}
                              />
                            </div>
                          )}

                          <div className="px-3 pb-3">
                            <FieldPreview field={field} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm: save-as-new-version / discard ── */}
      <AlertDialog open={!!confirmKind} onOpenChange={(o) => { if (!o) setConfirmKind(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmKind === "discard" ? t("admin.templateBuilder.discardDialogTitle")
                : confirmKind === "leave" ? t("admin.templateBuilder.leaveDialogTitle")
                : t("admin.templateBuilder.saveDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmKind === "discard" ? t("admin.templateBuilder.discardDialogDesc")
                : confirmKind === "leave" ? t("admin.templateBuilder.leaveDialogDesc")
                : stripTags(t("admin.templateBuilder.inUseConfirm", {
                    count: assignedProjectCount,
                    plural: assignedProjectCount !== 1 ? "s" : "",
                    newVersion: (serverTemplate?.versionNumber ?? 1) + 1,
                  }))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmKind === "discard") handleDiscard();
                else if (confirmKind === "leave") { setConfirmKind(null); setLocation("/templates"); }
                else { setConfirmKind(null); doSave(); }
              }}
            >
              {confirmKind === "discard" ? t("admin.templateBuilder.discard")
                : confirmKind === "leave" ? t("admin.templateBuilder.leaveConfirm")
                : t("admin.templateBuilder.saveTemplate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Strip the i18n emphasis markers (`<1>…</1>`) that wrap counts in some copy. */
function stripTags(s: string): string {
  return s.replace(/<\/?1>/g, "");
}
