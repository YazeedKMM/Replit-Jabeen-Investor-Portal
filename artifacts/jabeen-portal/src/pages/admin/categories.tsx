import { useMemo, useState } from "react";
import type { TFunction } from "i18next";
import {
  useGetProjectCategories,
  useCreateProjectCategory,
  useUpdateProjectCategory,
  useDeleteProjectCategory,
  getGetProjectCategoriesQueryKey,
  type ProjectCategory,
  type ProjectCategoryInput,
  type ProjectCategoryUpdate,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";

// ── Schemas ──────────────────────────────────────────────────────────────────
// sortOrder is fed by a free-text number <Input> (not a Select), so z.coerce is
// correct: the input emits a string and an empty box coerces to 0 via the default.
const makeCreateSchema = (t: TFunction) => z.object({
  code: z.string().min(1, t("validation.codeRequired")).max(40, t("validation.codeMax40")),
  name: z.string().min(1, t("validation.nameRequired")),
  sortOrder: z.coerce.number().int().min(0).default(0),
});
const makeEditSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t("validation.nameRequired")),
  sortOrder: z.coerce.number().int().min(0).default(0),
});
type CreateForm = z.infer<ReturnType<typeof makeCreateSchema>>;
type EditForm = z.infer<ReturnType<typeof makeEditSchema>>;

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CategoriesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectCategory | null>(null);

  const { data: categories, isLoading } = useGetProjectCategories({ query: { queryKey: getGetProjectCategoriesQueryKey() } });
  const createCategory = useCreateProjectCategory();
  const updateCategory = useUpdateProjectCategory();
  const deleteCategory = useDeleteProjectCategory();

  const createSchema = useMemo(() => makeCreateSchema(t), [t]);
  const editSchema = useMemo(() => makeEditSchema(t), [t]);

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { code: "", name: "", sortOrder: 0 },
  });
  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: "", sortOrder: 0 },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetProjectCategoriesQueryKey() });

  const onCreate = async (data: CreateForm) => {
    try {
      await createCategory.mutateAsync({ data: data as ProjectCategoryInput });
      invalidate();
      toast({ title: t("admin.categories.toast.created"), description: t("admin.categories.toast.createdDesc", { name: data.name }) });
      createForm.reset();
      setCreateOpen(false);
    } catch (error: unknown) {
      toast({ title: t("admin.categories.toast.createFailed"), description: apiErrorMessage(error, t("common.somethingWrong")), variant: "destructive" });
    }
  };

  const onEdit = async (data: EditForm) => {
    if (!editTarget) return;
    try {
      await updateCategory.mutateAsync({ categoryId: editTarget.id, data: data as ProjectCategoryUpdate });
      invalidate();
      toast({ title: t("admin.categories.toast.updated"), description: t("admin.categories.toast.updatedDesc", { name: data.name }) });
      setEditTarget(null);
      editForm.reset();
    } catch (error: unknown) {
      toast({ title: t("admin.categories.toast.updateFailed"), description: apiErrorMessage(error, t("common.somethingWrong")), variant: "destructive" });
    }
  };

  const onToggle = async (category: ProjectCategory) => {
    try {
      await updateCategory.mutateAsync({ categoryId: category.id, data: { enabled: !category.enabled } });
      invalidate();
      toast({ title: t("admin.categories.toast.updated"), description: t("admin.categories.toast.updatedDesc", { name: category.name }) });
    } catch (error: unknown) {
      toast({ title: t("admin.categories.toast.updateFailed"), description: apiErrorMessage(error, t("common.somethingWrong")), variant: "destructive" });
    }
  };

  const onDelete = async (category: ProjectCategory) => {
    try {
      await deleteCategory.mutateAsync({ categoryId: category.id });
      invalidate();
      toast({ title: t("admin.categories.toast.deleted"), description: t("admin.categories.toast.deletedDesc", { name: category.name }) });
    } catch (error: unknown) {
      // In-use guard: the server returns 4xx when the category is used by projects.
      toast({ title: t("admin.categories.toast.cannotDelete"), description: apiErrorMessage(error, t("admin.categories.toast.cannotDeleteDesc")), variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const openEdit = (category: ProjectCategory) => {
    setEditTarget(category);
    editForm.reset({ name: category.name, sortOrder: category.sortOrder });
  };

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">{t("admin.categories.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.categories.subtitle")}</p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="me-2 h-4 w-4" aria-hidden="true" /> {t("admin.categories.addCategory")}
        </Button>
      </div>

      {/* ── Table ── */}
      <section className="rounded-xl border border-card-border bg-card">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="ps-5">{t("admin.categories.colCode")}</TableHead>
              <TableHead>{t("admin.categories.colName")}</TableHead>
              <TableHead>{t("admin.categories.colEnabled")}</TableHead>
              <TableHead className="text-end">{t("admin.categories.colSortOrder")}</TableHead>
              <TableHead className="pe-5 text-end">{t("admin.categories.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [0, 1, 2, 3].map((i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell className="ps-5 py-3"><Skeleton className="h-5 w-24 rounded-md" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-9 rounded-full" /></TableCell>
                  <TableCell className="text-end"><Skeleton className="ms-auto h-4 w-6" /></TableCell>
                  <TableCell className="pe-5"><Skeleton className="ms-auto h-8 w-20" /></TableCell>
                </TableRow>
              ))
            ) : !categories?.length ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Tag className="h-10 w-10 opacity-20" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{t("admin.categories.noCategories")}</p>
                      <p className="text-sm">{t("admin.categories.noCategoriesDesc")}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                      <Plus className="me-1.5 h-3.5 w-3.5" aria-hidden="true" /> {t("admin.categories.addCategory")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id} className="even:bg-muted/40 hover:bg-muted/60">
                  <TableCell className="ps-5 py-3">
                    <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground" dir="ltr">
                      {category.code}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{category.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={category.enabled}
                      onCheckedChange={() => onToggle(category)}
                      aria-label={t("admin.categories.colEnabled")}
                      data-testid={`switch-category-enabled-${category.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">{category.sortOrder}</TableCell>
                  <TableCell className="pe-5">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => openEdit(category)}
                        title={t("admin.categories.tooltipEdit")}
                        aria-label={t("admin.categories.tooltipEdit")}
                        data-testid={`button-edit-category-${category.id}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(category)}
                        title={t("admin.categories.tooltipDelete")}
                        aria-label={t("admin.categories.tooltipDelete")}
                        data-testid={`button-delete-category-${category.id}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) createForm.reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.categories.createDialog.title")}</DialogTitle>
            <DialogDescription>{t("admin.categories.createDialog.description")}</DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form id="create-category-form" onSubmit={createForm.handleSubmit(onCreate)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField control={createForm.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.categories.createDialog.fieldCode")}</FormLabel>
                  <FormControl><Input className="font-mono" dir="ltr" placeholder="MIXED-USE" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.categories.createDialog.fieldName")}</FormLabel>
                  <FormControl><Input placeholder="Mixed Use" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createForm.control} name="sortOrder" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.categories.createDialog.fieldSortOrder")}</FormLabel>
                  <FormControl><Input type="number" inputMode="numeric" min={0} step={1} className="tabular-nums" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </form>
          </Form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" form="create-category-form" disabled={createForm.formState.isSubmitting}>
              {createForm.formState.isSubmitting && <Spinner aria-hidden="true" />}
              {t("admin.categories.createDialog.submitAdd")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) { setEditTarget(null); editForm.reset(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.categories.editDialog.title")}</DialogTitle>
            <DialogDescription>{stripTags(t("admin.categories.editDialog.description", { name: editTarget?.name ?? "" }))}</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form id="edit-category-form" onSubmit={editForm.handleSubmit(onEdit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.categories.editDialog.fieldName")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="sortOrder" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.categories.editDialog.fieldSortOrder")}</FormLabel>
                  <FormControl><Input type="number" inputMode="numeric" min={0} step={1} className="tabular-nums" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </form>
          </Form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setEditTarget(null); editForm.reset(); }}>{t("common.cancel")}</Button>
            <Button type="submit" form="edit-category-form" disabled={editForm.formState.isSubmitting}>
              {editForm.formState.isSubmitting && <Spinner aria-hidden="true" />}
              {t("admin.categories.editDialog.submitSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.categories.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{stripTags(t("admin.categories.deleteDialog.description", { name: deleteTarget?.name ?? "" }))}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={(e) => { e.preventDefault(); if (deleteTarget) onDelete(deleteTarget); }}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending && <Spinner aria-hidden="true" />}
              {t("admin.categories.deleteDialog.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Strip the i18n emphasis markers (`<1>…</1>`) that wrap {{name}} in some copy. */
function stripTags(s: string): string {
  return s.replace(/<\/?1>/g, "");
}
