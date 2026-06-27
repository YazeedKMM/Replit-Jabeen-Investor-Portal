import { useTranslation } from "react-i18next";
import { Project, useListMessages, useCreateMessage } from "@workspace/api-client-react";
import { Textarea } from "@/components/ui/textarea";
import { DgaBrandButton } from "@/components/ui/dga-brand-button";
import { Loader2, MessageSquare } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
}

export default function ProjectMessagesTab({ project }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: messages, isLoading } = useListMessages(project.id);
  const createMutation = useCreateMessage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [body, setBody] = useState("");

  const handleSend = async () => {
    if (!body.trim()) return;
    try {
      await createMutation.mutateAsync({ projectId: project.id, data: { body } });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "messages"] });
      setBody("");
    } catch (error) {
      toast({ title: t("projects.messages.toastSendFailed"), variant: "destructive" });
    }
  };

  // Prevent top-management from composing direct messages (read-only per logic requirements)
  const canCompose = user?.role !== "top-management";

  return (
    <div className="flex flex-col h-[600px] border rounded-lg bg-card overflow-hidden">
      <div className="p-4 border-b bg-muted/20">
        <h2 className="text-lg font-bold">{t("projects.messages.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("projects.messages.subtitle")}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !messages?.length ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-10 w-10 mb-4 opacity-20" />
            <p>{t("projects.messages.emptyDesc")}</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.authorId === user?.id;
            return (
              <div key={msg.id} className={cn("flex flex-col max-w-[80%]", isMe ? "ms-auto items-end" : "items-start")}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-semibold">{isMe ? t("projects.messages.youLabel") : msg.author?.fullName}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">{msg.authorRole.replace('-', ' ')}</span>
                  <span className="text-[10px] text-muted-foreground ms-2">{fmtDateTime(msg.createdAt)}</span>
                </div>
                <div className={cn("p-3 rounded-lg text-sm", isMe ? "bg-primary text-primary-foreground rounded-se-none" : "bg-muted rounded-ss-none")}>
                  <p className="whitespace-pre-wrap">{msg.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canCompose && (
        <div className="p-4 border-t bg-muted/10">
          <div className="flex gap-2">
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={t("projects.messages.composePlaceholder")}
              className="min-h-[80px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="shrink-0 self-stretch flex items-stretch">
              <DgaBrandButton
                label={t("projects.messages.sendButton")}
                disabled={!body.trim() || createMutation.isPending}
                onOnClick={handleSend}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
