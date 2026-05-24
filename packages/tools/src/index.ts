import { bookActivity, checkActivityAvailability } from "./mock/activityTools";
import { scheduleDelivery } from "./mock/deliveryTools";
import {
  estimateTravelTime,
  getUserProfile,
  searchAddOnProducts,
  searchNearbyActivities,
  searchRestaurants,
  sendMessage
} from "./mock/discoveryTools";
import {
  checkQueueTime,
  checkRestaurantAvailability,
  reserveRestaurant
} from "./mock/restaurantTools";
import { ToolRegistry } from "./registry";

export * from "./errors";
export * from "./langchainTools";
export * from "./registry";

export function createDefaultToolRegistry() {
  return new ToolRegistry()
    .register(getUserProfile)
    .register(estimateTravelTime)
    .register(searchNearbyActivities)
    .register(searchRestaurants)
    .register(searchAddOnProducts)
    .register(checkActivityAvailability)
    .register(checkRestaurantAvailability)
    .register(checkQueueTime)
    .register(bookActivity)
    .register(reserveRestaurant)
    .register(scheduleDelivery)
    .register(sendMessage);
}
