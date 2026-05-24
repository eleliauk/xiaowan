import type { Location, PartyMember } from "@mh/shared";

export const homeLocation: Location = {
  label: "小明家",
  address: "望京 SOHO 附近",
  lat: 39.996,
  lng: 116.48
};

export const familyMembers: PartyMember[] = [
  { role: "self", label: "小明", notes: ["发起人"] },
  { role: "spouse", label: "老婆", notes: ["最近在减肥", "偏好清淡"] },
  { role: "child", label: "孩子", age: 5, notes: ["适合亲子活动"] }
];

export const friendMembers: PartyMember[] = [
  { role: "friend", label: "男生 A", notes: ["朋友"] },
  { role: "friend", label: "男生 B", notes: ["朋友"] },
  { role: "friend", label: "女生 A", notes: ["朋友"] },
  { role: "friend", label: "女生 B", notes: ["朋友"] }
];

export const contacts = {
  spouse: "老婆",
  friend: "小张"
};
