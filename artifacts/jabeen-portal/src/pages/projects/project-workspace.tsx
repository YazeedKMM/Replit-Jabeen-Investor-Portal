import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGetProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type DerivedStatus } from "@/components/status-badge";
import { Building2, MapPin, Calendar, FileText, Activity, MessageSquare, History, Settings } from "lucide-react";
import { fmtDate } from "@/lib/format";

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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="bg-destructive/10 p-4 rounded-full mb-4">
          <Building2 className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold mb-2">{t("projects.workspace.notFoundTitle")}</h2>
        <p className="text-muted-foreground">{t("projects.workspace.notFoundDesc")}</p>
      </div>
    );
  }

  const isManager = user?.role !== "investor";
  const isAdmin = user?.role === "administrator";
  const isPrivileged = isManager || isAdmin;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      {/* Header Profile Area */}
      <div className="rounded-xl border border-card-border bg-card p-6">
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
                <StatusBadge status={project.derivedStatus as DerivedStatus} />
                {project.attentionFlag && (
                  <Badge variant="outline" className="border-transparent bg-warning/20 text-foreground">{t("projects.workspace.needsAttention")}</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-y-2 gap-x-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {project.agreementNumber}
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {project.plotNumber || t("projects.workspace.plotTbd")}
                </div>
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {project.city?.shortName} · {project.category?.name}
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {t("projects.workspace.added", { date: fmtDate(project.createdAt) })}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0 md:items-end min-w-[200px]">
              <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("projects.workspace.currentStage")}</span>
              <div className="text-lg font-bold">{project.currentStage?.name || t("projects.workspace.stageInitializing")}</div>
              <div className="flex items-center gap-2 w-full mt-1">
                <div className="flex-1">
                  <Progress value={project.constructionPct} className="h-1.5" aria-label={t("projects.workspace.currentStage")} />
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
                <Activity className="h-4 w-4 me-2" /> {t("projects.workspace.tabs.overview")}
              </TabsTrigger>
              <TabsTrigger value="updates" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3">
                <History className="h-4 w-4 me-2" /> {t("projects.workspace.tabs.updates")}
              </TabsTrigger>
              <TabsTrigger value="documents" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3">
                <FileText className="h-4 w-4 me-2" /> {t("projects.workspace.tabs.documents")}
              </TabsTrigger>
              <TabsTrigger value="messages" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3">
                <MessageSquare className="h-4 w-4 me-2" /> {t("projects.workspace.tabs.messages")}
              </TabsTrigger>

              {isPrivileged && (
                <TabsTrigger value="internal" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 text-accent">
                  <FileText className="h-4 w-4 me-2" /> {t("projects.workspace.tabs.internal")}
                </TabsTrigger>
              )}

              {isPrivileged && (
                <TabsTrigger value="manage" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3">
                  <Settings className="h-4 w-4 me-2" /> {t("projects.workspace.tabs.manage")}
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
