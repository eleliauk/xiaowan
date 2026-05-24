import { activities, contacts, familyMembers, friendMembers, homeLocation, products, restaurants } from "@mh/data";
import { ExecutionReceiptSchema, LocationSchema, type ExecutionReceipt } from "@mh/shared";
import { z } from "zod";
import { createAppTool } from "../registry";
import { distanceKm, includesAny } from "./helpers";

export const getUserProfile = createAppTool({
  name: "getUserProfile",
  description: "Get mock user profile, home, contacts, and known party presets.",
  inputSchema: z.object({ userId: z.string().default("xiaoming") }),
  outputSchema: z.object({
    home: LocationSchema,
    familyMembers: z.array(z.unknown()),
    friendMembers: z.array(z.unknown()),
    contacts: z.record(z.string())
  }),
  handler: () => ({
    home: homeLocation,
    familyMembers,
    friendMembers,
    contacts
  })
});

export const estimateTravelTime = createAppTool({
  name: "estimateTravelTime",
  description: "Estimate travel time between two local points.",
  inputSchema: z.object({
    from: LocationSchema,
    to: LocationSchema
  }),
  outputSchema: z.object({
    distanceKm: z.number(),
    minutes: z.number()
  }),
  handler: ({ from, to }) => {
    const km = distanceKm(from, to);
    return {
      distanceKm: km,
      minutes: Math.max(8, Math.round(km * 9 + 6))
    };
  }
});

export const searchNearbyActivities = createAppTool({
  name: "searchNearbyActivities",
  description: "Search local activities by scenario tags.",
  inputSchema: z.object({
    scenario: z.enum(["family", "friends"]),
    tags: z.array(z.string()).default([]),
    radiusKm: z.number().default(5)
  }),
  outputSchema: z.array(z.unknown()),
  handler: ({ scenario, tags, radiusKm }) => {
    const effectiveTags = tags ?? [];
    const effectiveRadiusKm = radiusKm ?? 5;
    return activities
      .filter((activity) => activity.tags.includes(scenario))
      .filter((activity) => {
        const matches = effectiveTags.length === 0 || includesAny(activity.tags, effectiveTags);
        return matches && distanceKm(homeLocation, activity.location) <= effectiveRadiusKm;
      })
      .slice(0, 5);
  }
});

export const searchRestaurants = createAppTool({
  name: "searchRestaurants",
  description: "Search restaurants by scenario, party size, and food constraints.",
  inputSchema: z.object({
    scenario: z.enum(["family", "friends"]),
    partySize: z.number(),
    preferences: z.array(z.string()).default([]),
    radiusKm: z.number().default(5)
  }),
  outputSchema: z.array(z.unknown()),
  handler: ({ scenario, preferences, radiusKm }) => {
    const effectivePreferences = preferences ?? [];
    const effectiveRadiusKm = radiusKm ?? 5;
    return restaurants
      .filter((restaurant) => restaurant.tags.includes(scenario))
      .filter((restaurant) => distanceKm(homeLocation, restaurant.location) <= effectiveRadiusKm)
      .sort((a, b) => {
        const aFit = effectivePreferences.filter((preference) => a.tags.includes(preference)).length;
        const bFit = effectivePreferences.filter((preference) => b.tags.includes(preference)).length;
        return bFit - aFit;
      });
  }
});

export const searchAddOnProducts = createAppTool({
  name: "searchAddOnProducts",
  description: "Search optional delivery add-on products for the outing scenario.",
  inputSchema: z.object({
    scenario: z.enum(["family", "friends"]),
    arrivalTime: z.string()
  }),
  outputSchema: z.array(z.unknown()),
  handler: ({ scenario, arrivalTime }) =>
    products
      .filter((product) => product.tags.includes(scenario))
      .filter((product) => product.deliveryWindows.includes(arrivalTime))
});

export const sendMessage = createAppTool({
  name: "sendMessage",
  description: "Send the final plan message to a spouse or friend contact.",
  inputSchema: z.object({
    to: z.string(),
    content: z.string()
  }),
  outputSchema: ExecutionReceiptSchema,
  handler: ({ to, content }) => ({
    id: `MSG-${Date.now()}`,
    type: "message_send",
    targetName: to,
    status: "sent",
    details: {
      preview: content.slice(0, 80)
    }
  } satisfies ExecutionReceipt)
});
