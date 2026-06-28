import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Project, useUpdateProject, useDeleteProject, useListUsers, useListTemplates, useGetCities, useGetProjectCategories, getGetCitiesQueryKey, getGetProjectCategoriesQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DgaContentCard } from "@/components/ui/dga-card";
import { DgaSubmitButton } from "@/components/ui/dga-brand-button";
import { DgaButton } from "platformscode-new-react";
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

const makeUpdateProjectSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t("validation.nameRequired")),
  cityId: z.coerce.number().min(1, t("validation.cityRequired")),
  categoryId: z.coerce.number().min(1, t("validation.categoryRequired")),
  plotNumber: z.string().optional(),
  notes: z.string().optional(),
  attentionFlag: z.boolean(),
  investorId: z.coerce.number().optional().nullable(),
  pipelineId: z.coerce.number().optional().nullable(),
});
type UpdateProjectForm = z.infer<ReturnType<typeof makeUpdateProjectSchema>>;

export default function ProjectManageTab({ project, isAdmin }: Props) {
  const { t } = useTranslation();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: investors } = useListUsers({ role: "investor" });
  const { data: templates } = useListTemplates();
  const { data: allCities } = useGetCities({ query: { queryKey: getGetCitiesQueryKey() } });
  const { data: allCategories } = useGetProjectCategories({ query: { queryKey: getGetProjectCategoriesQueryKey() } });

  const updateProjectSchema = useMemo(() => makeUpdateProjectSchema(t), [t]);
  const form = useForm<UpdateProjectForm>({
    resolver: zodResolver(updateProjectSchema),
    defaultValues: {
      name: project.name,
      cityId: project.cityId,
      categoryId: project.categoryId,
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
      toast({ title: t("projects.manage.toastUpdated") });
    } catch (error: unknown) {
      const apiError = error as { response?: { status?: number; data?: { code?: string } } };
      if (apiError?.response?.status === 409) {
        toast({
          title: t("projects.manage.toastConflictTitle"),
          description: t("projects.manage.toastConflictDesc"),
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
      } else {
        toast({ title: t("projects.manage.toastUpdateFailed"), variant: "destructive" });
      }
    }
  };

  const handleDelete = async () => {
    const confirmName = prompt(t("projects.manage.deletePrompt", { name: project.name }));
    if (confirmName !== project.name) {
      if (confirmName !== null) toast({ title: t("projects.manage.toastNameMismatch"), variant: "destructive" });
      return;
    }

    try {
      await deleteMutation.mutateAsync({ projectId: project.id });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: t("projects.manage.toastDeleted") });
      setLocation("/dashboard");
    } catch (error) {
      toast({ title: t("projects.manage.toastDeleteFailed"), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <DgaContentCard className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("projects.manage.metadataTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("projects.manage.metadataDesc")}</p>
        </div>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>{t("projects.manage.fieldName")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="cityId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.manage.fieldCity")}</FormLabel>
                    <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("projects.manage.fieldCityPlaceholder")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {allCities?.filter(c => c.enabled).map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="categoryId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.manage.fieldCategory")}</FormLabel>
                    <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("projects.manage.fieldCategoryPlaceholder")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {allCategories?.filter(c => c.enabled).map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="plotNumber" render={({ field }) => (
                  <FormItem><FormLabel>{t("projects.manage.fieldPlotNumber")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />

                <FormField control={form.control} name="investorId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.manage.fieldInvestor")}</FormLabel>
                    <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("projects.manage.fieldInvestorPlaceholder")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {investors?.map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.fullName} ({i.companyName})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="pipelineId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("projects.manage.fieldPipeline")}</FormLabel>
                    <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("projects.manage.fieldPipelinePlaceholder")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {templates?.map(tmpl => <SelectItem key={tmpl.id} value={tmpl.id.toString()}>{tmpl.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormDescription>{t("projects.manage.fieldPipelineDesc")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>{t("projects.manage.fieldNotes")}</FormLabel><FormControl><Textarea className="h-32" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="attentionFlag" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base text-amber-600 font-bold flex items-center">{t("projects.manage.fieldAttentionFlag")}</FormLabel>
                    <FormDescription>{t("projects.manage.fieldAttentionFlagDesc")}</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />

              <div className="flex justify-end pt-4">
                <DgaSubmitButton
                  onSubmit={form.handleSubmit(onSubmit)}
                  loading={updateMutation.isPending}
                  loadingLabel={t("projects.manage.saveChanges")}
                  label={t("projects.manage.saveChanges")}
                />
              </div>
            </form>
          </Form>
      </DgaContentCard>

      {isAdmin && (
        <DgaContentCard className="space-y-4">
          <div>
            <h2 className="text-destructive flex items-center text-lg font-semibold"><Trash2 className="me-2 h-5 w-5" /> {t("projects.manage.dangerZoneTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("projects.manage.dangerZoneDesc")}</p>
          </div>
          <DgaButton variant="des-primary" label={t("projects.manage.deleteButton")} disabled={deleteMutation.isPending} onOnClick={handleDelete} />
        </DgaContentCard>
      )}
    </div>
  );
}
