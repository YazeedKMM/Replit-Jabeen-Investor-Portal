import { useState } from "react";
import {
  useGetProjectCategories,
  useCreateProjectCategory,
  useUpdateProjectCategory,
  useDeleteProjectCategory,
  getGetProjectCategoriesQueryKey,
  ProjectCategory,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMemo } from "react";

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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("admin.categories.title")}</h1>
          <p className="text-muted-foreground">{t("admin.categories.subtitle")}</p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-category">
              <Plus className="me-2 h-4 w-4" /> {t("admin.categories.addCategory")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>{t("admin.categories.createDialog.title")}</DialogTitle>
              <DialogDescription>{t("admin.categories.createDialog.description")}</DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={createForm.control} name="code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.categories.createDialog.fieldCode")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-category-code" placeholder="e.g. MIXED-USE" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.categories.createDialog.fieldName")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-category-name" placeholder="e.g. Mixed Use" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="sortOrder" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.categories.createDialog.fieldSortOrder")}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} data-testid="input-category-sort-order" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <DialogFooter className="pt-4">
                  <Button variant="outline" type="button" onClick={() => setCreateDialogOpen(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" disabled={createForm.formState.isSubmitting} data-testid="button-create-category-submit">
                    {createForm.formState.isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t("admin.categories.createDialog.submitAdd")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
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
                      <Badge variant="outline" className="font-mono">{category.code}</Badge>
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
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("admin.categories.tooltipDelete")}
                            data-testid={`button-delete-category-${category.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("admin.categories.deleteDialog.title")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("admin.categories.deleteDialog.description", { name: category.name })
                                .replace("<1>", "")
                                .replace("</1>", "")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(category)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t("admin.categories.deleteDialog.confirmDelete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Category Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) { setEditTarget(null); editForm.reset(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t("admin.categories.editDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.categories.editDialog.description", { name: editTarget?.name ?? "" })
                .replace("<1>", "")
                .replace("</1>", "")}
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.categories.editDialog.fieldName")}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-category-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="sortOrder" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.categories.editDialog.fieldSortOrder")}</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} data-testid="input-edit-category-sort-order" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="pt-4">
                <Button variant="outline" type="button" onClick={() => { setEditTarget(null); editForm.reset(); }}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={editForm.formState.isSubmitting} data-testid="button-edit-category-submit">
                  {editForm.formState.isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t("admin.categories.editDialog.submitSave")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
