import type { WeekStats } from "../api/types";

interface Props {
  stats: WeekStats;
}

const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const BAR_HEIGHT = 110;

function fmtDate(iso: string): string {
  // 形如 2026-10-30 -> 10/30
  const parts = iso.split("-");
  return `${parts[1]}/${parts[2]}`;
}

export function WeekStats({ stats }: Props) {
  const maxCount = Math.max(1, ...stats.days.map((d) => d.planned));
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;

  const hasData = stats.planned + stats.completed + stats.postponed + stats.skipped > 0;

  return (
    <div>
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-value">{stats.planned}</div>
          <div className="stat-label">计划</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-label">完成</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.postponed}</div>
          <div className="stat-label">推迟</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.skipped}</div>
          <div className="stat-label">跳过</div>
        </div>
      </div>

      {!hasData ? (
        <p className="settings-empty">本周还没有安排。</p>
      ) : (
        <div className="stats-chart">
          <div className="stats-bars">
            {stats.days.map((day, index) => {
              const height = day.planned === 0 ? 2 : Math.max(2, (day.planned / maxCount) * BAR_HEIGHT);
              const isToday = day.date === todayKey;
              return (
                <div className="stats-bar-col" key={day.date}>
                  <span className="stats-bar-count">{day.planned || ""}</span>
                  <div
                    className={isToday ? "stats-bar is-today" : "stats-bar"}
                    style={{ height }}
                    title={`${fmtDate(day.date)} 计划${day.planned} 完成${day.completed} 推迟${day.postponed} 跳过${day.skipped}`}
                  />
                  <span className={isToday ? "stats-bar-label is-today" : "stats-bar-label"}>
                    {DAY_LABELS[index]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
