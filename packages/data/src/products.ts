import type { Product } from "@mh/shared";

export const products: Product[] = [
  {
    id: "mini-kid-cake",
    name: "儿童小蛋糕",
    type: "cake",
    priceCny: 68,
    tags: ["family", "child", "dessert"],
    deliveryWindows: ["17:25", "17:40", "18:20"]
  },
  {
    id: "table-flowers",
    name: "餐桌小花束",
    type: "flowers",
    priceCny: 99,
    tags: ["friends", "photo", "surprise"],
    deliveryWindows: ["18:20", "18:50"]
  },
  {
    id: "clay-kit",
    name: "儿童陶艺纪念小礼物",
    type: "gift",
    priceCny: 39,
    tags: ["family", "child", "gift"],
    deliveryWindows: ["17:25", "18:00"]
  }
];
