import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

export function LanguageSwitcher() {
  const { lang, toggle } = useLanguage();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      data-testid="language-switcher"
      className="gap-2"
    >
      <Languages className="h-4 w-4" />
      {lang === "ar" ? "EN" : "العربية"}
    </Button>
  );
}
