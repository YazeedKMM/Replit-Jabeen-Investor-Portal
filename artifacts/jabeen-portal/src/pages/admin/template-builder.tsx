import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetTemplate,
  getGetTemplateQueryKey,
  useCreateTemplate,
  useReplaceTemplate,
  TemplateInput,
  StageInput,
  StageFieldInput,
  StageInputCategory,
  StageFieldInputBaseType,
  StageFieldInputWidget
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { DgaContentCard } from "@/components/ui/dga-card";
import { DgaBrandButton } from "@/components/ui/dga-brand-button";
import { DgaInlineAlert } from "platformscode-new-react";
import { ArrowLeft, Plus, Trash2, GripVertical, Loader2, Eye, GitBranch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

const genId = () => Math.random().toString(36).substr(2, 9);

type LocalField = Omit<StageFieldInput, "options"> & { id: string; optionsStr: string };
type LocalStage = Omit<StageInput, "fields"> & { id: string; fields: LocalField[] };
type LocalTemplate = Omit<TemplateInput, "stages"> & { stages: LocalStage[] };

/** Widgets available for each base type */
const WIDGETS_BY_TYPE: Record<string, { value: string; labelKey: string }[]> = {
  text:           [{ value: "single-line", labelKey: "admin.templateBuilder.stages.widgetSingleLine" }, { value: "multi-line", labelKey: "admin.templateBuilder.stages.widgetMultiLine" }],
  number:         [{ value: "number", labelKey: "admin.templateBuilder.stages.widgetNumber" }],
  date:           [{ value: "date", labelKey: "admin.templateBuilder.stages.widgetDate" }],
  boolean:        [{ value: "toggle", labelKey: "admin.templateBuilder.stages.widgetToggle" }],
  "single-choice":[{ value: "drop-list", labelKey: "admin.templateBuilder.stages.widgetDropList" }, { value: "radio", labelKey: "admin.templateBuilder.stages.widgetRadio" }],
  "multi-choice": [{ value: "checkbox-list", labelKey: "admin.templateBuilder.stages.widgetCheckboxList" }],
  file:           [{ value: "file-upload", labelKey: "admin.templateBuilder.stages.widgetFileUpload" }],
  image:          [{ value: "single-photo", labelKey: "admin.templateBuilder.stages.widgetSinglePhoto" }, { value: "photo-gallery", labelKey: "admin.templateBuilder.stages.widgetPhotoGallery" }],
};

const DEFAULT_WIDGET: Record<string, string> = {
  text: "single-line", number: "number", date: "date",
  boolean: "toggle", "single-choice": "drop-list", "multi-choice": "checkbox-list",
  file: "file-upload", image: "single-photo",
};

/** Renders a live preview of the field based on its widget type */
function FieldPreview({ field }: { field: LocalField }) {
  const { t } = useTranslation();
  const options = field.optionsStr.split('\n').map(o => o.trim()).filter(Boolean);
  const label = field.name || "Field Label";
  const required = field.required;

  return (
    <div className="p-3 rounded-md bg-muted/10 border border-dashed">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
        <Eye className="h-3 w-3" /> {t("admin.templateBuilder.stages.previewLabel")}
      </p>
      <div className="space-y-1.5 max-w-xs">
        <Label className="text-xs font-medium">
          {label}{required && <span className="text-destructive ms-0.5">*</span>}
        </Label>
        {field.widget === "single-line" && (
          <Input className="h-8 text-sm" placeholder={`Enter ${label.toLowerCase()}...`} disabled />
        )}
        {field.widget === "multi-line" && (
          <Textarea className="text-sm min-h-[60px] resize-none" placeholder={`Enter ${label.toLowerCase()}...`} disabled />
        )}
        {field.widget === "number" && (
          <Input type="number" className="h-8 text-sm" placeholder="0" disabled />
        )}
        {field.widget === "date" && (
          <Input type="date" className="h-8 text-sm" disabled />
        )}
        {field.widget === "toggle" && (
          <div className="flex items-center gap-2">
            <Switch disabled />
            <span className="text-xs text-muted-foreground">{t("admin.templateBuilder.stages.previewYesNo")}</span>
          </div>
        )}
        {field.widget === "file-upload" && (
          <div className="flex items-center gap-2 h-8 px-3 border rounded-md bg-muted/30 text-muted-foreground text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            {t("admin.templateBuilder.stages.previewUploadFile")}
          </div>
        )}
        {(field.widget === "single-photo" || field.widget === "photo-gallery") && (
          <div className="flex items-center gap-2 h-8 px-3 border rounded-md bg-muted/30 text-muted-foreground text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
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
        {field.widget === "radio" && options.length > 0 && (
          <RadioGroup disabled className="space-y-1">
            {options.slice(0, 4).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`prev-radio-${field.id}-${i}`} />
                <Label htmlFor={`prev-radio-${field.id}-${i}`} className="text-xs font-normal">{opt}</Label>
              </div>
            ))}
          </RadioGroup>
        )}
        {field.widget === "radio" && options.length === 0 && (
          <p className="text-xs text-muted-foreground italic">{t("admin.templateBuilder.stages.previewAddOptions")}</p>
        )}
        {field.widget === "checkbox-list" && options.length > 0 && (
          <div className="space-y-1">
            {options.slice(0, 4).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Checkbox id={`prev-cb-${field.id}-${i}`} disabled />
                <Label htmlFor={`prev-cb-${field.id}-${i}`} className="text-xs font-normal">{opt}</Label>
              </div>
            ))}
          </div>
        )}
        {field.widget === "checkbox-list" && options.length === 0 && (
          <p className="text-xs text-muted-foreground italic">{t("admin.templateBuilder.stages.previewAddOptionsCheckbox")}</p>
        )}
      </div>
    </div>
  );
}

