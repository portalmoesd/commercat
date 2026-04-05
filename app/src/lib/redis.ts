import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN || "",
});
