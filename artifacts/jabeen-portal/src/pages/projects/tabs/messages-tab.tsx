import { Project, useListMessages, useCreateMessage } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
}

export default function ProjectMessagesTab({ project }: Props) {
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
      toast({ title: "Failed to send message", variant: "destructive" });
    }
  };

  // Prevent top-management from composing direct messages (read-only per logic requirements)
  const canCompose = user?.role !== "top-management";

  return (
    <div className="flex flex-col h-[600px] border rounded-lg bg-card overflow-hidden">
      <div className="p-4 border-b bg-muted/20">
        <h2 className="text-lg font-bold">Project Discussion</h2>
        <p className="text-sm text-muted-foreground">Messages visible to project managers and assigned investors.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !messages?.length ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-10 w-10 mb-4 opacity-20" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.authorId === user?.id;
            return (
              <div key={msg.id} className={cn("flex flex-col max-w-[80%]", isMe ? "ml-auto items-end" : "items-start")}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-semibold">{isMe ? "You" : msg.author?.fullName}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">{msg.authorRole.replace('-', ' ')}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{format(new Date(msg.createdAt), 'MMM d, h:mm a')}</span>
                </div>
                <div className={cn("p-3 rounded-lg text-sm", isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted rounded-tl-none")}>
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
              placeholder="Type your message..." 
              className="min-h-[80px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button 
              className="shrink-0 h-[80px] w-[80px] flex flex-col gap-1" 
              onClick={handleSend}
              disabled={!body.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              <span>Send</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
