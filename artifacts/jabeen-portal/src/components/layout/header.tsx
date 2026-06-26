import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { CitySwitcher } from "@/components/city-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationPanel } from "./notification-panel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGetUnreadCount, getGetUnreadCountQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const { data: unreadData } = useGetUnreadCount({
    query: {
      enabled: !!user,
      refetchInterval: 30000,
      queryKey: getGetUnreadCountQueryKey(),
    }
  });

  const unreadCount = unreadData?.count || 0;

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-4 border-b bg-background px-4 md:px-6 shadow-sm">
      <SidebarTrigger className="-ms-2" />
      <CitySwitcher />
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <LanguageSwitcher />
        <div className="flex flex-col items-end hidden md:flex">
          <span className="text-sm font-medium leading-none">{user?.fullName}</span>
          <span className="text-xs text-muted-foreground">{user?.role ? t(`roles.${user.role}`) : ""}</span>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 end-1.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground ring-2 ring-background">
                  <span className="sr-only">{t("notifications.newNotifications")}</span>
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 sm:w-96">
            <NotificationPanel />
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
