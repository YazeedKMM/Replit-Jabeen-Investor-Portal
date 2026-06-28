import { useState, useMemo } from "react";
import {
  useGetCities,
  useCreateCity,
  useUpdateCity,
  useDeleteCity,
  getGetCitiesQueryKey,
  City,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DgaContentCard } from "@/components/ui/dga-card";
import { DgaModal } from "@/components/ui/dga-modal";
import { DgaForm } from "@/components/ui/dga-form";
import { DgaTextField } from "@/components/ui/dga-text-field";
import { DgaBrandButton, DgaSubmitButton } from "@/components/ui/dga-brand-button";
import { DgaTag, DgaButton } from "platformscode-new-react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

const makeCreateCitySchema = (t: TFunction) => z.object({
  code: z.string().min(1, t("validation.codeRequired")).max(20, t("validation.codeMax20")),
  name: z.string().min(1, t("validation.nameRequired")),
  shortName: z.string().min(1, t("validation.shortNameRequired")),
  sortOrder: z.coerce.number().default(0),
});

const makeEditCitySchema = (t: TFunction) => z.object({
  name: z.string().min(1, t("validation.nameRequired")),
  shortName: z.string().min(1, t("validation.shortNameRequired")),
  sortOrder: z.coerce.number().default(0),
});

type CreateCityFormValues = z.infer<ReturnType<typeof makeCreateCitySchema>>;
type EditCityFormValues = z.infer<ReturnType<typeof makeEditCitySchema>>;

