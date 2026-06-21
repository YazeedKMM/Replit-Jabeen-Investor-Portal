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

const createCategorySchema = z.object({
  code: z.string().min(1, "Code is required").max(40, "Code max 40 chars"),
  name: z.string().min(1, "Name is required"),
  sortOrder: z.coerce.number().default(0),
});

const editCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  sortOrder: z.coerce.number().default(0),
});

type CreateCategoryFormValues = z.infer<typeof createCategorySchema>;
type EditCategoryFormValues = z.infer<typeof editCategorySchema>;

export default function CategoriesPage() {
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
      toast({ title: "Category created", description: `${data.name} has been added.` });
      createForm.reset();
      setCreateDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Failed to create category",
        description: error.data?.message || error.data?.error || "An error occurred",
        variant: "destructive",
      });
    }
  };

  const onEditSubmit = async (data: EditCategoryFormValues) => {
    if (!editTarget) return;
    try {
      await updateCategory.mutateAsync({ categoryId: editTarget.id, data });
      invalidateCategories();
      toast({ title: "Category updated", description: `${data.name} has been updated.` });
      setEditTarget(null);
      editForm.reset();
    } catch (error: any) {
      toast({
        title: "Failed to update category",
        description: error.data?.message || error.data?.error || "An error occurred",
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
        title: "Category updated",
        description: `${category.name} is now ${nextEnabled ? "enabled" : "disabled"}.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to update category",
        description: error.data?.message || error.data?.error || "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (category: ProjectCategory) => {
    try {
      await deleteCategory.mutateAsync({ categoryId: category.id });
      invalidateCategories();
      toast({ title: "Category deleted", description: `${category.name} has been removed.` });
    } catch (error: any) {
      toast({
        title: "Cannot delete category",
        description: error.data?.message || error.data?.error || "Cannot delete a category in use",
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Project Categories</h1>
          <p className="text-muted-foreground">Manage project category types.</p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-category">
              <Plus className="mr-2 h-4 w-4" /> Add Category
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Add Category</DialogTitle>
              <DialogDescription>Create a new project category.</DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={createForm.control} name="code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-category-code" placeholder="e.g. MIXED-USE" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-category-name" placeholder="e.g. Mixed Use" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="sortOrder" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} data-testid="input-category-sort-order" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <DialogFooter className="pt-4">
                  <Button variant="outline" type="button" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createForm.formState.isSubmitting} data-testid="button-create-category-submit">
                    {createForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Category
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
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Sort Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    No categories found.
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
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(category)}
                        title="Edit Category"
                        data-testid={`button-edit-category-${category.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete Category"
                            data-testid={`button-delete-category-${category.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Category</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete <strong>{category.name}</strong>? This cannot be undone.
                              The operation will fail if this category is in use by existing projects.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(category)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
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
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update details for <strong>{editTarget?.name}</strong>. The code cannot be changed.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-category-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="sortOrder" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} data-testid="input-edit-category-sort-order" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="pt-4">
                <Button variant="outline" type="button" onClick={() => { setEditTarget(null); editForm.reset(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editForm.formState.isSubmitting} data-testid="button-edit-category-submit">
                  {editForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
