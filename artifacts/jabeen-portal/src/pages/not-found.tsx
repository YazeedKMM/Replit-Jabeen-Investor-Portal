import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex items-center mb-2 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">{t("notFound.heading")}</h1>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            {t("notFound.message")}
          </p>

          <Button asChild className="mt-6">
            <Link href="/">{t("notFound.backHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