export default function CitiesPage() {
  const { t } = useTranslation();
  const createCitySchema = useMemo(() => makeCreateCitySchema(t), [t]);
  const editCitySchema = useMemo(() => makeEditCitySchema(t), [t]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<City | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<City | null>(null);

  const { data: cities, isLoading } = useGetCities();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createCity = useCreateCity();
  const updateCity = useUpdateCity();
  const deleteCity = useDeleteCity();

  const createForm = useForm<CreateCityFormValues>({
    resolver: zodResolver(createCitySchema),
    defaultValues: { code: "", name: "", shortName: "", sortOrder: 0 },
  });

  const editForm = useForm<EditCityFormValues>({
    resolver: zodResolver(editCitySchema),
    defaultValues: { name: "", shortName: "", sortOrder: 0 },
  });

  const invalidateCities = () => {
    queryClient.invalidateQueries({ queryKey: getGetCitiesQueryKey() });
  };

  const onCreateSubmit = async (data: CreateCityFormValues) => {
    try {
      await createCity.mutateAsync({ data });
      invalidateCities();
      toast({ title: t("admin.cities.toast.created"), description: t("admin.cities.toast.createdDesc", { name: data.name }) });
      createForm.reset();
      setCreateDialogOpen(false);
    } catch (error: any) {
      toast({
        title: t("admin.cities.toast.createFailed"),
        description: error.data?.message || error.data?.error || t("common.loading"),
        variant: "destructive",
      });
    }
  };

  const onEditSubmit = async (data: EditCityFormValues) => {
    if (!editTarget) return;
    try {
      await updateCity.mutateAsync({ cityId: editTarget.id, data });
      invalidateCities();
      toast({ title: t("admin.cities.toast.updated"), description: t("admin.cities.toast.updatedDesc", { name: data.name }) });
      setEditTarget(null);
      editForm.reset();
    } catch (error: any) {
      toast({
        title: t("admin.cities.toast.updateFailed"),
        description: error.data?.message || error.data?.error || t("common.loading"),
        variant: "destructive",
      });
    }
  };

  const handleToggleEnabled = async (city: City) => {
    const nextEnabled = !city.enabled;
    try {
      await updateCity.mutateAsync({ cityId: city.id, data: { enabled: nextEnabled } });
      invalidateCities();
      toast({
        title: t("admin.cities.toast.updated"),
        description: t("admin.cities.toast.updatedDesc", { name: city.name }),
      });
    } catch (error: any) {
      toast({
        title: t("admin.cities.toast.updateFailed"),
        description: error.data?.message || error.data?.error || t("common.loading"),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (city: City) => {
    try {
      await deleteCity.mutateAsync({ cityId: city.id });
      invalidateCities();
      toast({ title: t("admin.cities.toast.deleted"), description: t("admin.cities.toast.deletedDesc", { name: city.name }) });
    } catch (error: any) {
      toast({
        title: t("admin.cities.toast.cannotDelete"),
        description: error.data?.message || error.data?.error || t("admin.cities.toast.cannotDeleteDesc"),
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (city: City) => {
    setEditTarget(city);
    editForm.reset({ name: city.name, shortName: city.shortName, sortOrder: city.sortOrder });
  };

  const createSubmit = createForm.handleSubmit(onCreateSubmit);
  const editSubmit = editForm.handleSubmit(onEditSubmit);
  const cleanCopy = (key: string, name: string) =>
    t(key, { name }).replace("<1>", "").replace("</1>", "");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("admin.cities.title")}</h1>
          <p className="text-muted-foreground">{t("admin.cities.subtitle")}</p>
        </div>
        <DgaBrandButton label={t("admin.cities.addCity")} onOnClick={() => setCreateDialogOpen(true)} />
      </div>

      <DgaContentCard className="!p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.cities.colCode")}</TableHead>
              <TableHead>{t("admin.cities.colName")}</TableHead>
              <TableHead>{t("admin.cities.colShortName")}</TableHead>
              <TableHead>{t("admin.cities.colEnabled")}</TableHead>
              <TableHead>{t("admin.cities.colSortOrder")}</TableHead>
              <TableHead className="text-end">{t("admin.cities.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : !cities?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t("admin.cities.noCities")}
                </TableCell>
              </TableRow>
            ) : (
              cities.map((city) => (
                <TableRow key={city.id}>
                  <TableCell>
                    <DgaTag variant="neutral" size="sm" outlined label={city.code} />
                  </TableCell>
                  <TableCell className="font-medium">{city.name}</TableCell>
                  <TableCell className="text-muted-foreground">{city.shortName}</TableCell>
                  <TableCell>
                    <Switch
                      checked={city.enabled}
                      onCheckedChange={() => handleToggleEnabled(city)}
                      data-testid={`switch-city-enabled-${city.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{city.sortOrder}</TableCell>
                  <TableCell className="text-end flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(city)}
                      title={t("admin.cities.tooltipEdit")}
                      aria-label={t("admin.cities.tooltipEdit")}
                      data-testid={`button-edit-city-${city.id}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("admin.cities.tooltipDelete")}
                      aria-label={t("admin.cities.tooltipDelete")}
                      data-testid={`button-delete-city-${city.id}`}
                      onClick={() => setDeleteTarget(city)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DgaContentCard>

      {/* Create City */}
      <DgaModal
        open={createDialogOpen}
        onOpenChange={(o) => { setCreateDialogOpen(o); if (!o) createForm.reset(); }}
        title={t("admin.cities.createDialog.title")}
        footer={
          <div className="flex gap-3 justify-end">
            <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={() => setCreateDialogOpen(false)} />
            <DgaSubmitButton
              onSubmit={createSubmit}
              loading={createForm.formState.isSubmitting}
              loadingLabel={t("common.loading")}
              label={t("admin.cities.createDialog.submitAdd")}
            />
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">{t("admin.cities.createDialog.description")}</p>
        <DgaForm onSubmit={createSubmit} className="grid grid-cols-2 gap-4">
          <DgaTextField control={createForm.control} name="code" label={t("admin.cities.createDialog.fieldCode")} placeholder="RYD" required />
          <DgaTextField control={createForm.control} name="name" label={t("admin.cities.createDialog.fieldName")} placeholder="Riyadh" required />
          <DgaTextField control={createForm.control} name="shortName" label={t("admin.cities.createDialog.fieldShortName")} placeholder="RYD" required />
          <DgaTextField control={createForm.control} name="sortOrder" label={t("admin.cities.createDialog.fieldSortOrder")} required />
        </DgaForm>
      </DgaModal>

      {/* Edit City */}
      <DgaModal
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) { setEditTarget(null); editForm.reset(); } }}
        title={t("admin.cities.editDialog.title")}
        footer={
          <div className="flex gap-3 justify-end">
            <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={() => { setEditTarget(null); editForm.reset(); }} />
            <DgaSubmitButton
              onSubmit={editSubmit}
              loading={editForm.formState.isSubmitting}
              loadingLabel={t("common.loading")}
              label={t("admin.cities.editDialog.submitSave")}
            />
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">{cleanCopy("admin.cities.editDialog.description", editTarget?.name ?? "")}</p>
        <DgaForm onSubmit={editSubmit} className="grid grid-cols-2 gap-4">
          <DgaTextField control={editForm.control} name="name" label={t("admin.cities.editDialog.fieldName")} required />
          <DgaTextField control={editForm.control} name="shortName" label={t("admin.cities.editDialog.fieldShortName")} required />
          <DgaTextField control={editForm.control} name="sortOrder" label={t("admin.cities.editDialog.fieldSortOrder")} required />
        </DgaForm>
      </DgaModal>

      {/* Delete confirmation */}
      <DgaModal
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title={t("admin.cities.deleteDialog.title")}
        footer={
          <div className="flex gap-3 justify-end">
            <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={() => setDeleteTarget(null)} />
            <DgaButton
              variant="des-primary"
              label={t("admin.cities.deleteDialog.confirmDelete")}
              onOnClick={() => { if (deleteTarget) handleDelete(deleteTarget); setDeleteTarget(null); }}
            />
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{cleanCopy("admin.cities.deleteDialog.description", deleteTarget?.name ?? "")}</p>
      </DgaModal>
    </div>
  );
}
