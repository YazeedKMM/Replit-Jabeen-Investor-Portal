import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import {
  Building2,
  LayoutDashboard,
  FileSpreadsheet,
  Users,
  Settings,
  History,
  LogOut,
  User as UserIcon,
  MapPin,
  Tags,
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
  const { dir } = useLanguage();

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
      title: "Cities",
      href: "/cities",
      icon: MapPin,
      show: role === "administrator",
    },
    {
      title: "Project Categories",
      href: "/categories",
      icon: Tags,
      show: role === "administrator",
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
    <Sidebar variant="sidebar" collapsible="icon" side={dir === "rtl" ? "right" : "left"} className="bg-sidebar">
      <SidebarHeader className="p-4 flex items-center justify-center">
        <div className="flex items-center justify-center">
          <img
            src="/jabeen-logo.svg"
            alt="JABEEN"
            className="h-8 w-auto brightness-0 invert group-data-[collapsible=icon]:hidden"
          />
          <img
            src="/jabeen-logo.svg"
            alt="JABEEN"
            className="h-7 w-7 object-left brightness-0 invert hidden group-data-[collapsible=icon]:block"
            style={{ objectPosition: 'left center', objectFit: 'cover', width: '28px' }}
          />
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
