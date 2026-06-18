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
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

// Helper to generate IDs for local state management before saving
const genId = () => Math.random().toString(36).substr(2, 9);

type LocalField = Omit<StageFieldInput, "options"> & { id: string; optionsStr: string };
type LocalStage = Omit<StageInput, "fields"> & { id: string; fields: LocalField[] };
type LocalTemplate = Omit<TemplateInput, "stages"> & { stages: LocalStage[] };

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
    name: "",
    description: "",
    isDefault: false,
    stages: []
  });

  // Init from server
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
      stages: [
        ...prev.stages, 
        { id: genId(), name: "New Stage", description: "", progressBaseline: 0, category: "active", fields: [] }
      ]
    }));
  };

  const removeStage = (stageId: string) => {
    setTemplate(prev => ({ ...prev, stages: prev.stages.filter(s => s.id !== stageId) }));
  };

  const addField = (stageId: string) => {
    setTemplate(prev => ({
      ...prev,
      stages: prev.stages.map(s => {
        if (s.id !== stageId) return s;
        return {
          ...s,
          fields: [...s.fields, { id: genId(), name: "New Field", baseType: "text", widget: "single-line", required: false, optionsStr: "" }]
        };
      })
    }));
  };

  const removeField = (stageId: string, fieldId: string) => {
    setTemplate(prev => ({
      ...prev,
      stages: prev.stages.map(s => {
        if (s.id !== stageId) return s;
        return { ...s, fields: s.fields.filter(f => f.id !== fieldId) };
      })
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
      stages: prev.stages.map(s => {
        if (s.id !== stageId) return s;
        return {
          ...s,
          fields: s.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
        };
      })
    }));
  };

  // Move stage up or down
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

    // Map LocalTemplate -> TemplateInput
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
        await updateMutation.mutateAsync({ templateId, data: payload });
        toast({ title: "Template updated" });
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
          <h1 className="text-2xl font-bold">{isNew ? "New Template" : "Edit Template"}</h1>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Template
        </Button>
      </div>

      {/* Main Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
          <CardDescription>Basic information about this pipeline.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input value={template.name} onChange={e => setTemplate({ ...template, name: e.target.value })} placeholder="e.g. Standard Industrial Project" />
            </div>
            <div className="flex items-center space-x-2 pt-8">
              <Switch id="is-default" checked={template.isDefault} onCheckedChange={c => setTemplate({ ...template, isDefault: c })} />
              <Label htmlFor="is-default">Set as default for new projects</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={template.description} onChange={e => setTemplate({ ...template, description: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {/* Stages */}
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-xl font-bold">Pipeline Stages</h2>
            <p className="text-sm text-muted-foreground">Define the steps a project moves through, in order.</p>
          </div>
          <Button onClick={addStage} variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" /> Add Stage</Button>
        </div>

        {template.stages.length === 0 ? (
          <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
            <p className="text-muted-foreground">No stages defined yet. Click Add Stage to begin.</p>
          </div>
        ) : (
          <Accordion type="multiple" className="space-y-4">
            {template.stages.map((stage, index) => (
              <AccordionItem value={stage.id} key={stage.id} className="border rounded-lg bg-card px-4">
                <div className="flex items-center w-full gap-2">
                  <div className="flex flex-col gap-1 px-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={(e) => { e.preventDefault(); moveStage(index, -1); }}>
                      <GripVertical className="h-4 w-4 rotate-90" />
                    </Button>
                  </div>
                  <AccordionTrigger className="hover:no-underline py-4 flex-1">
                    <div className="flex items-center gap-4 text-left">
                      <span className="font-semibold text-lg flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground h-6 w-6 rounded-full flex items-center justify-center text-xs">{index + 1}</span>
                        {stage.name || "Unnamed Stage"}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">{stage.progressBaseline}% baseline</span>
                    </div>
                  </AccordionTrigger>
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => removeStage(stage.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <AccordionContent className="pt-2 pb-6 space-y-6">
                  {/* Stage Config */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-md">
                    <div className="space-y-2">
                      <Label>Stage Name</Label>
                      <Input value={stage.name} onChange={e => updateStage(stage.id, { name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={stage.category} onValueChange={(v: StageInputCategory) => updateStage(stage.id, { category: v })}>
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
                      <Input type="number" min="0" max="100" value={stage.progressBaseline} onChange={e => updateStage(stage.id, { progressBaseline: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <Label>Description</Label>
                      <Input value={stage.description} onChange={e => updateStage(stage.id, { description: e.target.value })} />
                    </div>
                  </div>

                  {/* Stage Fields */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <Label className="text-base font-semibold">Custom Data Fields</Label>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addField(stage.id)}><Plus className="mr-1 h-3 w-3" /> Add Field</Button>
                    </div>

                    {stage.fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic pl-2">No custom fields for this stage.</p>
                    ) : (
                      <div className="space-y-3">
                        {stage.fields.map((field) => (
                          <div key={field.id} className="flex flex-col md:flex-row gap-3 items-start border p-3 rounded-md bg-background">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 w-full">
                              <div className="space-y-1">
                                <Label className="text-xs">Field Label</Label>
                                <Input className="h-8 text-sm" value={field.name} onChange={e => updateField(stage.id, field.id, { name: e.target.value })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Data Type</Label>
                                <Select value={field.baseType} onValueChange={(v: any) => updateField(stage.id, field.id, { baseType: v, widget: v === 'boolean' ? 'toggle' : v === 'date' ? 'date' : 'single-line' })}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="text">Text</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="date">Date</SelectItem>
                                    <SelectItem value="boolean">Yes/No</SelectItem>
                                    <SelectItem value="single-choice">Single Choice</SelectItem>
                                    <SelectItem value="multi-choice">Multi Choice</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">UI Widget</Label>
                                <Select value={field.widget} onValueChange={(v: any) => updateField(stage.id, field.id, { widget: v })}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="single-line">Single Line Input</SelectItem>
                                    <SelectItem value="multi-line">Multi Line Area</SelectItem>
                                    <SelectItem value="drop-list">Dropdown List</SelectItem>
                                    <SelectItem value="radio">Radio Buttons</SelectItem>
                                    <SelectItem value="checkbox-list">Checkboxes</SelectItem>
                                    <SelectItem value="date">Date Picker</SelectItem>
                                    <SelectItem value="toggle">Toggle Switch</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1 flex flex-col justify-end pb-1">
                                <div className="flex items-center space-x-2">
                                  <Switch id={`req-${field.id}`} checked={field.required} onCheckedChange={c => updateField(stage.id, field.id, { required: c })} />
                                  <Label htmlFor={`req-${field.id}`} className="text-xs font-normal">Required</Label>
                                </div>
                              </div>
                            </div>
                            
                            {(field.baseType === 'single-choice' || field.baseType === 'multi-choice') && (
                              <div className="w-full md:w-48 space-y-1">
                                <Label className="text-xs">Options (One per line)</Label>
                                <Textarea className="min-h-[32px] h-[32px] text-xs resize-none" value={field.optionsStr} onChange={e => updateField(stage.id, field.id, { optionsStr: e.target.value })} placeholder="Option A&#10;Option B" />
                              </div>
                            )}

                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0 self-end md:self-center" onClick={() => removeField(stage.id, field.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
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
