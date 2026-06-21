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

const createCitySchema = z.object({
  code: z.string().min(1, "Code is required").max(20, "Code max 20 chars"),
  name: z.string().min(1, "Name is required"),
  shortName: z.string().min(1, "Short name is required"),
  sortOrder: z.coerce.number().default(0),
});

const editCitySchema = z.object({
  name: z.string().min(1, "Name is required"),
  shortName: z.string().min(1, "Short name is required"),
  sortOrder: z.coerce.number().default(0),
});

type CreateCityFormValues = z.infer<typeof createCitySchema>;
type EditCityFormValues = z.infer<typeof editCitySchema>;

export default function CitiesPage() {
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
      toast({ title: "City created", description: `${data.name} has been added.` });
      createForm.reset();
      setCreateDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Failed to create city",
        description: error.data?.message || error.data?.error || "An error occurred",
        variant: "destructive",
      });
    }
  };

  const onEditSubmit = async (data: EditCityFormValues) => {
    if (!editTarget) return;
    try {
      await updateCity.mutateAsync({ cityId: editTarget.id, data });
      invalidateCities();
      toast({ title: "City updated", description: `${data.name} has been updated.` });
      setEditTarget(null);
      editForm.reset();
    } catch (error: any) {
      toast({
        title: "Failed to update city",
        description: error.data?.message || error.data?.error || "An error occurred",
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
        title: "City updated",
        description: `${city.name} is now ${nextEnabled ? "enabled" : "disabled"}.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to update city",
        description: error.data?.message || error.data?.error || "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (city: City) => {
    try {
      await deleteCity.mutateAsync({ cityId: city.id });
      invalidateCities();
      toast({ title: "City deleted", description: `${city.name} has been removed.` });
    } catch (error: any) {
      toast({
        title: "Cannot delete city",
        description: error.data?.message || error.data?.error || "Cannot delete a city with active projects",
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Cities</h1>
          <p className="text-muted-foreground">Manage portal cities.</p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-city">
              <Plus className="mr-2 h-4 w-4" /> Add City
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Add City</DialogTitle>
              <DialogDescription>Create a new city for the portal.</DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={createForm.control} name="code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-city-code" placeholder="e.g. RYD" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-city-name" placeholder="e.g. Riyadh" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="shortName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-city-short-name" placeholder="e.g. RYD" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="sortOrder" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} data-testid="input-city-sort-order" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <DialogFooter className="pt-4">
                  <Button variant="outline" type="button" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createForm.formState.isSubmitting} data-testid="button-create-city-submit">
                    {createForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add City
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
                <TableHead>Short Name</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Sort Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    No cities found.
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
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(city)}
                        title="Edit City"
                        data-testid={`button-edit-city-${city.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete City"
                            data-testid={`button-delete-city-${city.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete City</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete <strong>{city.name}</strong>? This cannot be undone.
                              The operation will fail if this city has active projects.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(city)}
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

      {/* Edit City Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) { setEditTarget(null); editForm.reset(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit City</DialogTitle>
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
                      <Input {...field} data-testid="input-edit-city-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="shortName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-city-short-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="sortOrder" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} data-testid="input-edit-city-sort-order" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="pt-4">
                <Button variant="outline" type="button" onClick={() => { setEditTarget(null); editForm.reset(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editForm.formState.isSubmitting} data-testid="button-edit-city-submit">
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
