import { useState, useEffect, useRef } from "react";
import {
  Project, StatusUpdate,
  useListUpdates, useCreateUpdate, useApproveUpdate, useRejectUpdate, useUploadDocument,
  getListUpdatesQueryKey, getGetProjectQueryKey,
  FieldValueInput,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, CheckCircle2, XCircle, Clock, Info, Download, Image as ImageIcon, FileIcon, X, ZoomIn, UploadCloud } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { Separator } from "@/components/ui/separator";

interface Props {
  project: Project;
  isPrivileged: boolean;
}

const createUpdateSchema = z.object({
  targetStageId: z.coerce.number().min(1, "Stage is required"),
  constructionPct: z.coerce.number().min(0).max(100),
  note: z.string().optional(),
});

// ────────────────────────────────────────────────
// ProtectedImage: fetches with auth then renders
// ────────────────────────────────────────────────
function ProtectedImage({
  projectId, docId, alt, className, onClick,
}: {
  projectId: number; docId: string; alt: string; className?: string; onClick?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    const token = localStorage.getItem("jabeen_access_token");
    fetch(`/api/projects/${projectId}/documents/${docId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => { url = URL.createObjectURL(blob); setSrc(url); })
      .catch(() => setSrc(""));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [projectId, docId]);

  if (src === null) return <div className="bg-muted animate-pulse rounded aspect-video" />;
  if (src === "") return <div className="bg-muted/50 rounded flex items-center justify-center aspect-video text-muted-foreground"><ImageIcon className="h-6 w-6 opacity-30" /></div>;
  return (
    <img
      src={src} alt={alt}
      className={className ?? "w-full object-cover rounded cursor-zoom-in hover:opacity-90 transition-opacity"}
      onClick={onClick}
    />
  );
}

// ────────────────────────────────────────────────
// FieldValueDisplay: renders one field+value pair
// ────────────────────────────────────────────────
function FieldValueDisplay({
  projectId, fieldValue,
}: {
  projectId: number;
  fieldValue: StatusUpdate["fieldValues"][number] & { widget?: string; baseType?: string };
}) {
  const val = fieldValue.textValue ?? fieldValue.numValue?.toString() ?? fieldValue.dateValue
    ?? (fieldValue.boolValue != null ? String(fieldValue.boolValue) : null)
    ?? fieldValue.choiceValue;

  if (!val) return null;

  // Detect image fields (textValue that looks like a doc ID list, with image base type stored in fieldName hint)
  // We rely on base type stored in field config — for display we check widget from the update's fieldValue
  const isImage = fieldValue.baseType === "image" || fieldValue.widget === "single-photo" || fieldValue.widget === "photo-gallery";
  const isFile = fieldValue.baseType === "file" || fieldValue.widget === "file-upload";
  const isBool = fieldValue.boolValue != null;

  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{fieldValue.fieldName}</p>
      {isImage ? (
        <div className="grid grid-cols-3 gap-2">
          {String(val).split(",").filter(Boolean).map((id) => (
            <ProtectedImage key={id} projectId={projectId} docId={id.trim()} alt={fieldValue.fieldName ?? "photo"} />
          ))}
        </div>
      ) : isFile ? (
        <a
          href={`/api/projects/${projectId}/documents/${val}/download`}
          download
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          onClick={(e) => {
            e.preventDefault();
            const token = localStorage.getItem("jabeen_access_token");
            fetch(`/api/projects/${projectId}/documents/${val}/download`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }).then(r => r.blob()).then(blob => {
              const u = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = u; a.download = "file"; a.click();
              URL.revokeObjectURL(u);
            });
          }}
        >
          <FileIcon className="h-3.5 w-3.5" /> Download file
        </a>
      ) : isBool ? (
        <p className="text-sm font-medium">{fieldValue.boolValue ? "Yes ✓" : "No ✗"}</p>
      ) : (
        <p className="text-sm text-foreground">{String(val)}</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────
// UpdateDetail: full read-only view of one update
// ────────────────────────────────────────────────
function UpdateDetail({ update, projectId }: { update: StatusUpdate; projectId: number }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Target Stage</p>
          <p className="font-semibold">{update.targetStage?.name ?? "Unknown"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Progress</p>
          <p className="font-semibold">{update.constructionPct}% Complete</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Submitted by</p>
          <p className="font-semibold">{update.author?.fullName}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Date</p>
          <p className="font-semibold">{format(new Date(update.createdAt), "MMM d, yyyy")}</p>
        </div>
      </div>

      {update.note && (
        <>
          <Separator />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
            <p className="bg-muted/30 p-3 rounded text-sm">{update.note}</p>
          </div>
        </>
      )}

      {update.fieldValues && update.fieldValues.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Submitted Field Data</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {update.fieldValues.map((fv) => (
                <FieldValueDisplay key={fv.id} projectId={projectId} fieldValue={fv} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────
// DynamicFieldInput: renders the right widget for a stage field
// ────────────────────────────────────────────────
function DynamicFieldInput({
  field, projectId, value, onChange, uploading, onFileUpload,
}: {
  field: NonNullable<NonNullable<Project["pipeline"]>["stages"]>[number]["fields"][number];
  projectId: number;
  value: string;
  onChange: (v: string) => void;
  uploading: boolean;
  onFileUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const options = field.options ?? [];
  const docIds = value ? value.split(",").filter(Boolean) : [];

  switch (field.widget) {
    case "single-line":
    case "email":
    case "telephone":
      return <Input className="h-8 text-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={`Enter ${field.name.toLowerCase()}...`} />;

    case "multi-line":
      return <Textarea className="text-sm min-h-[60px] resize-none" value={value} onChange={(e) => onChange(e.target.value)} placeholder={`Enter ${field.name.toLowerCase()}...`} />;

    case "number":
      return <Input type="number" className="h-8 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />;

    case "date":
      return <Input type="date" className="h-8 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />;

    case "toggle":
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={value === "true"}
            onCheckedChange={(c) => onChange(c ? "true" : "false")}
          />
          <span className="text-sm text-muted-foreground">{value === "true" ? "Yes" : "No"}</span>
        </div>
      );

    case "drop-list":
    case "list-box":
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            {options.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
          </SelectContent>
        </Select>
      );

    case "radio":
      return (
        <RadioGroup value={value} onValueChange={onChange} className="space-y-1">
          {options.map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <RadioGroupItem value={opt} id={`rf-${field.id}-${opt}`} />
              <Label htmlFor={`rf-${field.id}-${opt}`} className="text-sm font-normal">{opt}</Label>
            </div>
          ))}
        </RadioGroup>
      );

    case "checkbox-list": {
      const selected = value ? value.split(",") : [];
      const toggle = (opt: string) => {
        const next = selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt];
        onChange(next.join(","));
      };
      return (
        <div className="space-y-1.5">
          {options.map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <Checkbox
                id={`cf-${field.id}-${opt}`}
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
              />
              <Label htmlFor={`cf-${field.id}-${opt}`} className="text-sm font-normal">{opt}</Label>
            </div>
          ))}
        </div>
      );
    }

    case "file-upload":
      return (
        <div className="space-y-2">
          <input type="file" className="hidden" ref={fileRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileUpload(f); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <UploadCloud className="mr-1.5 h-3 w-3" />}
            {docIds.length > 0 ? "Replace file" : "Upload file"}
          </Button>
          {docIds.length > 0 && <p className="text-xs text-muted-foreground flex items-center gap-1"><FileIcon className="h-3 w-3" /> File uploaded (ID {docIds[0]})</p>}
        </div>
      );

    case "single-photo":
      return (
        <div className="space-y-2">
          <input type="file" accept="image/*" className="hidden" ref={fileRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileUpload(f); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <ImageIcon className="mr-1.5 h-3 w-3" />}
            {docIds.length > 0 ? "Replace photo" : "Upload photo"}
          </Button>
          {docIds.length > 0 && (
            <div className="w-32 h-24 relative">
              <ProtectedImage projectId={projectId} docId={docIds[0]} alt="uploaded" className="w-full h-full object-cover rounded border" />
            </div>
          )}
        </div>
      );

    case "photo-gallery":
      return (
        <div className="space-y-2">
          <input type="file" accept="image/*" multiple className="hidden" ref={fileRef}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              files.forEach((f) => onFileUpload(f));
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <ImageIcon className="mr-1.5 h-3 w-3" />}
            Add photos
          </Button>
          {docIds.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {docIds.map((id) => (
                <div key={id} className="relative group aspect-square">
                  <ProtectedImage projectId={projectId} docId={id} alt="photo" className="w-full h-full object-cover rounded border" />
                  <button
                    type="button"
                    className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full h-4 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onChange(docIds.filter((d) => d !== id).join(","))}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );

    default:
      return <Input className="h-8 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
}

// ────────────────────────────────────────────────
// Main tab component
// ────────────────────────────────────────────────
export default function ProjectUpdatesTab({ project, isPrivileged }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "administrator";

  const { data: updates, isLoading } = useListUpdates(project.id, {
    query: { queryKey: getListUpdatesQueryKey(project.id) },
  });

  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [reviewUpdate, setReviewUpdate] = useState<StatusUpdate | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<number, string>>({});
  const [uploadingFields, setUploadingFields] = useState<Set<number>>(new Set());

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateUpdate();
  const approveMutation = useApproveUpdate();
  const rejectMutation = useRejectUpdate();
  const uploadMutation = useUploadDocument();

  // Stage filtering
  const allStages = project.pipeline?.stages ?? [];
  const currentStageIndex = allStages.findIndex((s) => s.id === project.currentStageId);
  const selectableStages = isAdmin
    ? allStages
    : allStages.filter((_, idx) => idx >= Math.max(0, currentStageIndex));

  const form = useForm<z.infer<typeof createUpdateSchema>>({
    resolver: zodResolver(createUpdateSchema),
    defaultValues: {
      targetStageId: project.currentStageId || (allStages[0]?.id ?? 0),
      constructionPct: project.constructionPct,
      note: "",
    },
  });

  const watchedStageId = form.watch("targetStageId");
  const selectedStage = allStages.find((s) => s.id === Number(watchedStageId));
  const stageFields = selectedStage?.fields ?? [];

  // Clear field values when stage changes
  useEffect(() => {
    setFieldValues({});
  }, [watchedStageId]);

  const handleFileUpload = async (fieldId: number, file: File, append: boolean) => {
    setUploadingFields((prev) => new Set([...prev, fieldId]));
    try {
      const doc = await uploadMutation.mutateAsync({ projectId: project.id, data: { file } });
      setFieldValues((prev) => {
        if (append && prev[fieldId]) return { ...prev, [fieldId]: `${prev[fieldId]},${doc.id}` };
        return { ...prev, [fieldId]: String(doc.id) };
      });
    } catch {
      toast({ title: "File upload failed", variant: "destructive" });
    } finally {
      setUploadingFields((prev) => { const s = new Set(prev); s.delete(fieldId); return s; });
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListUpdatesQueryKey(project.id) });
    queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
  };

  const onSubmit = async (data: z.infer<typeof createUpdateSchema>) => {
    const fvPayload: FieldValueInput[] = stageFields
      .map((f) => {
        const val = fieldValues[f.id];
        if (val === undefined || val === "") return null;
        const fv: FieldValueInput = { fieldId: f.id };
        if (f.baseType === "text") fv.textValue = val;
        else if (f.baseType === "number") fv.numValue = Number(val);
        else if (f.baseType === "date") fv.dateValue = val;
        else if (f.baseType === "boolean") fv.boolValue = val === "true";
        else if (f.baseType === "file" || f.baseType === "image") fv.textValue = val;
        else if (f.baseType === "single-choice" || f.baseType === "multi-choice") fv.choiceValue = val;
        return fv;
      })
      .filter((v): v is FieldValueInput => v !== null);

    try {
      await createMutation.mutateAsync({ projectId: project.id, data: { ...data, fieldValues: fvPayload } });
      invalidate();
      toast({ title: "Update submitted", description: "Your progress update is pending review." });
      setIsSubmitOpen(false);
      form.reset();
      setFieldValues({});
    } catch (error: any) {
      toast({ title: "Submission failed", description: error.data?.message ?? "An error occurred", variant: "destructive" });
    }
  };

  const handleApprove = async () => {
    if (!reviewUpdate) return;
    try {
      await approveMutation.mutateAsync({ projectId: project.id, updateId: reviewUpdate.id });
      invalidate();
      toast({ title: "Update approved", description: "Project baseline has been updated." });
      setReviewUpdate(null);
    } catch {
      toast({ title: "Approval failed", variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!reviewUpdate) return;
    try {
      await rejectMutation.mutateAsync({ projectId: project.id, updateId: reviewUpdate.id, data: { reviewNote: rejectNote } });
      invalidate();
      toast({ title: "Update rejected" });
      setReviewUpdate(null);
      setRejectNote("");
      setRejectMode(false);
    } catch {
      toast({ title: "Rejection failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Progress History</h2>

        {project.pipeline && (
          <Dialog
            open={isSubmitOpen}
            onOpenChange={(o) => {
              setIsSubmitOpen(o);
              if (!o) { form.reset(); setFieldValues({}); }
            }}
          >
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Submit Update</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Submit Progress Update</DialogTitle>
                <DialogDescription>Record a milestone or completion percentage.</DialogDescription>
              </DialogHeader>

              {!isAdmin && currentStageIndex > 0 && (
                <div className="flex items-start gap-2 text-sm bg-muted/50 border rounded-md p-3">
                  <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">Only current and upcoming stages are available. Admins can revert to a previous stage.</p>
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {/* Stage selector */}
                  <FormField control={form.control} name="targetStageId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Stage</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value.toString()}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a stage" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {selectableStages.map((s) => (
                            <SelectItem key={s.id} value={s.id.toString()}>
                              {s.name}{s.id === project.currentStageId && <span className="ml-1.5 text-muted-foreground text-xs">(current)</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Construction % */}
                  <FormField control={form.control} name="constructionPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Construction Complete (%)</FormLabel>
                      <FormControl><Input type="number" min="0" max="100" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Dynamic stage fields */}
                  {stageFields.length > 0 && (
                    <div className="space-y-4 border-t pt-4">
                      <p className="text-sm font-semibold text-foreground">Stage Details</p>
                      {stageFields.map((f) => (
                        <div key={f.id} className="space-y-1.5">
                          <Label className="text-sm font-medium">
                            {f.name}
                            {f.required && <span className="text-destructive ml-0.5">*</span>}
                          </Label>
                          <DynamicFieldInput
                            field={f}
                            projectId={project.id}
                            value={fieldValues[f.id] ?? ""}
                            onChange={(v) => setFieldValues((prev) => ({ ...prev, [f.id]: v }))}
                            uploading={uploadingFields.has(f.id)}
                            onFileUpload={(file) => handleFileUpload(f.id, file, f.widget === "photo-gallery")}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  <FormField control={form.control} name="note" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes <span className="text-muted-foreground font-normal text-xs">(Optional)</span></FormLabel>
                      <FormControl><Textarea placeholder="Details about this update..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <DialogFooter className="pt-4">
                    <Button variant="outline" type="button" onClick={() => setIsSubmitOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending || uploadingFields.size > 0}>
                      {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Timeline ── */}
      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !updates?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center">
            <Clock className="h-10 w-10 mb-4 opacity-20" />
            <p>No progress updates have been submitted yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
          {updates.map((update) => (
            <div key={update.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
              {/* Status dot */}
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-muted shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 absolute left-0 md:left-1/2 md:-translate-x-1/2">
                {update.reviewStatus === "approved" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> :
                 update.reviewStatus === "rejected" ? <XCircle className="h-5 w-5 text-destructive" /> :
                 <Clock className="h-5 w-5 text-amber-500" />}
              </div>

              <Card className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] ml-12 md:ml-0 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="p-4 pb-2 border-b bg-muted/10">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{update.targetStage?.name ?? "Unknown Stage"}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        By {update.author?.fullName} · {format(new Date(update.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>
                    <Badge variant="outline" className={
                      update.reviewStatus === "approved" ? "bg-emerald-50 text-emerald-700 shrink-0" :
                      update.reviewStatus === "rejected" ? "bg-destructive/10 text-destructive shrink-0" :
                      "bg-amber-50 text-amber-700 shrink-0"
                    }>
                      {update.reviewStatus.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3 text-sm">
                  {/* Progress */}
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${update.constructionPct}%` }} />
                    </div>
                    <span className="font-semibold text-xs w-10 text-right">{update.constructionPct}%</span>
                  </div>

                  {/* Field values */}
                  {update.fieldValues && update.fieldValues.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {update.fieldValues.map((fv) => (
                        <FieldValueDisplay key={fv.id} projectId={project.id} fieldValue={fv} />
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {update.note && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                      <p className="text-muted-foreground bg-muted/20 p-2 rounded text-xs">{update.note}</p>
                    </div>
                  )}

                  {/* Rejection reason */}
                  {update.reviewStatus === "rejected" && update.reviewNote && (
                    <div className="bg-destructive/10 p-2 rounded border border-destructive/20">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-destructive mb-1">Rejection Reason</p>
                      <p className="text-xs text-destructive/80">{update.reviewNote}</p>
                    </div>
                  )}

                  {/* PM review actions */}
                  {isPrivileged && update.reviewStatus === "pending" && (
                    <div className="pt-3 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                        onClick={() => { setReviewUpdate(update); setRejectMode(false); setRejectNote(""); }}
                      >
                        Review this update →
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* ── PM Review Dialog ── */}
      <Dialog open={!!reviewUpdate} onOpenChange={(o) => { if (!o) { setReviewUpdate(null); setRejectMode(false); setRejectNote(""); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Progress Update</DialogTitle>
            <DialogDescription>Review all submitted data before approving or rejecting.</DialogDescription>
          </DialogHeader>

          {reviewUpdate && (
            <div className="space-y-4">
              <UpdateDetail update={reviewUpdate} projectId={project.id} />

              {!rejectMode ? (
                <div className="flex gap-3 pt-2 border-t">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleApprove}
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                  </Button>
                  <Button
                    className="flex-1"
                    variant="destructive"
                    onClick={() => setRejectMode(true)}
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Reject
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 pt-2 border-t">
                  <Label className="font-semibold">Reason for rejection</Label>
                  <Textarea
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Please explain why this update is being rejected..."
                    className="min-h-[80px]"
                  />
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setRejectMode(false)}>Back</Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleReject}
                      disabled={!rejectNote || rejectMutation.isPending}
                    >
                      {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirm Rejection
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Photo lightbox ── */}
      <Dialog open={!!lightboxUrl} onOpenChange={(o) => !o && setLightboxUrl(null)}>
        <DialogContent className="max-w-4xl p-2 bg-black border-0">
          {lightboxUrl && (
            <img src={lightboxUrl} alt="Full size" className="w-full h-auto max-h-[85vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
