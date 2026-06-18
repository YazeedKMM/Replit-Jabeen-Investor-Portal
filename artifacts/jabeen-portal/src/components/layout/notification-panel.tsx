import { useListNotifications, useMarkAllNotificationsRead, useMarkNotificationRead, Notification } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check, Info, MessageSquare, FileText, CheckCircle, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export function NotificationPanel() {
  const { data: notifications, isLoading } = useListNotifications();
  const markAllMutation = useMarkAllNotificationsRead();
  const markReadMutation = useMarkNotificationRead();
  const queryClient = useQueryClient();

  const handleMarkAllRead = async () => {
    await markAllMutation.mutateAsync();
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.read) {
      await markReadMutation.mutateAsync({ notificationId: notif.id });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    }
  };

  const getIcon = (kind: string) => {
    switch (kind) {
      case 'message': return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'internal-note': return <FileText className="h-4 w-4 text-purple-500" />;
      case 'update-submitted': return <Info className="h-4 w-4 text-amber-500" />;
      case 'update-approved': return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'update-rejected': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex flex-col h-[400px]">
      <div className="flex items-center justify-between p-4 border-b">
        <h4 className="font-semibold text-sm">Notifications</h4>
        {notifications?.some(n => !n.read) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={handleMarkAllRead}>
            <Check className="mr-2 h-3 w-3" /> Mark all read
          </Button>
        )}
      </div>
      
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : !notifications?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Bell className="h-8 w-8 opacity-20" />
            <p>No notifications yet</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {notifications.map((notif) => (
              <div 
                key={notif.id} 
                className={cn(
                  "p-4 border-b last:border-0 hover:bg-muted/50 transition-colors flex gap-3",
                  !notif.read ? "bg-primary/5" : ""
                )}
                onClick={() => handleNotificationClick(notif)}
              >
                <div className="mt-1 flex-shrink-0">
                  {getIcon(notif.kind)}
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-sm leading-tight", !notif.read ? "font-medium text-foreground" : "text-muted-foreground")}>
                      {notif.title}
                    </p>
                  </div>
                  {notif.body && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{notif.body}</p>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                    </span>
                    {notif.projectId && (
                      <Link href={`/projects/${notif.projectId}`} className="text-[10px] font-medium text-primary hover:underline" onClick={() => handleNotificationClick(notif)}>
                        View Project
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

