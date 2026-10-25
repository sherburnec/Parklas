// The last-updated date for a city folder (task M5-2). build:data writes it to public/data/<folder>/metadata.json
// and the loader reads it. It is the day of the build, in the city's time zone.
export interface CityMetadata {
  city_id: string;
  /** YYYY-MM-DD in the city's time zone. */
  last_updated: string;
}

export function buildMetadata(cityId: string, instant: Date, timeZone: string): CityMetadata {
  // en-CA formats as YYYY-MM-DD.
  const last_updated = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  return { city_id: cityId, last_updated };
}
