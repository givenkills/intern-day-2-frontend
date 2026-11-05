import { request } from "./client";
import type {
  Activity,
  ActivitySettings,
  ActivityTemplate,
  ActivityTemplateInput,
  GenerateResult,
  ScheduleTemplateInput,
  TodayData,
  WeekStats,
} from "./types";

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

export interface PostponeOptions {
  plan_date: string;
  times: string[];
}

export function getPostponeOptions(id: number): Promise<PostponeOptions> {
  return request<PostponeOptions>(`/activity/${id}/postpone-options`);
}

export function postponeActivity(id: number, scheduledAt?: string): Promise<PostponeResult> {
  return request<PostponeResult>(`/activity/${id}/postpone`, {
    method: "POST",
    body: scheduledAt ? { scheduled_at: scheduledAt } : {},
  });
}

export function getWeekStats(weekStart?: string, timeZone?: string): Promise<WeekStats> {
  const params = new URLSearchParams();
  if (weekStart) params.set("week_start", weekStart);
  if (timeZone) params.set("timezone", timeZone);
  const query = params.toString();
  return request<WeekStats>(`/activity/week${query ? `?${query}` : ""}`);
}

/** 模板相关：归属由后端从登录令牌判断，前端不传 user_id。 */
export function listTemplates(includeArchived = false): Promise<ActivityTemplate[]> {
  const query = includeArchived ? "?include_archived=true" : "";
  return request<ActivityTemplate[]>(`/activity/templates${query}`);
}

export function createTemplate(payload: ActivityTemplateInput): Promise<ActivityTemplate> {
  return request<ActivityTemplate>("/activity/templates", { method: "POST", body: payload });
}

export function updateTemplate(id: number, payload: ActivityTemplateInput): Promise<ActivityTemplate> {
  return request<ActivityTemplate>(`/activity/templates/${id}`, { method: "PUT", body: payload });
}

export function archiveTemplate(id: number): Promise<ActivityTemplate> {
  return request<ActivityTemplate>(`/activity/templates/${id}/archive`, { method: "POST" });
}

export function scheduleTemplate(id: number, payload: ScheduleTemplateInput): Promise<Activity> {
  return request<Activity>(`/activity/templates/${id}/schedule`, { method: "POST", body: payload });
}
