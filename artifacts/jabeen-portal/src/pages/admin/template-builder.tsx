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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Loader2, Eye, GitBranch, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const genId = () => Math.random().toString(36).substr(2, 9);

type LocalField = Omit<StageFieldInput, "options"> & { id: string; optionsStr: string };
type LocalStage = Omit<StageInput, "fields"> & { id: string; fields: LocalField[] };
type LocalTemplate = Omit<TemplateInput, "stages"> & { stages: LocalStage[] };

/** Widgets available for each base type */
const WIDGETS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  text:           [{ value: "single-line", label: "Single Line Input" }, { value: "multi-line", label: "Multi Line Text Area" }],
  number:         [{ value: "number", label: "Number Input" }],
  date:           [{ value: "date", label: "Date Picker" }],
  boolean:        [{ value: "toggle", label: "Toggle Switch" }],
  "single-choice":[{ value: "drop-list", label: "Dropdown List" }, { value: "radio", label: "Radio Buttons" }],
  "multi-choice": [{ value: "checkbox-list", label: "Checkboxes" }],
  file:           [{ value: "file-upload", label: "File Upload" }],
  image:          [{ value: "single-photo", label: "Single Photo" }, { value: "photo-gallery", label: "Photo Gallery (multiple)" }],
};

const DEFAULT_WIDGET: Record<string, string> = {
  text: "single-line", number: "number", date: "date",
  boolean: "toggle", "single-choice": "drop-list", "multi-choice": "checkbox-list",
  file: "file-upload", image: "single-photo",
};

/** Renders a live preview of the field based on its widget type */
function FieldPreview({ field }: { field: LocalField }) {
  const options = field.optionsStr.split('\n').map(o => o.trim()).filter(Boolean);
  const label = field.name || "Field Label";
  const required = field.required;

  return (
    <div className="p-3 rounded-md bg-muted/10 border border-dashed">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
        <Eye className="h-3 w-3" /> Preview
      </p>
      <div className="space-y-1.5 max-w-xs">
        <Label className="text-xs font-medium">
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
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
            <span className="text-xs text-muted-foreground">Yes / No</span>
          </div>
        )}
        {field.widget === "file-upload" && (
          <div className="flex items-center gap-2 h-8 px-3 border rounded-md bg-muted/30 text-muted-foreground text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            Upload file…
          </div>
        )}
        {(field.widget === "single-photo" || field.widget === "photo-gallery") && (
          <div className="flex items-center gap-2 h-8 px-3 border rounded-md bg-muted/30 text-muted-foreground text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            {field.widget === "photo-gallery" ? "Upload photos…" : "Upload photo…"}
          </div>
        )}
        {field.widget === "drop-list" && (
          <Select disabled>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={options.length ? options[0] : "Choose an option..."} />
            </SelectTrigger>
          </Select>
        )}
        {field.widget === "radio" && options.length > 0 && (
          <RadioGroup disabled className="space-y-1">
            {options.slice(0, 4).map((opt, i) => (
              <div key={i} className="flex items-center space-x-2">
                <RadioGroupItem value={opt} id={`prev-radio-${field.id}-${i}`} />
                <Label htmlFor={`prev-radio-${field.id}-${i}`} className="text-xs font-normal">{opt}</Label>
              </div>
            ))}
          </RadioGroup>
        )}
        {field.widget === "radio" && options.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Add options above to see radio buttons.</p>
        )}
        {field.widget === "checkbox-list" && options.length > 0 && (
          <div className="space-y-1">
            {options.slice(0, 4).map((opt, i) => (
              <div key={i} className="flex items-center space-x-2">
                <Checkbox id={`prev-cb-${field.id}-${i}`} disabled />
                <Label htmlFor={`prev-cb-${field.id}-${i}`} className="text-xs font-normal">{opt}</Label>
              </div>
            ))}
          </div>
        )}
        {field.widget === "checkbox-list" && options.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Add options above to see checkboxes.</p>
        )}
      </div>
    </div>
  );
}

