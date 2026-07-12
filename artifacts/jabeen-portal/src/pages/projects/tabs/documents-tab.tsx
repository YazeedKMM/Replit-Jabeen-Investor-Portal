import { useTranslation } from "react-i18next";
import { Project, useListProjectDocuments, useUploadDocument, useDeleteDocument } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Loader2, FileIcon, Download, Trash2 } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useRef, useState } from "react";

interface Props {
  project: Project;
}

export default function ProjectDocumentsTab({ project }: Props) {
  const { t } = useTranslation();
  const { data: documents, isLoading } = useListProjectDocuments(project.id);
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadMutation.mutateAsync({ projectId: project.id, data: { file } });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "documents"] });
      toast({ title: t("projects.documents.toastUploaded") });
    } catch (error) {
      toast({ title: t("projects.documents.toastUploadFailed"), variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (docId: number) => {
    if (!confirm(t("projects.documents.deleteConfirm"))) return;
    try {
      await deleteMutation.mutateAsync({ documentId: docId });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "documents"] });
      toast({ title: t("projects.documents.toastDeleted") });
    } catch (error) {
      toast({ title: t("projects.documents.toastDeleteFailed"), variant: "destructive" });
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">{t("projects.documents.title")}</h2>
        <div>
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
          <Button
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {t("projects.documents.uploadButton")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !documents?.length ? (
        <div className="rounded-xl border border-card-border bg-card px-6 py-12 text-center text-muted-foreground flex flex-col items-center">
          <FileIcon className="h-10 w-10 mb-4 opacity-20" />
          <p>{t("projects.documents.emptyDesc")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map(doc => (
            <div key={doc.id} className="rounded-xl border border-card-border bg-card p-6 group flex items-start gap-4">
              <div className="h-12 w-12 bg-primary/10 text-primary rounded flex items-center justify-center shrink-0">
                <FileIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" title={doc.fileName}>{doc.fileName}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatSize(doc.size)} • {fmtDate(doc.createdAt)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("projects.documents.uploadedBy", { name: doc.uploader?.fullName || t("projects.documents.unknownUploader") })}</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <a href={`/api/projects/${project.id}/documents/${doc.id}/download`} download aria-label={t("projects.documents.downloadFile")}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("projects.documents.downloadFile")}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </a>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(doc.id)} aria-label={t("projects.documents.deleteFile")}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
