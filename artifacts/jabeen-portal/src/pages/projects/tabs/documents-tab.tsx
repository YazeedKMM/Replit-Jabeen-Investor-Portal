import { Project, useListProjectDocuments, useUploadDocument, useDeleteDocument } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileIcon, Download, Trash2, UploadCloud } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useRef, useState } from "react";

interface Props {
  project: Project;
}

export default function ProjectDocumentsTab({ project }: Props) {
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
      toast({ title: "Document uploaded successfully" });
    } catch (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (docId: number) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await deleteMutation.mutateAsync({ documentId: docId });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "documents"] });
      toast({ title: "Document deleted" });
    } catch (error) {
      toast({ title: "Deletion failed", variant: "destructive" });
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
        <h2 className="text-xl font-bold">Project Documents</h2>
        <div>
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
          <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            Upload File
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !documents?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center">
            <FileIcon className="h-10 w-10 mb-4 opacity-20" />
            <p>No documents uploaded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map(doc => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="p-4 flex items-start gap-4">
                <div className="h-12 w-12 bg-primary/10 text-primary rounded flex items-center justify-center shrink-0">
                  <FileIcon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" title={doc.fileName}>{doc.fileName}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatSize(doc.size)} • {format(new Date(doc.createdAt), 'MMM d, yyyy')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">By {doc.uploader?.fullName || "Unknown"}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <a href={`/api/projects/${project.id}/documents/${doc.id}/download`} download>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Download className="h-4 w-4" />
                    </Button>
                  </a>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(doc.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
