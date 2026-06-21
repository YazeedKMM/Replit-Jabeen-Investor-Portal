import { Project } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, User, Mail, Phone, MapPin, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
  isPrivileged: boolean;
}

export default function ProjectOverviewTab({ project, isPrivileged }: Props) {
  // If no pipeline is attached, show a fallback message
  if (!project.pipeline) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent className="py-8 text-center text-muted-foreground">
              No template pipeline has been assigned to this project yet.
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const stages = project.pipeline.stages || [];
  const currentIndex = stages.findIndex(s => s.id === project.currentStageId);
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Visual Pipeline Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline: {project.pipeline.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative border-l-2 border-muted ml-3 md:ml-4 space-y-6 py-2">
              {stages.map((stage, idx) => {
                const isPast = currentIndex !== -1 && idx < currentIndex;
                const isCurrent = project.currentStageId === stage.id || (currentIndex === -1 && idx === 0 && project.currentStageId == null);
                
                return (
                  <div key={stage.id} className="relative pl-8 md:pl-10">
                    {/* Node indicator */}
                    <span className={cn(
                      "absolute -left-[11px] top-1 h-5 w-5 rounded-full flex items-center justify-center ring-4 ring-card",
                      isPast ? "bg-emerald-500 text-white" : 
                      isCurrent ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                    )}>
                      {isPast ? <CheckCircle2 className="h-3.5 w-3.5" /> : 
                       isCurrent ? <Circle className="h-2 w-2 fill-current" /> : 
                       <span className="text-[10px] font-bold">{idx + 1}</span>}
                    </span>

                    <div className={cn(
                      "flex flex-col gap-1",
                      isPast ? "opacity-70" : isCurrent ? "opacity-100" : "opacity-50"
                    )}>
                      <h4 className={cn("text-base font-semibold leading-none", isCurrent && "text-primary")}>
                        {stage.name}
                      </h4>
                      <p className="text-sm text-muted-foreground">{stage.description || "No description."}</p>
                      
                      {/* Show current status details if active */}
                      {isCurrent && (
                         <div className="mt-3 p-4 bg-muted/30 rounded-md border border-border/50">
                           <div className="text-sm font-medium mb-2">Stage Requirements</div>
                           <div className="flex flex-wrap gap-2">
                              {stage.fields?.length === 0 ? (
                                <span className="text-xs text-muted-foreground">No specific data required to complete this stage.</span>
                              ) : (
                                stage.fields?.map(f => (
                                  <span key={f.id} className="text-[10px] uppercase tracking-wider bg-background border px-2 py-1 rounded-sm">
                                    {f.name} {f.required && <span className="text-destructive">*</span>}
                                  </span>
                                ))
                              )}
                           </div>
                         </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Project Notes */}
        {project.notes && (
          <Card>
            <CardHeader><CardTitle>Project Notes</CardTitle></CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">{project.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        {/* Investor Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Investor Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {project.investor ? (
              <>
                <div className="flex items-center gap-3 border-b pb-4">
                  <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold">
                    {project.investor.fullName.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold">{project.investor.fullName}</div>
                    <div className="text-sm text-muted-foreground">{project.investor.companyName}</div>
                  </div>
                </div>
                <div className="space-y-3 pt-2 text-sm">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a href={`mailto:${project.investor.email}`} className="hover:underline">{project.investor.email}</a>
                  </div>
                  {project.investor.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a href={`tel:${project.investor.phone}`} className="hover:underline">{project.investor.phone}</a>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex flex-wrap gap-1.5">
                      {project.city && (
                        <Badge variant="secondary">{project.city.name ?? project.city.shortName}</Badge>
                      )}
                      {project.category && (
                        <Badge variant="outline">{project.category.name}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground italic">No investor assigned.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
