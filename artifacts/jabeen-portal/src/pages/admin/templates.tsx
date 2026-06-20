import { useListTemplates, useDeleteTemplate, useArchiveTemplate } from "@workspace/api-client-react";
import { getListTemplatesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, GitMerge, Archive } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function TemplatesPage() {
  const { data: templates, isLoading } = useListTemplates(
    { includeArchived: true },
    { query: { queryKey: getListTemplatesQueryKey({ includeArchived: true }) } }
  );
  const deleteMutation = useDeleteTemplate();
  const archiveMutation = useArchiveTemplate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
  };

  const handleDelete = async (id: number, name: string, assignedCount: number) => {
    if (assignedCount > 0) {
      if (!confirm(`This template has been assigned to ${assignedCount} project(s) and cannot be permanently deleted. Archive it instead? Archived templates are hidden from new assignment pickers but existing projects are unaffected.`)) return;
      try {
        await archiveMutation.mutateAsync({ templateId: id });
        invalidate();
        toast({ title: "Template archived" });
      } catch {
        toast({ title: "Error", description: "Could not archive template", variant: "destructive" });
      }
    } else {
      if (!confirm(`Permanently delete template "${name}"? This cannot be undone.`)) return;
      try {
        await deleteMutation.mutateAsync({ templateId: id });
        invalidate();
        toast({ title: "Template deleted" });
      } catch {
        toast({ title: "Error", description: "Could not delete template", variant: "destructive" });
      }
    }
  };

  const handleArchive = async (id: number) => {
    if (!confirm("Archive this template? It will be hidden from new assignment pickers but existing projects remain unaffected.")) return;
    try {
      await archiveMutation.mutateAsync({ templateId: id });
      invalidate();
      toast({ title: "Template archived" });
    } catch {
      toast({ title: "Error", description: "Could not archive template", variant: "destructive" });
    }
  };

  const activeTemplates = templates?.filter(t => !t.archivedAt) ?? [];
  const archivedTemplates = templates?.filter(t => !!t.archivedAt) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-start sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stage Templates</h1>
          <p className="text-muted-foreground">Manage project lifecycle pipelines.</p>
        </div>
        <Link href="/templates/new">
          <Button><Plus className="mr-2 h-4 w-4" /> New Template</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Card key={i} className="h-48 animate-pulse bg-muted/20" />)}
        </div>
      ) : !templates?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <GitMerge className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No templates found</h3>
            <p className="text-muted-foreground max-w-sm mb-4">Create a lifecycle pipeline template to assign to new projects.</p>
            <Link href="/templates/new">
              <Button><Plus className="mr-2 h-4 w-4" /> Create Template</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeTemplates.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Active Templates</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onDelete={handleDelete}
                    onArchive={handleArchive}
                  />
                ))}
              </div>
            </div>
          )}

          {archivedTemplates.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-muted-foreground">Archived Templates</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-60">
                {archivedTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onDelete={handleDelete}
                    onArchive={handleArchive}
                    archived
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: {
    id: number;
    name: string;
    description?: string | null;
    isDefault: boolean;
    stageCount: number;
    versionNumber: number;
    parentTemplateId?: number | null;
    archivedAt?: string | null;
    assignedProjectCount?: number;
    createdAt: string;
  };
  onDelete: (id: number, name: string, assignedCount: number) => void;
  onArchive: (id: number) => void;
  archived?: boolean;
}

function TemplateCard({ template, onDelete, onArchive, archived = false }: TemplateCardProps) {
  const assignedCount = template.assignedProjectCount ?? 0;
  const isAssigned = assignedCount > 0;

  return (
    <Card className={`flex flex-col hover:shadow-md transition-all ${archived ? "border-dashed" : ""}`}>
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1 pr-4">
            <CardTitle className="text-xl leading-tight line-clamp-2">{template.name}</CardTitle>
            <div className="flex flex-wrap gap-1">
              {template.isDefault && (
                <Badge className="bg-primary/10 text-primary hover:bg-primary/20" variant="secondary">Default</Badge>
              )}
              <Badge variant="outline" className="text-xs font-mono">v{template.versionNumber}</Badge>
              {archived && (
                <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs">
                  <Archive className="h-3 w-3 mr-1" /> Archived
                </Badge>
              )}
            </div>
          </div>
          <div className="bg-muted p-2 rounded-md flex flex-col items-center justify-center min-w-12">
            <span className="text-lg font-bold">{template.stageCount}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Stages</span>
          </div>
        </div>
        <CardDescription className="line-clamp-2 mt-2">{template.description || "No description provided."}</CardDescription>
        {isAssigned && (
          <p className="text-xs text-muted-foreground mt-1">
            Assigned to {assignedCount} project{assignedCount !== 1 ? "s" : ""}
          </p>
        )}
      </CardHeader>
      <div className="flex-1" />
      <CardFooter className="pt-4 border-t bg-muted/10 flex justify-between items-center">
        <span className="text-xs text-muted-foreground">
          Added {format(new Date(template.createdAt), 'MMM d, yyyy')}
        </span>
        {!archived && (
          <div className="flex gap-2">
            <Link href={`/templates/${template.id}`}>
              <Button variant="outline" size="sm" className="h-8"><Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit</Button>
            </Link>
            {isAssigned ? (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                onClick={() => onArchive(template.id)}
                title="Archive this template"
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(template.id, template.name, assignedCount)}
                title="Delete this template"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
