import type { WeekStats as WeekStatsData } from "../api/types";
import { dateKeyInTimeZone, formatRate, statusLabel, weekdayLabel } from "../weekReview";

interface Props {
  stats: WeekStatsData;
  onOpenToday?: () => void;
}

export function WeekStats({ stats, onOpenToday }: Props) {
  const todayKey = dateKeyInTimeZone(new Date(), stats.timezone);
  const hasData = stats.planned > 0;

  return (
    <div className="week-review">
      <div className="week-summary">
        <div className="week-rate-card">
          <span className="week-rate-value">
            {stats.denominator === 0 ? "无安排" : formatRate(stats.completion_rate)}
          </span>
          <span className="week-rate-label">完成率</span>
          <span className="week-rate-denominator">
            {stats.completed}/{stats.denominator}
          </span>
        </div>
        <div className="week-cards">
          <div className="stat-card">
            <div className="stat-value">{stats.planned}</div>
            <div className="stat-label">计划</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.completed}</div>
            <div className="stat-label">完成</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.skipped}</div>
            <div className="stat-label">跳过</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-label">未完成</div>
          </div>
        </div>
      </div>

      {stats.postponed_activities > 0 ? (
        <p className="week-postponed-note">
          其中 {stats.postponed_activities} 项推迟过，共 {stats.postponed_ops} 次推迟操作（不同维度，不能相加）。
        </p>
      ) : null}

      {!hasData ? <p className="settings-empty">本周没有安排。</p> : null}

      <ul className="week-days">
        {stats.days.map((day) => {
          const isToday = day.date === todayKey;
          return (
            <li className={isToday ? "week-day is-today" : "week-day"} key={day.date}>
              <div className="week-day-head">
                <span className="week-day-name">{weekdayLabel(day.date)}</span>
                <span className="week-day-date">{day.date.slice(5).replace("-", "/")}</span>
                <span className="week-day-counts">
                  计划 {day.planned} · 完成 {day.completed} · 跳过 {day.skipped}
                </span>
                <span className="week-day-rate">
                  {day.has_activities ? formatRate(day.completion_rate) : "—"}
                </span>
                {isToday && onOpenToday ? (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={onOpenToday}>
                    去今日处理
                  </button>
                ) : null}
              </div>

              {day.activities.length > 0 ? (
                <ul className="week-activity-list">
                  {day.activities.map((activity) => (
                    <li className="week-activity" key={activity.id}>
                      <span className="week-activity-time">{activity.local_time}</span>
                      <span className="week-activity-title">{activity.title}</span>
                      <span className={`week-status week-status-${activity.status}`}>
                        {statusLabel(activity.status)}
                      </span>
                      {activity.source === "template" ? (
                        <span className="week-tag">模板</span>
                      ) : null}
                      {activity.is_postponed ? <span className="week-tag">推迟过</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
