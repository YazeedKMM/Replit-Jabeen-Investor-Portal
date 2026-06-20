import { Route, Switch, Redirect } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { ProtectedRoute } from "@/components/protected-route";

// Existing Imports
import LoginPage from "@/pages/auth/login";
import MfaSetupPage from "@/pages/auth/mfa-setup";
import MyProjectsPage from "@/pages/investor/my-projects";
import DashboardPage from "@/pages/dashboard/dashboard";
import ProfilePage from "@/pages/profile/profile";
import SettingsPage from "@/pages/settings/settings";
import AuditLogPage from "@/pages/audit/audit-log";
import UsersPage from "@/pages/admin/users";
import TemplatesPage from "@/pages/admin/templates";
import TemplateBuilderPage from "@/pages/admin/template-builder";
import ProjectWorkspacePage from "@/pages/projects/project-workspace";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/use-auth";

function RoleRedirect() {
  const { user, isLoading, isAuthenticated } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated || !user) return <Redirect to="/login" />;
  if (user.role === "investor") return <Redirect to="/my-projects" />;
  return <Redirect to="/dashboard" />;
}

export function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/mfa/setup" component={MfaSetupPage} />
      <Route path="/" component={RoleRedirect} />
      
      {/* Investor Route */}
      <Route path="/my-projects">
        <ProtectedRoute allowedRoles={["investor"]}>
          <AppLayout><MyProjectsPage /></AppLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Management Routes */}
      <Route path="/dashboard">
        <ProtectedRoute allowedRoles={["project-manager", "top-management", "administrator"]}>
          <AppLayout><DashboardPage /></AppLayout>
        </ProtectedRoute>
      </Route>

      {/* Admin / Manager Routes */}
      <Route path="/templates">
        <ProtectedRoute allowedRoles={["project-manager", "top-management", "administrator"]}>
          <AppLayout><TemplatesPage /></AppLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/templates/:id">
        <ProtectedRoute allowedRoles={["project-manager", "top-management", "administrator"]}>
          <AppLayout><TemplateBuilderPage /></AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/users">
        <ProtectedRoute allowedRoles={["project-manager", "top-management", "administrator"]}>
          <AppLayout><UsersPage /></AppLayout>
        </ProtectedRoute>
      </Route>

      {/* Admin Only Routes */}
      <Route path="/settings">
        <ProtectedRoute allowedRoles={["administrator"]}>
          <AppLayout><SettingsPage /></AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/audit-log">
        <ProtectedRoute allowedRoles={["administrator"]}>
          <AppLayout><AuditLogPage /></AppLayout>
        </ProtectedRoute>
      </Route>

      {/* Universal Protected Routes */}
      <Route path="/profile">
        <ProtectedRoute>
          <AppLayout><ProfilePage /></AppLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Project Workspace — all authenticated roles */}
      <Route path="/projects/:id">
        <ProtectedRoute>
          <AppLayout><ProjectWorkspacePage /></AppLayout>
        </ProtectedRoute>
      </Route>

      <Route>
        <AppLayout><NotFound /></AppLayout>
      </Route>
    </Switch>
  );
}
