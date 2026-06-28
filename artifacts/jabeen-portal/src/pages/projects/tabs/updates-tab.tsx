import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Project, StatusUpdate,
  useListUpdates, useCreateUpdate, useApproveUpdate, useRejectUpdate, useUploadDocument,
  getListUpdatesQueryKey, getGetProjectQueryKey,
  FieldValueInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { DgaContentCard } from "@/components/ui/dga-card";
import { DgaModal } from "@/components/ui/dga-modal";
import { DgaBrandButton } from "@/components/ui/dga-brand-button";
import { DgaTag, DgaButton } from "platformscode-new-react";
import { Loader2, CheckCircle2, XCircle, Clock, Info, FileIcon, X, ZoomIn, UploadCloud, Image as ImageIcon } from "lucide-react";
import { fmtDate, fmtTime } from "@/lib/format";
import {
  Dialog, DialogContent,
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
  projectId, fieldValue, onImageClick,
}: {
  projectId: number;
  fieldValue: StatusUpdate["fieldValues"][number];
  onImageClick?: (docId: string) => void;
}) {
  const { t } = useTranslation();
  const val = fieldValue.textValue ?? fieldValue.numValue?.toString() ?? fieldValue.dateValue
    ?? (fieldValue.boolValue != null ? String(fieldValue.boolValue) : null)
    ?? fieldValue.choiceValue;

  if (!val) return null;

  const isImage = fieldValue.baseType === "image" || fieldValue.widget === "single-photo" || fieldValue.widget === "photo-gallery";
  const isFile = fieldValue.baseType === "file" || fieldValue.widget === "file-upload";
  const isBool = fieldValue.boolValue != null;
  const docIds = String(val).split(",").filter(Boolean).map((s) => s.trim());

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{fieldValue.fieldName}</p>
      {isImage ? (
        <div className={`grid gap-2 ${docIds.length === 1 ? "grid-cols-1" : docIds.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {docIds.map((id) => (
            <div
              key={id}
              className={`relative overflow-hidden rounded border bg-muted ${onImageClick ? "cursor-zoom-in" : ""}`}
              onClick={() => onImageClick?.(id)}
            >
              <ProtectedImage
                projectId={projectId}
                docId={id}
                alt={fieldValue.fieldName ?? "photo"}
                className="w-full h-full object-cover aspect-video"
              />
              {onImageClick && (
                <div className="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center transition-colors">
                  <ZoomIn className="h-5 w-5 text-white opacity-0 hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : isFile ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          onClick={() => {
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
          <FileIcon className="h-3.5 w-3.5" /> {t("projects.updates.downloadAttachedFile")}
        </button>
      ) : isBool ? (
        <p className="text-sm font-medium">{fieldValue.boolValue ? "✓ Yes" : "✗ No"}</p>
      ) : (
        <p className="text-sm text-foreground break-words">{String(val)}</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────
// UpdateDetail: full read-only view of one update (used in review dialog)
// ────────────────────────────────────────────────
function UpdateDetail({ update, projectId }: { update: StatusUpdate; projectId: number }) {
  const { t } = useTranslation();
  const [lightboxDocId, setLightboxDocId] = useState<string | null>(null);

  // Separate image fields from other fields so images render full-width
  const imageFields = update.fieldValues.filter(
    (fv) => fv.baseType === "image" || fv.widget === "single-photo" || fv.widget === "photo-gallery"
  );
  const fileFields = update.fieldValues.filter(
    (fv) => fv.baseType === "file" || fv.widget === "file-upload"
  );
  const otherFields = update.fieldValues.filter(
    (fv) => !imageFields.includes(fv) && !fileFields.includes(fv)
  );

  return (
    <div className="space-y-5 text-sm">
      {/* ── Summary row ── */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{t("projects.updates.detailTargetStage")}</p>
          <p className="font-semibold">{update.targetStage?.name ?? "Unknown"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{t("projects.updates.detailProjectProgress")}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${update.constructionPct}%` }} />
            </div>
            <span className="font-semibold tabular-nums w-9 text-end">{update.constructionPct}%</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{t("projects.updates.detailSubmittedBy")}</p>
          <p className="font-semibold">{update.author?.fullName}</p>
          <p className="text-xs text-muted-foreground">{update.author?.companyName}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{t("projects.updates.detailSubmittedOn")}</p>
          <p className="font-semibold">{fmtDate(update.createdAt)}</p>
          <p className="text-xs text-muted-foreground">{fmtTime(update.createdAt)}</p>
        </div>
      </div>

      {/* ── Notes ── */}
      {update.note && (
        <>
          <Separator />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{t("projects.updates.detailNotesFromSubmitter")}</p>
            <p className="bg-muted/30 p-3 rounded-md text-sm leading-relaxed">{update.note}</p>
          </div>
        </>
      )}

      {/* ── Text / choice / bool fields ── */}
      {otherFields.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">{t("projects.updates.detailFieldValues")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {otherFields.map((fv) => (
                <FieldValueDisplay key={fv.id} projectId={projectId} fieldValue={fv} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── File attachments ── */}
      {fileFields.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{t("projects.updates.detailAttachedFiles")}</p>
            <div className="space-y-2">
              {fileFields.map((fv) => (
                <FieldValueDisplay key={fv.id} projectId={projectId} fieldValue={fv} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Photos ── */}
      {imageFields.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{t("projects.updates.detailPhotos")}</p>
            <div className="space-y-4">
              {imageFields.map((fv) => (
                <FieldValueDisplay key={fv.id} projectId={projectId} fieldValue={fv} onImageClick={setLightboxDocId} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Review result (if already reviewed) ── */}
      {update.reviewStatus !== "pending" && update.reviewer && (
        <>
          <Separator />
          <div className={`rounded-md border p-3 ${update.reviewStatus === "approved" ? "bg-blue-50 border-blue-200" : "bg-destructive/5 border-destructive/20"}`}>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${update.reviewStatus === "approved" ? "text-blue-700" : "text-destructive"}`}>
              {update.reviewStatus === "approved" ? t("projects.updates.detailApproved") : t("projects.updates.detailRejected")} {t("projects.updates.detailBy", { name: update.reviewer.fullName })}
              {update.reviewedAt && <span className="font-normal"> {t("projects.updates.detailOn", { date: fmtDate(update.reviewedAt) })}</span>}
            </p>
            {update.reviewNote && (
              <p className="text-sm text-muted-foreground mt-1">{update.reviewNote}</p>
            )}
          </div>
        </>
      )}

      {/* ── Lightbox ── */}
      <Dialog open={!!lightboxDocId} onOpenChange={(o) => !o && setLightboxDocId(null)}>
        <DialogContent className="max-w-5xl p-2 bg-black border-0">
          {lightboxDocId && (
            <ProtectedImage
              projectId={projectId}
              docId={lightboxDocId}
              alt="Full size"
              className="w-full h-auto max-h-[88vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
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
  const { t } = useTranslation();
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
          <span className="text-sm text-muted-foreground">{value === "true" ? t("common.yes") : t("common.no")}</span>
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
            {uploading ? <Loader2 className="me-1.5 h-3 w-3 animate-spin" /> : <UploadCloud className="me-1.5 h-3 w-3" />}
            {docIds.length > 0 ? t("projects.updates.replaceFile") : t("projects.updates.uploadFile")}
          </Button>
          {docIds.length > 0 && <p className="text-xs text-muted-foreground flex items-center gap-1"><FileIcon className="h-3 w-3" /> {t("projects.updates.fileUploaded", { id: docIds[0] })}</p>}
        </div>
      );

    case "single-photo":
      return (
        <div className="space-y-2">
          <input type="file" accept="image/*" className="hidden" ref={fileRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileUpload(f); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="me-1.5 h-3 w-3 animate-spin" /> : <ImageIcon className="me-1.5 h-3 w-3" />}
            {docIds.length > 0 ? t("projects.updates.replacePhoto") : t("projects.updates.uploadPhoto")}
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
            {uploading ? <Loader2 className="me-1.5 h-3 w-3 animate-spin" /> : <ImageIcon className="me-1.5 h-3 w-3" />}
            {t("projects.updates.addPhotos")}
          </Button>
          {docIds.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {docIds.map((id) => (
                <div key={id} className="relative group aspect-square">
                  <ProtectedImage projectId={projectId} docId={id} alt="photo" className="w-full h-full object-cover rounded border" />
                  <button
                    type="button"
                    className="absolute top-0.5 end-0.5 bg-black/70 text-white rounded-full h-4 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
  const { t } = useTranslation();
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
  const [fieldErrors, setFieldErrors] = useState<Set<number>>(new Set());

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

  // When stage changes: clear field values/errors and sync constructionPct from progressBaseline
  useEffect(() => {
    setFieldValues({});
    setFieldErrors(new Set());
    if (selectedStage) {
      form.setValue("constructionPct", selectedStage.progressBaseline);
    }
  }, [watchedStageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileUpload = async (fieldId: number, file: File, append: boolean) => {
    setUploadingFields((prev) => new Set([...prev, fieldId]));
    try {
      const doc = await uploadMutation.mutateAsync({ projectId: project.id, data: { file } });
      setFieldValues((prev) => {
        if (append && prev[fieldId]) return { ...prev, [fieldId]: `${prev[fieldId]},${doc.id}` };
        return { ...prev, [fieldId]: String(doc.id) };
      });
    } catch {
      toast({ title: t("projects.updates.toastFileUploadFailed"), variant: "destructive" });
    } finally {
      setUploadingFields((prev) => { const s = new Set(prev); s.delete(fieldId); return s; });
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListUpdatesQueryKey(project.id) });
    queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
  };

  const onSubmit = async (data: z.infer<typeof createUpdateSchema>) => {
    // Validate required stage fields
    const missingIds = new Set(
      stageFields
        .filter((f) => f.required && (!fieldValues[f.id] || fieldValues[f.id].trim() === ""))
        .map((f) => f.id)
    );
    if (missingIds.size > 0) {
      setFieldErrors(missingIds);
      toast({ title: t("projects.updates.toastRequiredFieldsTitle"), description: t("projects.updates.toastRequiredFieldsDesc"), variant: "destructive" });
      return;
    }

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
      toast({ title: t("projects.updates.toastSubmittedTitle"), description: t("projects.updates.toastSubmittedDesc") });
      setIsSubmitOpen(false);
      form.reset();
      setFieldValues({});
    } catch (error: any) {
      toast({ title: t("projects.updates.toastSubmitFailedTitle"), description: error.data?.message ?? "An error occurred", variant: "destructive" });
    }
  };

  const handleApprove = async () => {
    if (!reviewUpdate) return;
    try {
      await approveMutation.mutateAsync({ projectId: project.id, updateId: reviewUpdate.id });
      invalidate();
      toast({ title: t("projects.updates.toastApprovedTitle"), description: t("projects.updates.toastApprovedDesc") });
      setReviewUpdate(null);
    } catch {
      toast({ title: t("projects.updates.toastApprovalFailed"), variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!reviewUpdate) return;
    try {
      await rejectMutation.mutateAsync({ projectId: project.id, updateId: reviewUpdate.id, data: { reviewNote: rejectNote } });
      invalidate();
      toast({ title: t("projects.updates.toastRejectedTitle") });
      setReviewUpdate(null);
      setRejectNote("");
      setRejectMode(false);
    } catch {
      toast({ title: t("projects.updates.toastRejectionFailed"), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">{t("projects.updates.progressHistory")}</h2>

        {project.pipeline && (
          <DgaBrandButton label={t("projects.updates.submitUpdate")} onOnClick={() => setIsSubmitOpen(true)} />
        )}
      </div>

      {/* ── Submit Update modal ── */}
      {project.pipeline && (
        <DgaModal
          open={isSubmitOpen}
          onOpenChange={(o) => { setIsSubmitOpen(o); if (!o) { form.reset(); setFieldValues({}); } }}
          title={t("projects.updates.submitDialogTitle")}
          footer={
            <div className="flex gap-3 justify-end">
              <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={() => setIsSubmitOpen(false)} />
              <DgaBrandButton
                label={t("projects.updates.submitButton")}
                disabled={createMutation.isPending || uploadingFields.size > 0}
                onOnClick={() => form.handleSubmit(onSubmit)()}
              />
            </div>
          }
        >
          <p className="text-sm text-muted-foreground mb-4">{t("projects.updates.submitDialogDesc")}</p>
          {!isAdmin && currentStageIndex > 0 && (
            <div className="flex items-start gap-2 text-sm bg-muted/50 border rounded-md p-3 mb-4">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-muted-foreground">{t("projects.updates.stageOnlyCurrentNote")}</p>
            </div>
          )}
          <div className="max-h-[60vh] overflow-y-auto pe-1">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {/* Stage selector */}
                  <FormField control={form.control} name="targetStageId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("projects.updates.targetStage")}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value.toString()}>
                        <FormControl><SelectTrigger><SelectValue placeholder={t("projects.updates.targetStagePlaceholder")} /></SelectTrigger></FormControl>
                        <SelectContent>
                          {selectableStages.map((s) => (
                            <SelectItem key={s.id} value={s.id.toString()}>
                              {s.name}{s.id === project.currentStageId && <span className="ms-1.5 text-muted-foreground text-xs">{t("projects.updates.currentStageSuffix")}</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Construction % — locked to stage progressBaseline when pipeline is assigned */}
                  <FormField control={form.control} name="constructionPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("projects.updates.projectProgress")}</FormLabel>
                      {selectedStage ? (
                        <div className="flex items-center gap-3 h-9 px-3 rounded-md border bg-muted/40 text-sm">
                          <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${selectedStage.progressBaseline}%` }}
                            />
                          </div>
                          <span className="font-semibold tabular-nums w-10 text-end shrink-0">
                            {selectedStage.progressBaseline}%
                          </span>
                          <span className="text-muted-foreground text-xs shrink-0">{t("projects.updates.setByTemplate")}</span>
                        </div>
                      ) : (
                        <FormControl>
                          <Input type="number" min="0" max="100" {...field} />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Dynamic stage fields */}
                  {stageFields.length > 0 && (
                    <div className="space-y-4 border-t pt-4">
                      <p className="text-sm font-semibold text-foreground">{t("projects.updates.stageDetails")}</p>
                      {stageFields.map((f) => (
                        <div key={f.id} className="space-y-1.5">
                          <Label className={`text-sm font-medium ${fieldErrors.has(f.id) ? "text-destructive" : ""}`}>
                            {f.name}
                            {f.required && <span className="text-destructive ms-0.5">*</span>}
                          </Label>
                          <div className={fieldErrors.has(f.id) ? "ring-1 ring-destructive rounded-md" : ""}>
                            <DynamicFieldInput
                              field={f}
                              projectId={project.id}
                              value={fieldValues[f.id] ?? ""}
                              onChange={(v) => {
                                setFieldValues((prev) => ({ ...prev, [f.id]: v }));
                                if (v) setFieldErrors((prev) => { const s = new Set(prev); s.delete(f.id); return s; });
                              }}
                              uploading={uploadingFields.has(f.id)}
                              onFileUpload={(file) => {
                                setFieldErrors((prev) => { const s = new Set(prev); s.delete(f.id); return s; });
                                handleFileUpload(f.id, file, f.widget === "photo-gallery");
                              }}
                            />
                          </div>
                          {fieldErrors.has(f.id) && (
                            <p className="text-xs text-destructive">{f.name} is required.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  <FormField control={form.control} name="note" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("projects.updates.notes")} <span className="text-muted-foreground font-normal text-xs">{t("projects.updates.notesOptional")}</span></FormLabel>
                      <FormControl><Textarea placeholder={t("projects.updates.notesPlaceholder")} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

              </form>
            </Form>
          </div>
        </DgaModal>
      )}

      {/* ── Timeline ── */}
      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !updates?.length ? (
        <DgaContentCard className="py-12 text-center text-muted-foreground flex flex-col items-center">
          <Clock className="h-10 w-10 mb-4 opacity-20" />
          <p>{t("projects.updates.emptyDesc")}</p>
        </DgaContentCard>
      ) : (
        <div className="space-y-4 relative before:absolute before:inset-0 before:ms-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
          {updates.map((update) => (
            <div key={update.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
              {/* Status dot */}
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-muted shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 absolute left-0 md:left-1/2 md:-translate-x-1/2">
                {update.reviewStatus === "approved" ? <CheckCircle2 className="h-5 w-5 text-blue-500" /> :
                 update.reviewStatus === "rejected" ? <XCircle className="h-5 w-5 text-destructive" /> :
                 <Clock className="h-5 w-5 text-amber-500" />}
              </div>

              <DgaContentCard className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] ms-12 md:ms-0">
                <div className="flex justify-between items-start gap-2 pb-3 border-b border-border">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold truncate text-foreground">{update.targetStage?.name ?? "Unknown Stage"}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      By {update.author?.fullName} · {fmtDate(update.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <DgaTag
                      size="sm"
                      variant={update.reviewStatus === "approved" ? "success" : update.reviewStatus === "rejected" ? "error" : "warning"}
                      label={update.reviewStatus === "approved" ? t("projects.updates.reviewStatusApproved") : update.reviewStatus === "rejected" ? t("projects.updates.reviewStatusRejected") : t("projects.updates.reviewStatusPending")}
                    />
                  </div>
                </div>

                <div className="pt-3 space-y-3 text-sm">
                  {/* Progress */}
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${update.constructionPct}%` }} />
                    </div>
                    <span className="font-semibold text-xs w-10 text-end">{update.constructionPct}%</span>
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
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("projects.updates.notes")}</p>
                      <p className="text-muted-foreground bg-muted/20 p-2 rounded text-xs">{update.note}</p>
                    </div>
                  )}

                  {/* Rejection reason */}
                  {update.reviewStatus === "rejected" && update.reviewNote && (
                    <div className="bg-destructive/10 p-2 rounded border border-destructive/20">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-destructive mb-1">{t("projects.updates.rejectionReason")}</p>
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
                        {t("projects.updates.reviewButton")}
                      </Button>
                    </div>
                  )}
                </div>
              </DgaContentCard>
            </div>
          ))}
        </div>
      )}

      {/* ── PM Review Modal ── */}
      <DgaModal
        open={!!reviewUpdate}
        onOpenChange={(o) => { if (!o) { setReviewUpdate(null); setRejectMode(false); setRejectNote(""); } }}
        title={t("projects.updates.reviewDialogTitle")}
      >
        <p className="text-sm text-muted-foreground mb-4">{t("projects.updates.reviewDialogDesc")}</p>
        <div className="max-h-[75vh] overflow-y-auto pe-1">
          {reviewUpdate && (
            <div className="space-y-4">
              <UpdateDetail update={reviewUpdate} projectId={project.id} />

              {!rejectMode ? (
                <div className="flex gap-3 pt-2 border-t">
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleApprove}
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    <CheckCircle2 className="me-2 h-4 w-4" /> {t("projects.updates.approveButton")}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="destructive"
                    onClick={() => setRejectMode(true)}
                  >
                    <XCircle className="me-2 h-4 w-4" /> {t("projects.updates.rejectButton")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 pt-2 border-t">
                  <Label className="font-semibold">{t("projects.updates.rejectReasonLabel")}</Label>
                  <Textarea
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder={t("projects.updates.rejectPlaceholder")}
                    className="min-h-[80px]"
                  />
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setRejectMode(false)}>{t("projects.updates.backButton")}</Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleReject}
                      disabled={!rejectNote || rejectMutation.isPending}
                    >
                      {rejectMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                      {t("projects.updates.confirmRejectButton")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DgaModal>

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
