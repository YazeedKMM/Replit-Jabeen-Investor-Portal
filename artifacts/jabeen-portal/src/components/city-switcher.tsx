import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCityFilter } from "@/hooks/use-city-filter";

export function CitySwitcher() {
  const { cities, activeCode, setActiveCode } = useCityFilter();
  const { t } = useTranslation();
  if (cities.length <= 1) return null;
  return (
    <Select value={activeCode} onValueChange={setActiveCode}>
      <SelectTrigger className="w-[180px]" data-testid="city-switcher">
        <SelectValue placeholder={t("common.allCities")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">{t("common.allCities")}</SelectItem>
        {cities.map((c) => (
          <SelectItem key={c.id} value={c.code}>{c.shortName}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
