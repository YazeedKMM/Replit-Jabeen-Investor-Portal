import { useState } from "react";
import {
  useGetCities,
  useCreateCity,
  useUpdateCity,
  useDeleteCity,
  getGetCitiesQueryKey,
  City,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("admin.cities.title")}</h1>
          <p className="text-muted-foreground">{t("admin.cities.subtitle")}</p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-city">
              <Plus className="me-2 h-4 w-4" /> {t("admin.cities.addCity")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>{t("admin.cities.createDialog.title")}</DialogTitle>
              <DialogDescription>{t("admin.cities.createDialog.description")}</DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={createForm.control} name="code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.cities.createDialog.fieldCode")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-city-code" placeholder="e.g. RYD" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.cities.createDialog.fieldName")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-city-name" placeholder="e.g. Riyadh" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="shortName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.cities.createDialog.fieldShortName")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-city-short-name" placeholder="e.g. RYD" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="sortOrder" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.cities.createDialog.fieldSortOrder")}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} data-testid="input-city-sort-order" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <DialogFooter className="pt-4">
                  <Button variant="outline" type="button" onClick={() => setCreateDialogOpen(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" disabled={createForm.formState.isSubmitting} data-testid="button-create-city-submit">
                    {createForm.formState.isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t("admin.cities.createDialog.submitAdd")}
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
                      <Badge variant="outline" className="font-mono">{city.code}</Badge>
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
                        data-testid={`button-edit-city-${city.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("admin.cities.tooltipDelete")}
                            data-testid={`button-delete-city-${city.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("admin.cities.deleteDialog.title")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("admin.cities.deleteDialog.description", { name: city.name })
                                .replace("<1>", "")
                                .replace("</1>", "")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(city)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t("admin.cities.deleteDialog.confirmDelete")}
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

      {/* Edit City Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) { setEditTarget(null); editForm.reset(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t("admin.cities.editDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.cities.editDialog.description", { name: editTarget?.name ?? "" })
                .replace("<1>", "")
                .replace("</1>", "")}
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.cities.editDialog.fieldName")}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-city-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="shortName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.cities.editDialog.fieldShortName")}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-city-short-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="sortOrder" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.cities.editDialog.fieldSortOrder")}</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} data-testid="input-edit-city-sort-order" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="pt-4">
                <Button variant="outline" type="button" onClick={() => { setEditTarget(null); editForm.reset(); }}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={editForm.formState.isSubmitting} data-testid="button-edit-city-submit">
                  {editForm.formState.isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t("admin.cities.editDialog.submitSave")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
