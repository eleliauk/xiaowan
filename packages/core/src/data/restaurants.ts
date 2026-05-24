import type { Restaurant } from "@mh/shared";
import { homeLocation } from "./userProfiles";

const near = (label: string, latDelta: number, lngDelta: number) => ({
  label,
  lat: homeLocation.lat + latDelta,
  lng: homeLocation.lng + lngDelta
});

export const restaurants: Restaurant[] = [
  {
    id: "qinghe-bistro",
    name: "青禾轻食 Bistro",
    address: "望京花园东路 18 号",
    location: near("青禾轻食 Bistro", 0.007, 0.005),
    tags: ["healthy", "light", "family", "low_fat", "child_friendly"],
    averagePriceCny: 92,
    atmosphere: ["quiet", "clean", "comfortable"],
    availability: { "17:30": [2, 3, 4], "18:00": [2, 3], "18:30": [2, 3, 4] },
    queueMinutes: { "17:30": 0, "18:00": 8, "18:30": 5 }
  },
  {
    id: "neon-table",
    name: "霓虹餐桌",
    address: "望京文化中心 1 层",
    location: near("霓虹餐桌", 0.013, 0.007),
    tags: ["friends", "atmosphere", "fusion", "photo"],
    averagePriceCny: 138,
    atmosphere: ["lively", "photo", "date_friendly"],
    availability: { "18:00": [2], "18:30": [2, 4], "19:00": [2, 4] },
    queueMinutes: { "18:00": 20, "18:30": 8, "19:00": 6 }
  },
  {
    id: "lane-noodle",
    name: "巷口小面与茶",
    address: "阜通东大街 21 号",
    location: near("巷口小面与茶", 0.015, 0.004),
    tags: ["friends", "snacks", "casual", "walkable"],
    averagePriceCny: 78,
    atmosphere: ["casual", "busy"],
    availability: { "18:00": [2, 4], "18:30": [2, 4] },
    queueMinutes: { "18:00": 12, "18:30": 10 }
  }
];
