import { useTranslation } from "react-i18next";
import { Project, useListInternalNotes, useCreateInternalNote } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  project: Project;
}

export default function ProjectInternalNotesTab({ project }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: notes, isLoading } = useListInternalNotes(project.id);
  const createMutation = useCreateInternalNote();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [body, setBody] = useState("");

  const handleSend = async () => {
    if (!body.trim()) return;
    try {
      await createMutation.mutateAsync({ projectId: project.id, data: { body } });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "internal-notes"] });
      setBody("");
      toast({ title: t("projects.internal.toastAdded") });
    } catch (error) {
      toast({ title: t("projects.internal.toastAddFailed"), variant: "destructive" });
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 flex flex-col space-y-4">
        <h2 className="text-xl font-bold text-purple-900 dark:text-purple-300">{t("projects.internal.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("projects.internal.subtitle")}</p>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : !notes?.length ? (
            <div className="p-8 border border-dashed rounded-lg text-center text-muted-foreground">
              {t("projects.internal.emptyDesc")}
            </div>
          ) : (
            notes.map(note => (
              <div key={note.id} className="bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30 p-4 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-semibold text-sm text-purple-900 dark:text-purple-300">{note.author?.fullName}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}</div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.body}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <div className="bg-muted/30 p-4 rounded-lg border sticky top-4">
          <h3 className="font-semibold mb-2">{t("projects.internal.addNoteTitle")}</h3>
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={t("projects.internal.notePlaceholder")}
            className="min-h-[150px] resize-none mb-3 bg-background"
          />
          <Button
            className="w-full bg-purple-700 hover:bg-purple-800 text-white"
            onClick={handleSend}
            disabled={!body.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Send className="me-2 h-4 w-4" />}
            {t("projects.internal.saveButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}
