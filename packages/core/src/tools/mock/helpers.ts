import type { Location } from "@mh/core/shared";

export function stableId(prefix: string, parts: Array<string | number>) {
  return `${prefix}-${parts.join("-").replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, "-")}`;
}

export function distanceKm(a: Location, b: Location) {
  const latKm = (a.lat - b.lat) * 111;
  const lngKm = (a.lng - b.lng) * 85;
  return Math.round(Math.sqrt(latKm * latKm + lngKm * lngKm) * 10) / 10;
}

export function includesAny(values: string[], accepted: string[]) {
  return values.some((value) => accepted.includes(value));
}
