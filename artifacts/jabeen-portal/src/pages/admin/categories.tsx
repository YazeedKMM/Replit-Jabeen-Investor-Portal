import { useState, useMemo } from "react";
import {
  useGetProjectCategories,
  useCreateProjectCategory,
  useUpdateProjectCategory,
  useDeleteProjectCategory,
  getGetProjectCategoriesQueryKey,
  ProjectCategory,
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

const makeCreateCategorySchema = (t: TFunction) => z.object({
  code: z.string().min(1, t("validation.codeRequired")).max(40, t("validation.codeMax40")),
  name: z.string().min(1, t("validation.nameRequired")),
  sortOrder: z.coerce.number().default(0),
});

const makeEditCategorySchema = (t: TFunction) => z.object({
  name: z.string().min(1, t("validation.nameRequired")),
  sortOrder: z.coerce.number().default(0),
});

type CreateCategoryFormValues = z.infer<ReturnType<typeof makeCreateCategorySchema>>;
type EditCategoryFormValues = z.infer<ReturnType<typeof makeEditCategorySchema>>;

export default function CategoriesPage() {
  const { t } = useTranslation();
  const createCategorySchema = useMemo(() => makeCreateCategorySchema(t), [t]);
  const editCategorySchema = useMemo(() => makeEditCategorySchema(t), [t]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectCategory | null>(null);

  const { data: categories, isLoading } = useGetProjectCategories();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createCategory = useCreateProjectCategory();
  const updateCategory = useUpdateProjectCategory();
  const deleteCategory = useDeleteProjectCategory();

  const createForm = useForm<CreateCategoryFormValues>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: { code: "", name: "", sortOrder: 0 },
  });

  const editForm = useForm<EditCategoryFormValues>({
    resolver: zodResolver(editCategorySchema),
    defaultValues: { name: "", sortOrder: 0 },
  });

  const invalidateCategories = () => {
    queryClient.invalidateQueries({ queryKey: getGetProjectCategoriesQueryKey() });
  };

  const onCreateSubmit = async (data: CreateCategoryFormValues) => {
    try {
      await createCategory.mutateAsync({ data });
      invalidateCategories();
      toast({ title: t("admin.categories.toast.created"), description: t("admin.categories.toast.createdDesc", { name: data.name }) });
      createForm.reset();
      setCreateDialogOpen(false);
    } catch (error: any) {
      toast({
        title: t("admin.categories.toast.createFailed"),
        description: error.data?.message || error.data?.error || t("common.loading"),
        variant: "destructive",
      });
    }
  };

  const onEditSubmit = async (data: EditCategoryFormValues) => {
    if (!editTarget) return;
    try {
      await updateCategory.mutateAsync({ categoryId: editTarget.id, data });
      invalidateCategories();
      toast({ title: t("admin.categories.toast.updated"), description: t("admin.categories.toast.updatedDesc", { name: data.name }) });
      setEditTarget(null);
      editForm.reset();
    } catch (error: any) {
      toast({
        title: t("admin.categories.toast.updateFailed"),
        description: error.data?.message || error.data?.error || t("common.loading"),
        variant: "destructive",
      });
    }
  };

  const handleToggleEnabled = async (category: ProjectCategory) => {
    const nextEnabled = !category.enabled;
    try {
      await updateCategory.mutateAsync({ categoryId: category.id, data: { enabled: nextEnabled } });
      invalidateCategories();
      toast({
        title: t("admin.categories.toast.updated"),
        description: t("admin.categories.toast.updatedDesc", { name: category.name }),
      });
    } catch (error: any) {
      toast({
        title: t("admin.categories.toast.updateFailed"),
        description: error.data?.message || error.data?.error || t("common.loading"),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (category: ProjectCategory) => {
    try {
      await deleteCategory.mutateAsync({ categoryId: category.id });
      invalidateCategories();
      toast({ title: t("admin.categories.toast.deleted"), description: t("admin.categories.toast.deletedDesc", { name: category.name }) });
    } catch (error: any) {
      toast({
        title: t("admin.categories.toast.cannotDelete"),
        description: error.data?.message || error.data?.error || t("admin.categories.toast.cannotDeleteDesc"),
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (category: ProjectCategory) => {
    setEditTarget(category);
    editForm.reset({ name: category.name, sortOrder: category.sortOrder });
  };

  const createSubmit = createForm.handleSubmit(onCreateSubmit);
  const editSubmit = editForm.handleSubmit(onEditSubmit);
  const cleanCopy = (key: string, name: string) =>
    t(key, { name }).replace("<1>", "").replace("</1>", "");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("admin.categories.title")}</h1>
          <p className="text-muted-foreground">{t("admin.categories.subtitle")}</p>
        </div>
        <DgaBrandButton label={t("admin.categories.addCategory")} onOnClick={() => setCreateDialogOpen(true)} />
      </div>

      <DgaContentCard className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.categories.colCode")}</TableHead>
              <TableHead>{t("admin.categories.colName")}</TableHead>
              <TableHead>{t("admin.categories.colEnabled")}</TableHead>
              <TableHead>{t("admin.categories.colSortOrder")}</TableHead>
              <TableHead className="text-end">{t("admin.categories.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : !categories?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {t("admin.categories.noCategories")}
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>
                    <DgaTag variant="neutral" size="sm" outlined label={category.code} />
                  </TableCell>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={category.enabled}
                      onCheckedChange={() => handleToggleEnabled(category)}
                      data-testid={`switch-category-enabled-${category.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{category.sortOrder}</TableCell>
                  <TableCell className="text-end flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(category)}
                      title={t("admin.categories.tooltipEdit")}
                      data-testid={`button-edit-category-${category.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("admin.categories.tooltipDelete")}
                      data-testid={`button-delete-category-${category.id}`}
                      onClick={() => setDeleteTarget(category)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DgaContentCard>

      {/* Create Category */}
      <DgaModal
        open={createDialogOpen}
        onOpenChange={(o) => { setCreateDialogOpen(o); if (!o) createForm.reset(); }}
        title={t("admin.categories.createDialog.title")}
        footer={
          <div className="flex gap-3 justify-end">
            <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={() => setCreateDialogOpen(false)} />
            <DgaSubmitButton
              onSubmit={createSubmit}
              loading={createForm.formState.isSubmitting}
              loadingLabel={t("common.loading")}
              label={t("admin.categories.createDialog.submitAdd")}
            />
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">{t("admin.categories.createDialog.description")}</p>
        <DgaForm onSubmit={createSubmit} className="grid grid-cols-2 gap-4">
          <DgaTextField control={createForm.control} name="code" label={t("admin.categories.createDialog.fieldCode")} placeholder="MIXED-USE" required />
          <DgaTextField control={createForm.control} name="name" label={t("admin.categories.createDialog.fieldName")} placeholder="Mixed Use" required />
          <DgaTextField control={createForm.control} name="sortOrder" label={t("admin.categories.createDialog.fieldSortOrder")} required />
        </DgaForm>
      </DgaModal>

      {/* Edit Category */}
      <DgaModal
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) { setEditTarget(null); editForm.reset(); } }}
        title={t("admin.categories.editDialog.title")}
        footer={
          <div className="flex gap-3 justify-end">
            <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={() => { setEditTarget(null); editForm.reset(); }} />
            <DgaSubmitButton
              onSubmit={editSubmit}
              loading={editForm.formState.isSubmitting}
              loadingLabel={t("common.loading")}
              label={t("admin.categories.editDialog.submitSave")}
            />
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">{cleanCopy("admin.categories.editDialog.description", editTarget?.name ?? "")}</p>
        <DgaForm onSubmit={editSubmit} className="grid grid-cols-2 gap-4">
          <DgaTextField control={editForm.control} name="name" label={t("admin.categories.editDialog.fieldName")} required />
          <DgaTextField control={editForm.control} name="sortOrder" label={t("admin.categories.editDialog.fieldSortOrder")} required />
        </DgaForm>
      </DgaModal>

      {/* Delete confirmation */}
      <DgaModal
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title={t("admin.categories.deleteDialog.title")}
        footer={
          <div className="flex gap-3 justify-end">
            <DgaButton variant="secondary-outline" label={t("common.cancel")} onOnClick={() => setDeleteTarget(null)} />
            <DgaButton
              variant="des-primary"
              label={t("admin.categories.deleteDialog.confirmDelete")}
              onOnClick={() => { if (deleteTarget) handleDelete(deleteTarget); setDeleteTarget(null); }}
            />
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{cleanCopy("admin.categories.deleteDialog.description", deleteTarget?.name ?? "")}</p>
      </DgaModal>
    </div>
  );
}
