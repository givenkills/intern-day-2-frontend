import { request } from "./client";
import type { Activity, ActivitySettings, GenerateResult, TodayData, WeekStats } from "./types";

/** 以下接口都要求登录，未登录或令牌失效时后端返回 401。 */

export function getSettings(): Promise<ActivitySettings> {
  return request<ActivitySettings>("/activity/settings");
}

export function saveSettings(settings: ActivitySettings): Promise<ActivitySettings> {
  return request<ActivitySettings>("/activity/settings", { method: "PUT", body: settings });
}

export function getToday(): Promise<TodayData> {
  return request<TodayData>("/activity/today");
}

export function generateToday(): Promise<GenerateResult> {
  return request<GenerateResult>("/activity/generate", { method: "POST" });
}

export function completeActivity(id: number): Promise<Activity> {
  return request<Activity>(`/activity/${id}/complete`, { method: "POST" });
}

export function skipActivity(id: number, reason?: string): Promise<Activity> {
  return request<Activity>(`/activity/${id}/skip`, { method: "POST", body: { reason } });
}

export interface PostponeResult {
  ok: boolean;
  reason?: string;
  activity?: Activity;
}

export function postponeActivity(id: number, scheduledAt?: string): Promise<PostponeResult> {
  return request<PostponeResult>(`/activity/${id}/postpone`, {
    method: "POST",
    body: scheduledAt ? { scheduled_at: scheduledAt } : {},
  });
}

export function getWeekStats(): Promise<WeekStats> {
  return request<WeekStats>("/activity/week");
}
