import { useListTemplates, useDeleteTemplate } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, GitMerge } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function TemplatesPage() {
  const { data: templates, isLoading } = useListTemplates();
  const deleteMutation = useDeleteTemplate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this template? Projects using it will remain unaffected, but it will be unavailable for new projects.")) return;
    try {
      await deleteMutation.mutateAsync({ templateId: id });
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete template", variant: "destructive" });
    }
  };

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map(template => (
            <Card key={template.id} className="flex flex-col hover:shadow-md transition-all">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1 pr-4">
                    <CardTitle className="text-xl leading-tight line-clamp-2">{template.name}</CardTitle>
                    {template.isDefault && (
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/20" variant="secondary">Default Pipeline</Badge>
                    )}
                  </div>
                  <div className="bg-muted p-2 rounded-md flex flex-col items-center justify-center min-w-12">
                    <span className="text-lg font-bold">{template.stageCount}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Stages</span>
                  </div>
                </div>
                <CardDescription className="line-clamp-2 mt-2">{template.description || "No description provided."}</CardDescription>
              </CardHeader>
              <div className="flex-1" />
              <CardFooter className="pt-4 border-t bg-muted/10 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  Added {format(new Date(template.createdAt), 'MMM d, yyyy')}
                </span>
                <div className="flex gap-2">
                  <Link href={`/templates/${template.id}`}>
                    <Button variant="outline" size="sm" className="h-8"><Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit</Button>
                  </Link>
                  <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(template.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
