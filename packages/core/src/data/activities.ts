import type { Activity } from "@mh/core/shared";
import { homeLocation } from "./userProfiles";

const near = (label: string, latDelta: number, lngDelta: number) => ({
  label,
  lat: homeLocation.lat + latDelta,
  lng: homeLocation.lng + lngDelta
});

export const activities: Activity[] = [
  {
    id: "kid-pottery",
    name: "小手作陶艺亲子馆",
    type: "workshop",
    address: "望京花园街 12 号",
    location: near("小手作陶艺亲子馆", 0.006, 0.004),
    tags: ["family", "child_friendly", "indoor", "low_queue", "hands_on"],
    priceCny: 188,
    durationMinutes: 90,
    openHours: { start: "10:00", end: "20:00" },
    capacity: { "14:30": 8, "15:00": 6 }
  },
  {
    id: "green-park-walk",
    name: "麒麟社绿地散步线",
    type: "free_walk",
    address: "阜通西大街绿地",
    location: near("麒麟社绿地散步线", 0.009, 0.002),
    tags: ["family", "free_walk", "low_cost", "easy"],
    priceCny: 0,
    durationMinutes: 35,
    openHours: { start: "00:00", end: "23:59" },
    capacity: { "16:20": 99 }
  },
  {
    id: "city-photo-exhibit",
    name: "城市影像展",
    type: "exhibition",
    address: "望京文化中心 3 层",
    location: near("城市影像展", 0.012, 0.006),
    tags: ["friends", "social", "photo", "indoor", "fresh"],
    priceCny: 68,
    durationMinutes: 100,
    openHours: { start: "10:00", end: "19:30" },
    capacity: { "14:30": 12, "15:00": 10 }
  },
  {
    id: "wangjing-citywalk",
    name: "望京小吃街 Citywalk",
    type: "citywalk",
    address: "阜通东大街小吃街",
    location: near("望京小吃街 Citywalk", 0.015, 0.004),
    tags: ["friends", "citywalk", "snacks", "social"],
    priceCny: 40,
    durationMinutes: 55,
    openHours: { start: "12:00", end: "22:00" },
    capacity: { "16:30": 99, "17:00": 99 }
  },
  {
    id: "board-game-cafe",
    name: "慢半拍桌游空间",
    type: "tabletop",
    address: "望京街 8 号",
    location: near("慢半拍桌游空间", 0.004, 0.008),
    tags: ["friends", "tabletop", "indoor", "social"],
    priceCny: 78,
    durationMinutes: 120,
    openHours: { start: "13:00", end: "23:00" },
    capacity: { "14:30": 6, "15:00": 8 }
  }
];