export default function TemplateBuilderPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
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
    if (!template.name) { toast({ title: "Name required", variant: "destructive" }); return; }

    // If template is in use by projects, warn the user before creating a new version
    if (!isNew && assignedProjectCount > 0) {
      const confirmed = confirm(
        `This template is currently assigned to ${assignedProjectCount} project${assignedProjectCount !== 1 ? "s" : ""}.\n\nSaving will create a new version (v${(serverTemplate?.versionNumber ?? 1) + 1}). Existing projects will remain on their current version — your changes apply only to new assignments.`
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
        toast({ title: "Template created" });
      } else {
        const result = await updateMutation.mutateAsync({ templateId, data: payload });
        if (result.versionCreated) {
          toast({ title: "New version created", description: "The previous version is archived. Existing projects remain pinned to their version." });
        } else {
          toast({ title: "Template updated" });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setLocation("/templates");
    } catch (error: any) {
      toast({ title: "Save failed", description: error.data?.message || "An error occurred", variant: "destructive" });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (!isNew && loadingTemplate) {
    return <div className="flex h-64 justify-center items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24">
      <div className="flex items-center gap-4 border-b pb-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/templates")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {isNew ? "New Template" : "Edit Template"}
          </h1>
          {!isNew && serverTemplate && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              Version {serverTemplate.versionNumber}
              {isArchived && <span className="text-amber-600 ml-1">(archived)</span>}
            </p>
          )}
        </div>
        {!isArchived && (
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Template
          </Button>
        )}
      </div>

      {isArchived && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This template version is archived and cannot be edited. Projects currently using it remain unaffected. To make changes, create a new template.
          </AlertDescription>
        </Alert>
      )}

      {!isNew && !isArchived && assignedProjectCount > 0 && (
        <Alert>
          <GitBranch className="h-4 w-4" />
          <AlertDescription>
            This template is currently assigned to <strong>{assignedProjectCount} project{assignedProjectCount !== 1 ? "s" : ""}</strong>. Saving will create a new version — existing projects remain on version {serverTemplate?.versionNumber}.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
          <CardDescription>Basic information about this pipeline.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={template.name}
                onChange={e => setTemplate({ ...template, name: e.target.value })}
                placeholder="e.g. Standard Industrial Project"
                disabled={isArchived}
              />
            </div>
            <div className="flex items-center space-x-2 pt-8">
              <Switch
                id="is-default"
                checked={template.isDefault}
                onCheckedChange={c => setTemplate({ ...template, isDefault: c })}
                disabled={isArchived}
              />
              <Label htmlFor="is-default">Set as default for new projects</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={template.description}
              onChange={e => setTemplate({ ...template, description: e.target.value })}
              disabled={isArchived}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-xl font-bold">Pipeline Stages</h2>
            <p className="text-sm text-muted-foreground">Define the steps a project moves through, in order.</p>
          </div>
          {!isArchived && (
            <Button onClick={addStage} variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" /> Add Stage</Button>
          )}
        </div>

        {template.stages.length === 0 ? (
          <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
            <p className="text-muted-foreground">No stages defined yet.{!isArchived && " Click Add Stage to begin."}</p>
          </div>
        ) : (
          <Accordion type="multiple" className="space-y-4">
            {template.stages.map((stage, index) => (
              <AccordionItem value={stage.id} key={stage.id} className="border rounded-lg bg-card px-4">
                <div className="flex items-center w-full gap-2">
                  {!isArchived && (
                    <div className="flex flex-col gap-1 px-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={(e) => { e.preventDefault(); moveStage(index, -1); }}>
                        <GripVertical className="h-4 w-4 rotate-90" />
                      </Button>
                    </div>
                  )}
                  <AccordionTrigger className="hover:no-underline py-4 flex-1">
                    <div className="flex items-center gap-4 text-left">
                      <span className="font-semibold text-lg flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground h-6 w-6 rounded-full flex items-center justify-center text-xs">{index + 1}</span>
                        {stage.name || "Unnamed Stage"}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">{stage.progressBaseline}% baseline</span>
                    </div>
                  </AccordionTrigger>
                  {!isArchived && (
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => removeStage(stage.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <AccordionContent className="pt-2 pb-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-md">
                    <div className="space-y-2">
                      <Label>Stage Name</Label>
                      <Input value={stage.name} onChange={e => updateStage(stage.id, { name: e.target.value })} disabled={isArchived} />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={stage.category} onValueChange={(v: StageInputCategory) => updateStage(stage.id, { category: v })} disabled={isArchived}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="on-hold">On Hold (Pre-start)</SelectItem>
                          <SelectItem value="active">Active Execution</SelectItem>
                          <SelectItem value="complete">Completed / Operational</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Progress Baseline (%)</Label>
                      <Input type="number" min="0" max="100" value={stage.progressBaseline} onChange={e => updateStage(stage.id, { progressBaseline: Number(e.target.value) })} disabled={isArchived} />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <Label>Description</Label>
                      <Input value={stage.description} onChange={e => updateStage(stage.id, { description: e.target.value })} disabled={isArchived} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <Label className="text-base font-semibold">Custom Data Fields</Label>
                      {!isArchived && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addField(stage.id)}><Plus className="mr-1 h-3 w-3" /> Add Field</Button>
                      )}
                    </div>

                    {stage.fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic pl-2">No custom fields for this stage.</p>
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
                                    <Label className="text-xs">Field Label</Label>
                                    <Input className="h-8 text-sm" value={field.name} onChange={e => updateField(stage.id, field.id, { name: e.target.value })} disabled={isArchived} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Data Type</Label>
                                    <Select value={field.baseType} onValueChange={(v) => changeBaseType(stage.id, field.id, v)} disabled={isArchived}>
                                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="date">Date</SelectItem>
                                        <SelectItem value="boolean">Yes / No</SelectItem>
                                        <SelectItem value="single-choice">Single Choice</SelectItem>
                                        <SelectItem value="multi-choice">Multi Choice</SelectItem>
                                        <SelectItem value="file">File Upload</SelectItem>
                                        <SelectItem value="image">Photo / Image</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">UI Widget</Label>
                                    <Select
                                      value={field.widget}
                                      onValueChange={(v: any) => updateField(stage.id, field.id, { widget: v })}
                                      disabled={isArchived}
                                    >
                                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {availableWidgets.map(w => (
                                          <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1 flex flex-col justify-end pb-1">
                                    <div className="flex items-center space-x-2">
                                      <Switch id={`req-${field.id}`} checked={field.required} onCheckedChange={c => updateField(stage.id, field.id, { required: c })} disabled={isArchived} />
                                      <Label htmlFor={`req-${field.id}`} className="text-xs font-normal">Required</Label>
                                    </div>
                                  </div>
                                </div>

                                {!isArchived && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0 self-end md:self-center" onClick={() => removeField(stage.id, field.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>

                              {needsOptions && (
                                <div className="px-3 pb-3">
                                  <Label className="text-xs">Options <span className="text-muted-foreground font-normal">(one per line)</span></Label>
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
