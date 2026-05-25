import { useEffect, useState } from "react";
import { LocationProfile } from "../../models";
import { listLocations } from "../../db/repositories/locationRepo";
import { useActiveLocationId } from "./activeLocation";

const REFRESH_EVENT = "locations-updated";

export default function ActiveLocationPicker() {
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [activeId, setActiveId] = useActiveLocationId();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listLocations().then((next) => {
        if (!cancelled) setLocations(next);
      });
    };
    load();
    window.addEventListener(REFRESH_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(REFRESH_EVENT, load);
    };
  }, []);

  if (locations.length === 0) return null;

  return (
    <select
      className="active-location-picker"
      value={activeId}
      onChange={(e) => setActiveId(e.target.value)}
      title="Active location"
    >
      <option value="">All locations</option>
      {locations.map((loc) => (
        <option key={loc.id} value={loc.id}>
          {loc.name}
        </option>
      ))}
    </select>
  );
}
