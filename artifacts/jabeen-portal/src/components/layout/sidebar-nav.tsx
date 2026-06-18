import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  Building2, 
  LayoutDashboard, 
  FileSpreadsheet, 
  Users, 
  Settings, 
  History,
  LogOut,
  User as UserIcon
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export function SidebarNav() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const role = user.role;

  const navItems = [
    {
      title: "My Projects",
      href: "/my-projects",
      icon: Building2,
      show: role === "investor",
    },
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      show: role !== "investor",
    },
    {
      title: "Templates",
      href: "/templates",
      icon: FileSpreadsheet,
      show: ["project-manager", "top-management", "administrator"].includes(role),
    },
    {
      title: "Users",
      href: "/users",
      icon: Users,
      show: ["project-manager", "top-management", "administrator"].includes(role),
    },
    {
      title: "Audit Log",
      href: "/audit-log",
      icon: History,
      show: role === "administrator",
    },
    {
      title: "Settings",
      href: "/settings",
      icon: Settings,
      show: role === "administrator",
    },
  ];

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="bg-sidebar">
      <SidebarHeader className="p-4 flex items-center justify-center">
        <div className="flex items-center gap-2 font-bold text-lg text-sidebar-primary-foreground tracking-tight">
          <div className="h-8 w-8 bg-sidebar-primary rounded flex items-center justify-center text-white">
            J
          </div>
          <span className="group-data-[collapsible=icon]:hidden">JABEEN</span>
        </div>
      </SidebarHeader>
      <Separator className="opacity-10" />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.filter(item => item.show).map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location.startsWith(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href} className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
             <SidebarMenuButton asChild isActive={location === "/profile"} tooltip="Profile">
                <Link href="/profile" className="flex items-center gap-3">
                  <UserIcon className="h-4 w-4" />
                  <span>Profile</span>
                </Link>
             </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => logout()} tooltip="Sign out" className="text-destructive hover:text-destructive hover:bg-destructive/10">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
