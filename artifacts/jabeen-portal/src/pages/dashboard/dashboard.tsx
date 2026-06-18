import { useState } from "react";
import { useGetDashboard, useListProjects } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Search, Download, AlertTriangle, CheckCircle2, Clock, Activity } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [search, setSearch] = useState("");
  
  const { data: stats, isLoading: statsLoading } = useGetDashboard();
  const { data: projects, isLoading: projectsLoading } = useListProjects({ search });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on-track': return 'bg-emerald-500/15 text-emerald-700 border-emerald-200';
      case 'delayed': return 'bg-amber-500/15 text-amber-700 border-amber-200';
      case 'stalled': return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'complete': return 'bg-blue-500/15 text-blue-700 border-blue-200';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const handleExport = () => {
    window.location.href = "/api/projects/export";
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Portfolio Dashboard</h1>
          <p className="text-muted-foreground">Overview of all industrial projects</p>
        </div>
        <Button onClick={handleExport} variant="outline" className="shrink-0 font-medium">
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Projects</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{statsLoading ? "-" : stats?.total}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{statsLoading ? "-" : stats?.inProgress}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Needs Attention</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{statsLoading ? "-" : stats?.needsAttention}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{statsLoading ? "-" : stats?.complete}</div>
          </CardContent>
        </Card>
      </div>

      {/* Projects Table */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-4 border-b bg-muted/10">
          <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
            <CardTitle className="text-lg">Project Directory</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search projects, investors..."
                className="pl-8 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[300px]">Project Name</TableHead>
                <TableHead>Investor</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading projects...</TableCell>
                </TableRow>
              ) : !projects?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No projects found.</TableCell>
                </TableRow>
              ) : (
                projects.map((project) => (
                  <TableRow key={project.id} className="hover:bg-muted/30 transition-colors group">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {project.attentionFlag && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                        <Link href={`/projects/${project.id}`} className="hover:underline hover:text-primary line-clamp-1 truncate block">
                          {project.name}
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{project.agreementNumber}</div>
                    </TableCell>
                    <TableCell>
                      <div className="truncate max-w-[200px]" title={project.investor?.companyName}>
                        {project.investor?.companyName || "-"}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{project.sector}</TableCell>
                    <TableCell>
                      <span className="text-sm truncate max-w-[150px] inline-block" title={project.currentStage?.name}>
                        {project.currentStage?.name || "Initializing"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("uppercase tracking-wider text-[10px] font-bold px-2 py-0.5", getStatusColor(project.derivedStatus))}>
                        {project.derivedStatus.replace('-', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {project.constructionPct}%
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
