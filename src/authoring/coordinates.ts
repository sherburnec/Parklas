// Task M2-7.2: text for the last point clicked on the authoring map.
export interface ClickPoint {
  lng: number;
  lat: number;
}

const DECIMALS = 6;

function fixed(value: number): string {
  const text = value.toFixed(DECIMALS);
  return Number(text) === 0 ? (0).toFixed(DECIMALS) : text;
}

/** "lng, lat" to 6 decimals, the order GeoJSON and QGIS-exported coordinates use. */
export function formatCoordinates({ lng, lat }: ClickPoint): string {
  return `${fixed(lng)}, ${fixed(lat)}`;
}
