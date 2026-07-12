import { useState } from "react";
import { useListAuditLog } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fmtDateTime } from "@/lib/format";

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useListAuditLog({ page, limit });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("audit.title")}</h1>
        <p className="text-muted-foreground">{t("audit.subtitle")}</p>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("audit.eventHistory")}</h2>
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-[180px]">{t("audit.colTimestamp")}</TableHead>
              <TableHead>{t("audit.colActor")}</TableHead>
              <TableHead>{t("audit.colAction")}</TableHead>
              <TableHead>{t("audit.colTarget")}</TableHead>
              <TableHead>{t("audit.colDetails")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : !data?.entries?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {t("audit.empty")}
                </TableCell>
              </TableRow>
            ) : (
              data.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fmtDateTime(entry.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {entry.actorName || t("audit.actorFallback", { id: entry.actorId })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{entry.action}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.targetType} {entry.targetId && `#${entry.targetId}`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.detail || "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="pt-4 flex items-center justify-between border-t border-border">
          <div className="text-sm text-muted-foreground">
            {t("audit.totalRecords", { count: data?.total || 0 })}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              <ChevronLeft className="h-4 w-4 me-1 rtl-flip" /> {t("audit.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={!data || page * limit >= data.total || isLoading}
            >
              {t("audit.next")} <ChevronRight className="h-4 w-4 ms-1 rtl-flip" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
