import { useState } from "react";
import { Project, useListUpdates, useCreateUpdate, useApproveUpdate, useRejectUpdate } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, CheckCircle2, XCircle, Clock, Info } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  project: Project;
  isPrivileged: boolean;
}

const createUpdateSchema = z.object({
  targetStageId: z.coerce.number().min(1, "Stage is required"),
  constructionPct: z.coerce.number().min(0).max(100),
  note: z.string().optional()
});

export default function ProjectUpdatesTab({ project, isPrivileged }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "administrator";

  const { data: updates, isLoading } = useListUpdates(project.id);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createMutation = useCreateUpdate();
  const approveMutation = useApproveUpdate();
  const rejectMutation = useRejectUpdate();

  // Determine which stages are selectable:
  // - Admins can target any stage (including going back)
  // - Others can only target current stage or later stages
  const allStages = project.pipeline?.stages ?? [];
  const currentStageIndex = allStages.findIndex(s => s.id === project.currentStageId);
  const selectableStages = isAdmin
    ? allStages
    : allStages.filter((_, idx) => idx >= Math.max(0, currentStageIndex));

  const form = useForm<z.infer<typeof createUpdateSchema>>({
    resolver: zodResolver(createUpdateSchema),
    defaultValues: {
      targetStageId: project.currentStageId || (allStages[0]?.id || 0),
      constructionPct: project.constructionPct,
      note: ""
    }
  });

  const onSubmit = async (data: z.infer<typeof createUpdateSchema>) => {
    try {
      await createMutation.mutateAsync({ projectId: project.id, data });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "updates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      toast({ title: "Update submitted", description: "Your progress update is pending review." });
      setIsSubmitOpen(false);
      form.reset();
    } catch (error: any) {
      toast({ title: "Submission failed", description: error.data?.message || "An error occurred", variant: "destructive" });
    }
  };

  const handleApprove = async (updateId: number) => {
    try {
      await approveMutation.mutateAsync({ projectId: project.id, updateId });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "updates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      toast({ title: "Update approved", description: "Project baseline has been updated." });
    } catch {
      toast({ title: "Approval failed", variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    try {
      await rejectMutation.mutateAsync({ projectId: project.id, updateId: rejectId, data: { reviewNote: rejectNote } });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "updates"] });
      toast({ title: "Update rejected" });
      setRejectId(null);
      setRejectNote("");
    } catch {
      toast({ title: "Rejection failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Progress History</h2>
        
        {project.pipeline && (
          <Dialog open={isSubmitOpen} onOpenChange={setIsSubmitOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Submit Update</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Submit Progress Update</DialogTitle>
                <DialogDescription>Record a milestone or completion percentage.</DialogDescription>
              </DialogHeader>
              
              {!isAdmin && currentStageIndex > 0 && (
                <div className="flex items-start gap-2 text-sm bg-muted/50 border rounded-md p-3">
                  <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">
                    Only the current stage and upcoming stages are available. Contact an administrator to revert to a previous stage.
                  </p>
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="targetStageId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Stage</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value.toString()}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a stage" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {selectableStages.map(s => (
                            <SelectItem key={s.id} value={s.id.toString()}>
                              {s.name}
                              {s.id === project.currentStageId && (
                                <span className="ml-2 text-xs text-muted-foreground">(current)</span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  
                  <FormField control={form.control} name="constructionPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Construction Complete (%)</FormLabel>
                      <FormControl><Input type="number" min="0" max="100" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="note" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                      <FormControl><Textarea placeholder="Details about this update..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <DialogFooter className="pt-4">
                    <Button variant="outline" type="button" onClick={() => setIsSubmitOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !updates?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center">
            <Clock className="h-10 w-10 mb-4 opacity-20" />
            <p>No progress updates have been submitted yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
          {updates.map((update) => (
            <div key={update.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-muted text-muted-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ml-0 absolute left-0 md:left-1/2 md:-translate-x-1/2">
                {update.reviewStatus === 'approved' ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> :
                 update.reviewStatus === 'rejected' ? <XCircle className="h-5 w-5 text-destructive" /> :
                 <Clock className="h-5 w-5 text-amber-500" />}
              </div>

              <Card className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] ml-12 md:ml-0 shadow-sm transition-all hover:shadow-md">
                <CardHeader className="p-4 pb-2 border-b bg-muted/10">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{update.targetStage?.name || "Unknown Stage"}</CardTitle>
                      <div className="text-xs text-muted-foreground mt-1">
                        By {update.author?.fullName} · {format(new Date(update.createdAt), 'MMM d, yyyy')}
                      </div>
                    </div>
                    <Badge variant="outline" className={
                      update.reviewStatus === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                      update.reviewStatus === 'rejected' ? 'bg-destructive/10 text-destructive' :
                      'bg-amber-50 text-amber-700'
                    }>
                      {update.reviewStatus.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-sm">
                  <div className="flex items-center gap-2 bg-muted/30 p-2 rounded border">
                    <span className="font-semibold">{update.constructionPct}% Complete</span>
                  </div>
                  
                  {update.note && (
                    <div>
                      <span className="font-semibold block mb-1 text-xs uppercase text-muted-foreground">Notes</span>
                      <p className="text-muted-foreground bg-muted/20 p-3 rounded">{update.note}</p>
                    </div>
                  )}

                  {update.reviewStatus === 'rejected' && update.reviewNote && (
                    <div className="bg-destructive/10 p-3 rounded border border-destructive/20">
                      <span className="font-semibold block mb-1 text-xs uppercase text-destructive">Rejection Reason</span>
                      <p className="text-destructive/80">{update.reviewNote}</p>
                    </div>
                  )}

                  {isPrivileged && update.reviewStatus === 'pending' && (
                    <div className="flex gap-2 pt-4 border-t mt-4">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(update.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve
                      </Button>
                      <Dialog open={rejectId === update.id} onOpenChange={(o) => !o && setRejectId(null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="destructive" onClick={() => setRejectId(update.id)}>
                            <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Reject Update</DialogTitle></DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <FormLabel>Reason for rejection</FormLabel>
                              <Textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Please explain why..." />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleReject} disabled={!rejectNote}>Confirm Rejection</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
