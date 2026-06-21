import { useSearch, useLocation } from "wouter";
import { useGetCities } from "@workspace/api-client-react";

/** Global city context derived from the ?city=<CODE> query param. */
export function useCityFilter() {
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const { data: allCities = [] } = useGetCities();

  const cities = allCities.filter((c) => c.enabled);

  const params = new URLSearchParams(search);
  const activeCode = params.get("city") ?? "ALL";
  const activeCityId = cities.find((c) => c.code === activeCode)?.id ?? null;

  const setActiveCode = (code: string) => {
    const next = new URLSearchParams(search);
    if (code === "ALL") next.delete("city");
    else next.set("city", code);
    const qs = next.toString();
    setLocation(`${location}${qs ? `?${qs}` : ""}`);
  };

  return { cities, activeCode, setActiveCode, activeCityId };
}
