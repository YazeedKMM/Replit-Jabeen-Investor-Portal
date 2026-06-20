import { Project, useUpdateProject, useDeleteProject, useListUsers, useListTemplates } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trash2 } from "lucide-react";
import { getGetProjectQueryKey } from "@workspace/api-client-react";

interface Props {
  project: Project;
  isAdmin: boolean;
}

const updateProjectSchema = z.object({
  name: z.string().min(1, "Name required"),
  sector: z.string().min(1, "Sector required"),
  plotNumber: z.string().optional(),
  notes: z.string().optional(),
  attentionFlag: z.boolean(),
  investorId: z.coerce.number().optional().nullable(),
  pipelineId: z.coerce.number().optional().nullable(),
});

export default function ProjectManageTab({ project, isAdmin }: Props) {
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: investors } = useListUsers({ role: "investor" });
  const { data: templates } = useListTemplates();

  const form = useForm<z.infer<typeof updateProjectSchema>>({
    resolver: zodResolver(updateProjectSchema),
    defaultValues: {
      name: project.name,
      sector: project.sector,
      plotNumber: project.plotNumber || "",
      notes: project.notes || "",
      attentionFlag: project.attentionFlag || false,
      investorId: project.investorId,
      pipelineId: project.pipelineId,
    }
  });

  const onSubmit = async (data: z.infer<typeof updateProjectSchema>) => {
    try {
      await updateMutation.mutateAsync({
        projectId: project.id,
        data: {
          ...data,
          version: (project as Project & { version?: number }).version,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
      toast({ title: "Project updated successfully" });
    } catch (error: unknown) {
      const apiError = error as { response?: { status?: number; data?: { code?: string } } };
      if (apiError?.response?.status === 409) {
        toast({
          title: "Edit conflict — please reload",
          description: "This project was modified by another user while you were editing. Reload the page to get the latest version.",
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
      } else {
        toast({ title: "Update failed", variant: "destructive" });
      }
    }
  };

  const handleDelete = async () => {
    const confirmName = prompt(`To delete this project, type its name: ${project.name}`);
    if (confirmName !== project.name) {
      if (confirmName !== null) toast({ title: "Name didn't match. Deletion cancelled.", variant: "destructive" });
      return;
    }
    
    try {
      await deleteMutation.mutateAsync({ projectId: project.id });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
      setLocation("/dashboard");
    } catch (error) {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Project Metadata</CardTitle>
          <CardDescription>Update core details and assignments for this project.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="sector" render={({ field }) => (
                  <FormItem><FormLabel>Sector</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="plotNumber" render={({ field }) => (
                  <FormItem><FormLabel>Plot Number (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <FormField control={form.control} name="investorId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned Investor</FormLabel>
                    <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select investor..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        {investors?.map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.fullName} ({i.companyName})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="pipelineId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lifecycle Pipeline</FormLabel>
                    <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select template..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        {templates?.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormDescription>Changing the pipeline does not delete historical updates, but may misalign stages.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Public Notes</FormLabel><FormControl><Textarea className="h-32" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="attentionFlag" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base text-amber-600 font-bold flex items-center">Attention Required Flag</FormLabel>
                    <FormDescription>Manually flag this project to highlight it on dashboards.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={updateMutation.isPending}>Save Changes</Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="border-destructive/50 shadow-none bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center"><Trash2 className="mr-2 h-5 w-5" /> Danger Zone</CardTitle>
            <CardDescription>Irreversibly delete this project and all associated updates, messages, and documents.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>Delete Project Permanently</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
