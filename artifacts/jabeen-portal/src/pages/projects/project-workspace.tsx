import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGetProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, MapPin, Loader2, Calendar, FileText, Activity, MessageSquare, History, Settings } from "lucide-react";
import { format } from "date-fns";

// Mock imports for tab components (to be implemented next)
import ProjectOverviewTab from "./tabs/overview-tab";
import ProjectUpdatesTab from "./tabs/updates-tab";
import ProjectDocumentsTab from "./tabs/documents-tab";
import ProjectMessagesTab from "./tabs/messages-tab";
import ProjectInternalNotesTab from "./tabs/internal-notes-tab";
import ProjectManageTab from "./tabs/manage-tab";

export default function ProjectWorkspacePage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const params = useParams();
  const projectId = parseInt(params.id!);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: project, isLoading, error } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on-track': return 'bg-emerald-500/15 text-emerald-700 border-emerald-200';
      case 'delayed': return 'bg-amber-500/15 text-amber-700 border-amber-200';
      case 'stalled': return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'complete': return 'bg-blue-500/15 text-blue-700 border-blue-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="bg-destructive/10 p-4 rounded-full mb-4">
          <Building2 className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold mb-2">Project not found</h2>
        <p className="text-muted-foreground">The project you're looking for doesn't exist or you don't have access to it.</p>
      </div>
    );
  }

  const isManager = user?.role !== "investor";
  const isAdmin = user?.role === "administrator";
  const isPrivileged = isManager || isAdmin;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      {/* Header Profile Area */}
      <div className="bg-card border rounded-lg p-6 shadow-sm">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <div className="flex gap-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        ) : !project ? null : (
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{project.name}</h1>
                <Badge variant="outline" className={`uppercase tracking-wider text-xs font-bold px-2.5 py-0.5 ${getStatusColor(project.derivedStatus)}`}>
                  {t(`status.${project.derivedStatus}`)}
                </Badge>
                {project.attentionFlag && (
                  <Badge variant="destructive" className="uppercase tracking-wider text-xs font-bold px-2.5 py-0.5">
                    Needs Attention
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-wrap gap-y-2 gap-x-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {project.agreementNumber}
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {project.plotNumber || "Plot TBD"}
                </div>
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {project.city?.shortName} · {project.category?.name}
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  Added {format(new Date(project.createdAt), 'MMM d, yyyy')}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0 md:items-end min-w-[200px]">
              <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Current Stage</span>
              <div className="text-lg font-bold">{project.currentStage?.name || "Initializing"}</div>
              <div className="flex items-center gap-2 w-full mt-1">
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500 ease-out" 
                    style={{ width: `${project.constructionPct}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-9 text-end">{project.constructionPct}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      {project && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="border-b overflow-x-auto">
            <TabsList className="h-12 w-auto min-w-full justify-start bg-transparent p-0">
              <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3">
                <Activity className="h-4 w-4 me-2" /> Overview
              </TabsTrigger>
              <TabsTrigger value="updates" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3">
                <History className="h-4 w-4 me-2" /> Progress Updates
              </TabsTrigger>
              <TabsTrigger value="documents" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3">
                <FileText className="h-4 w-4 me-2" /> Documents
              </TabsTrigger>
              <TabsTrigger value="messages" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3">
                <MessageSquare className="h-4 w-4 me-2" /> Messages
              </TabsTrigger>
              
              {isPrivileged && (
                <TabsTrigger value="internal" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 text-purple-700 dark:text-purple-400">
                  <FileText className="h-4 w-4 me-2" /> Internal Notes
                </TabsTrigger>
              )}
              
              {isPrivileged && (
                <TabsTrigger value="manage" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3">
                  <Settings className="h-4 w-4 me-2" /> Manage
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <div className="mt-6">
            <TabsContent value="overview" className="m-0 focus-visible:outline-none">
              <ProjectOverviewTab project={project} isPrivileged={isPrivileged} />
            </TabsContent>
            
            <TabsContent value="updates" className="m-0 focus-visible:outline-none">
              <ProjectUpdatesTab project={project} isPrivileged={isPrivileged} />
            </TabsContent>

            <TabsContent value="documents" className="m-0 focus-visible:outline-none">
              <ProjectDocumentsTab project={project} />
            </TabsContent>

            <TabsContent value="messages" className="m-0 focus-visible:outline-none">
              <ProjectMessagesTab project={project} />
            </TabsContent>

            {isPrivileged && (
              <TabsContent value="internal" className="m-0 focus-visible:outline-none">
                <ProjectInternalNotesTab project={project} />
              </TabsContent>
            )}

            {isPrivileged && (
              <TabsContent value="manage" className="m-0 focus-visible:outline-none">
                <ProjectManageTab project={project} isAdmin={isAdmin} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      )}
    </div>
  );
}
