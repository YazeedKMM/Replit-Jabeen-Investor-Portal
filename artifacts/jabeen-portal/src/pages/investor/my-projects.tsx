import { useListProjects } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Building2, MapPin, Calendar, ArrowRight, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function MyProjectsPage() {
  const { data: projects, isLoading } = useListProjects();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on-track': return 'bg-emerald-500/15 text-emerald-700 border-emerald-200';
      case 'delayed': return 'bg-amber-500/15 text-amber-700 border-amber-200';
      case 'stalled': return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'complete': return 'bg-blue-500/15 text-blue-700 border-blue-200';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">My Projects</h1>
        <p className="text-muted-foreground text-lg">Track and manage your industrial investments</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i} className="h-64 animate-pulse bg-muted/20 border-border/50" />
          ))}
        </div>
      ) : !projects?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No projects yet</h3>
            <p className="text-muted-foreground max-w-sm">
              You haven't been assigned to any projects. Projects will appear here once an agreement is signed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card key={project.id} className={cn("flex flex-col transition-all hover:shadow-md", project.attentionFlag && "ring-1 ring-amber-500/50")}>
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start gap-4 mb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-xl leading-tight line-clamp-2" title={project.name}>{project.name}</CardTitle>
                    <CardDescription className="font-medium text-primary/80">{project.agreementNumber}</CardDescription>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0 uppercase tracking-wider text-[10px] font-bold px-2 py-0.5", getStatusColor(project.derivedStatus))}>
                    {getStatusLabel(project.derivedStatus)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-5">
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                  <div className="space-y-1">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Sector</span>
                    <p className="font-medium truncate" title={project.sector}>{project.sector}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Plot</span>
                    <p className="font-medium truncate flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {project.plotNumber || "TBD"}
                    </p>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Current Stage</span>
                    <p className="font-medium truncate">{project.currentStage?.name || "Initializing"}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Construction Progress</span>
                    <span>{project.constructionPct}%</span>
                  </div>
                  <Progress value={project.constructionPct} className="h-2" />
                </div>
                
                {project.attentionFlag && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 p-3 rounded-md flex items-start gap-2 text-sm border border-amber-200 dark:border-amber-900/50">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p className="leading-tight">This project requires your attention. Please review recent updates.</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="pt-4 border-t bg-muted/20 flex justify-between items-center">
                <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Updated {project.lastUpdateAt ? format(new Date(project.lastUpdateAt), 'MMM d, yyyy') : 'Never'}</span>
                </div>
                <Link href={`/projects/${project.id}`} className="text-sm font-semibold text-primary flex items-center gap-1 hover:underline">
                  View details <ArrowRight className="h-4 w-4" />
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