export default function TemplateBuilderPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const isNew = !params.id || params.id === "new";
  const templateId = isNew ? 0 : parseInt(params.id!);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: serverTemplate, isLoading: loadingTemplate } = useGetTemplate(templateId, {
    query: { enabled: !isNew && !!templateId, queryKey: getGetTemplateQueryKey(templateId) }
  });

  const createMutation = useCreateTemplate();
  const updateMutation = useReplaceTemplate();

  const [template, setTemplate] = useState<LocalTemplate>({
    name: "", description: "", isDefault: false, stages: []
  });

  const isArchived = !isNew && !!serverTemplate?.archivedAt;
  const assignedProjectCount = !isNew ? (serverTemplate as any)?.assignedProjectCount ?? 0 : 0;

  useEffect(() => {
    if (serverTemplate && !isNew) {
      setTemplate({
        name: serverTemplate.name,
        description: serverTemplate.description || "",
        isDefault: serverTemplate.isDefault,
        stages: serverTemplate.stages.map(s => ({
          id: genId(),
          name: s.name,
          description: s.description || "",
          progressBaseline: s.progressBaseline,
          category: s.category as StageInputCategory,
          fields: (s.fields || []).map(f => ({
            id: genId(),
            name: f.name,
            baseType: f.baseType as StageFieldInputBaseType,
            widget: f.widget as StageFieldInputWidget,
            required: f.required,
            optionsStr: f.options ? f.options.join("\n") : ""
          }))
        }))
      });
    }
  }, [serverTemplate, isNew]);

  const addStage = () => {
    setTemplate(prev => ({
      ...prev,
      stages: [...prev.stages, { id: genId(), name: "New Stage", description: "", progressBaseline: 0, category: "active", fields: [] }]
    }));
  };

  const removeStage = (stageId: string) => {
    setTemplate(prev => ({ ...prev, stages: prev.stages.filter(s => s.id !== stageId) }));
  };

  const addField = (stageId: string) => {
    setTemplate(prev => ({
      ...prev,
      stages: prev.stages.map(s => s.id !== stageId ? s : {
        ...s,
        fields: [...s.fields, { id: genId(), name: "New Field", baseType: "text" as StageFieldInputBaseType, widget: "single-line" as StageFieldInputWidget, required: false, optionsStr: "" }]
      })
    }));
  };

  const removeField = (stageId: string, fieldId: string) => {
    setTemplate(prev => ({
      ...prev,
      stages: prev.stages.map(s => s.id !== stageId ? s : { ...s, fields: s.fields.filter(f => f.id !== fieldId) })
    }));
  };

  const updateStage = (stageId: string, updates: Partial<LocalStage>) => {
    setTemplate(prev => ({
      ...prev,
      stages: prev.stages.map(s => s.id === stageId ? { ...s, ...updates } : s)
    }));
  };

  const updateField = (stageId: string, fieldId: string, updates: Partial<LocalField>) => {
    setTemplate(prev => ({
      ...prev,
      stages: prev.stages.map(s => s.id !== stageId ? s : {
        ...s,
        fields: s.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
      })
    }));
  };

  const changeBaseType = (stageId: string, fieldId: string, baseType: string) => {
    const defaultWidget = DEFAULT_WIDGET[baseType] || "single-line";
    updateField(stageId, fieldId, { baseType: baseType as StageFieldInputBaseType, widget: defaultWidget as StageFieldInputWidget });
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    const newStages = [...template.stages];
    if (index + direction < 0 || index + direction >= newStages.length) return;
    const temp = newStages[index];
    newStages[index] = newStages[index + direction];
    newStages[index + direction] = temp;
    setTemplate(prev => ({ ...prev, stages: newStages }));
  };

  const handleSave = async () => {
    if (!template.name) { toast({ title: t("admin.templateBuilder.nameRequired"), variant: "destructive" }); return; }

    // If template is in use by projects, warn the user before creating a new version
    if (!isNew && assignedProjectCount > 0) {
      const confirmed = confirm(
        t("admin.templateBuilder.inUseConfirm", {
          count: assignedProjectCount,
          plural: assignedProjectCount !== 1 ? "s" : "",
          newVersion: (serverTemplate?.versionNumber ?? 1) + 1
        })
      );
      if (!confirmed) return;
    }

    const payload: TemplateInput = {
      name: template.name,
      description: template.description,
      isDefault: template.isDefault,
      stages: template.stages.map(s => ({
        name: s.name,
        description: s.description,
        progressBaseline: Number(s.progressBaseline),
        category: s.category,
        fields: s.fields.map(f => ({
          name: f.name,
          baseType: f.baseType,
          widget: f.widget,
          required: f.required,
          options: f.optionsStr.split('\n').map(o => o.trim()).filter(Boolean)
        }))
      }))
    };

    try {
      if (isNew) {
        await createMutation.mutateAsync({ data: payload });
        toast({ title: t("admin.templateBuilder.toast.created") });
      } else {
        const result = await updateMutation.mutateAsync({ templateId, data: payload });
        if (result.versionCreated) {
          toast({ title: t("admin.templateBuilder.toast.newVersion"), description: t("admin.templateBuilder.toast.newVersionDesc") });
        } else {
          toast({ title: t("admin.templateBuilder.toast.updated") });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setLocation("/templates");
    } catch (error: any) {
      toast({ title: t("admin.templateBuilder.toast.saveFailed"), description: error.data?.message || t("common.loading"), variant: "destructive" });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (!isNew && loadingTemplate) {
    return <div className="flex h-64 justify-center items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24">
      <div className="flex items-center gap-4 border-b pb-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/templates")} aria-label={t("common.back")}>
          <ArrowLeft className="h-4 w-4 rtl-flip" aria-hidden="true" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {isNew ? t("admin.templateBuilder.newTitle") : t("admin.templateBuilder.editTitle")}
          </h1>
          {!isNew && serverTemplate && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              {t("admin.templateBuilder.versionLabel", { version: serverTemplate.versionNumber })}
              {isArchived && <span className="text-amber-600 ms-1">{t("admin.templateBuilder.archivedLabel")}</span>}
            </p>
          )}
        </div>
        {!isArchived && (
          <DgaBrandButton label={t("admin.templateBuilder.saveTemplate")} disabled={isSaving} onOnClick={handleSave} />
        )}
      </div>

      {isArchived && (
        <DgaInlineAlert type="info" colored leadText={t("admin.templateBuilder.archivedAlert")} />
      )}

      {!isNew && !isArchived && assignedProjectCount > 0 && (
        <DgaInlineAlert
          type="info"
          colored
          leadText={t("admin.templateBuilder.inUseAlert", { count: assignedProjectCount, version: serverTemplate?.versionNumber }).replace(/<\/?1>/g, "")}
        />
      )}

      <DgaContentCard className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("admin.templateBuilder.detailsCard.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("admin.templateBuilder.detailsCard.description")}</p>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("admin.templateBuilder.detailsCard.fieldName")}</Label>
              <Input
                value={template.name}
                onChange={e => setTemplate({ ...template, name: e.target.value })}
                placeholder={t("admin.templateBuilder.detailsCard.fieldNamePlaceholder")}
                disabled={isArchived}
              />
            </div>
            <div className="flex items-center gap-2 pt-8">
              <Switch
                id="is-default"
                checked={template.isDefault}
                onCheckedChange={c => setTemplate({ ...template, isDefault: c })}
                disabled={isArchived}
              />
              <Label htmlFor="is-default">{t("admin.templateBuilder.detailsCard.fieldDefault")}</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.templateBuilder.detailsCard.fieldDescription")}</Label>
            <Textarea
              value={template.description}
              onChange={e => setTemplate({ ...template, description: e.target.value })}
              disabled={isArchived}
            />
          </div>
        </div>
      </DgaContentCard>

      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-xl font-bold">{t("admin.templateBuilder.stages.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("admin.templateBuilder.stages.subtitle")}</p>
          </div>
          {!isArchived && (
            <Button onClick={addStage} variant="outline" size="sm"><Plus className="me-2 h-4 w-4" /> {t("admin.templateBuilder.stages.addStage")}</Button>
          )}
        </div>

        {template.stages.length === 0 ? (
          <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
            <p className="text-muted-foreground">{t("admin.templateBuilder.stages.noStages")}{!isArchived && t("admin.templateBuilder.stages.noStagesHint")}</p>
          </div>
        ) : (
          <Accordion type="multiple" className="space-y-4">
            {template.stages.map((stage, index) => (
              <AccordionItem value={stage.id} key={stage.id} className="border rounded-lg bg-card px-4">
                <div className="flex items-center w-full gap-2">
                  {!isArchived && (
                    <div className="flex flex-col gap-1 px-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={(e) => { e.preventDefault(); moveStage(index, -1); }} aria-label={t("common.moveUp")}>
                        <GripVertical className="h-4 w-4 rotate-90" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                  <AccordionTrigger className="hover:no-underline py-4 flex-1">
                    <div className="flex items-center gap-4 text-start">
                      <span className="font-semibold text-lg flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground h-6 w-6 rounded-full flex items-center justify-center text-xs">{index + 1}</span>
                        {stage.name || "Unnamed Stage"}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">{stage.progressBaseline}% {t("admin.templateBuilder.stages.baselineLabel")}</span>
                    </div>
                  </AccordionTrigger>
                  {!isArchived && (
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => removeStage(stage.id)} aria-label={t("admin.templateBuilder.stages.removeStage")}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>

                <AccordionContent className="pt-2 pb-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-md">
                    <div className="space-y-2">
                      <Label>{t("admin.templateBuilder.stages.fieldStageName")}</Label>
                      <Input value={stage.name} onChange={e => updateStage(stage.id, { name: e.target.value })} disabled={isArchived} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.templateBuilder.stages.fieldCategory")}</Label>
                      <Select value={stage.category} onValueChange={(v: StageInputCategory) => updateStage(stage.id, { category: v })} disabled={isArchived}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="on-hold">{t("admin.templateBuilder.stages.categoryOnHold")}</SelectItem>
                          <SelectItem value="active">{t("admin.templateBuilder.stages.categoryActive")}</SelectItem>
                          <SelectItem value="complete">{t("admin.templateBuilder.stages.categoryComplete")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.templateBuilder.stages.fieldProgressBaseline")}</Label>
                      <Input type="number" min="0" max="100" value={stage.progressBaseline} onChange={e => updateStage(stage.id, { progressBaseline: Number(e.target.value) })} disabled={isArchived} />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <Label>{t("admin.templateBuilder.stages.fieldDescription")}</Label>
                      <Input value={stage.description} onChange={e => updateStage(stage.id, { description: e.target.value })} disabled={isArchived} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <Label className="text-base font-semibold">{t("admin.templateBuilder.stages.customFields")}</Label>
                      {!isArchived && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addField(stage.id)}><Plus className="me-1 h-3 w-3" /> {t("admin.templateBuilder.stages.addField")}</Button>
                      )}
                    </div>

                    {stage.fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic ps-2">{t("admin.templateBuilder.stages.noFields")}</p>
                    ) : (
                      <div className="space-y-4">
                        {stage.fields.map((field) => {
                          const availableWidgets = WIDGETS_BY_TYPE[field.baseType] || WIDGETS_BY_TYPE["text"];
                          const needsOptions = field.baseType === "single-choice" || field.baseType === "multi-choice";

                          return (
                            <div key={field.id} className="border rounded-lg bg-background overflow-hidden">
                              <div className="flex flex-col md:flex-row gap-3 items-start p-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 w-full">
                                  <div className="space-y-1">
                                    <Label className="text-xs">{t("admin.templateBuilder.stages.fieldLabel")}</Label>
                                    <Input className="h-8 text-sm" value={field.name} onChange={e => updateField(stage.id, field.id, { name: e.target.value })} disabled={isArchived} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">{t("admin.templateBuilder.stages.fieldDataType")}</Label>
                                    <Select value={field.baseType} onValueChange={(v) => changeBaseType(stage.id, field.id, v)} disabled={isArchived}>
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
                                    <Select
                                      value={field.widget}
                                      onValueChange={(v: any) => updateField(stage.id, field.id, { widget: v })}
                                      disabled={isArchived}
                                    >
                                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {availableWidgets.map(w => (
                                          <SelectItem key={w.value} value={w.value}>{t(w.labelKey)}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1 flex flex-col justify-end pb-1">
                                    <div className="flex items-center gap-2">
                                      <Switch id={`req-${field.id}`} checked={field.required} onCheckedChange={c => updateField(stage.id, field.id, { required: c })} disabled={isArchived} />
                                      <Label htmlFor={`req-${field.id}`} className="text-xs font-normal">{t("admin.templateBuilder.stages.fieldRequired")}</Label>
                                    </div>
                                  </div>
                                </div>

                                {!isArchived && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0 self-end md:self-center" onClick={() => removeField(stage.id, field.id)} aria-label={t("admin.templateBuilder.stages.removeField")}>
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                )}
                              </div>

                              {needsOptions && (
                                <div className="px-3 pb-3">
                                  <Label className="text-xs">{t("admin.templateBuilder.stages.fieldOptions")} <span className="text-muted-foreground font-normal">{t("admin.templateBuilder.stages.fieldOptionsHint")}</span></Label>
                                  <Textarea
                                    className="mt-1 text-xs resize-none h-20"
                                    value={field.optionsStr}
                                    onChange={e => updateField(stage.id, field.id, { optionsStr: e.target.value })}
                                    placeholder={"Option A\nOption B\nOption C"}
                                    disabled={isArchived}
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
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
