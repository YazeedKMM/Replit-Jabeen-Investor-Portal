import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCityFilter } from "@/hooks/use-city-filter";

export function CitySwitcher() {
  const { cities, activeCode, setActiveCode } = useCityFilter();
  if (cities.length <= 1) return null;
  return (
    <Select value={activeCode} onValueChange={setActiveCode}>
      <SelectTrigger className="w-[180px]" data-testid="city-switcher">
        <SelectValue placeholder="All cities" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">All cities</SelectItem>
        {cities.map((c) => (
          <SelectItem key={c.id} value={c.code}>{c.shortName}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
