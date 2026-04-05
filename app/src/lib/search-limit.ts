import type { SubscriptionTier, SearchLimitStatus } from "@/types";
import { redis } from "./redis";

const TIER_LIMITS: Record<SubscriptionTier, number> = {
  free: 15,
  starter: 20,
  pro: 50,
  elite: 100,
};

/** Get today's date key in UTC+4 (Georgian time) */
function getTbilisiDateKey(): string {
  const now = new Date();
  const tbilisi = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  return tbilisi.toISOString().split("T")[0];
}

/** Seconds remaining until midnight UTC+4 */
function getSecondsUntilMidnightUTC4(): number {
  const now = new Date();
  const tbilisi = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const midnight = new Date(tbilisi);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - tbilisi.getTime()) / 1000);
}

export async function checkAndIncrementSearchCount(
  _userId: string,
  _tier: SubscriptionTier
): Promise<SearchLimitStatus> {
  // Temporarily unlimited for testing
  return { allowed: true, count: 0, limit: 999999, show_upgrade_prompt: false };
}

export async function getSearchCount(
  userId: string
): Promise<number> {
  const dateKey = getTbilisiDateKey();
  const redisKey = `search_count:${userId}:${dateKey}`;
  const current = await redis.get<number>(redisKey);
  return current ?? 0;
}
