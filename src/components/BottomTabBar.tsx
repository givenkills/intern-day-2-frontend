import { Link } from "react-router-dom";

/**
 * 今日 / 助手 / 统计三个主入口共用的底部 Tab 栏。
 *
 * 之前 ActivityPage 与 AssistantPage 各写了一份 nav：前者用带 class 的图标组件，
 * 后者的 SVG 漏了 `.mobile-tab-svg`，在真机上被压成 0×0，只剩文字；选中态也分别
 * 用 button / span 实现。这里收敛成唯一实现，保证图标、尺寸、文字、角标、选中态
 * 在任意页面完全一致。
 */
export type MainTab = "today" | "assistant" | "week" | "none";

type LocalTab = "today" | "week";
type TabKey = Exclude<MainTab, "none">;

interface Props {
  active: MainTab;
  /** 今日待执行数；三页统一展示，避免出现/消失造成视觉差异 */
  todayBadge?: number;
  /** 今日页内部用 state 切换（不触发路由重载）；助手页不传，走 Link */
  onSelect?: (tab: LocalTab) => void;
}

const TABS: { key: TabKey; label: string; to: string }[] = [
  { key: "today", label: "今日", to: "/activity" },
  { key: "assistant", label: "助手", to: "/assistant" },
  { key: "week", label: "统计", to: "/activity?tab=week" },
];

function TabIcon({ name }: { name: TabKey }) {
  return (
    <svg
      className="mobile-tab-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "today" ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <path d="m8 12 2.5 2.5L16 9" />
        </>
      ) : null}
      {name === "assistant" ? (
        <path d="M20 12a8 8 0 0 1-8 8H5l2-3a8 8 0 1 1 13-5z" />
      ) : null}
      {name === "week" ? <path d="M5 20v-6M12 20V6M19 20v-9" /> : null}
    </svg>
  );
}

export function BottomTabBar({ active, todayBadge, onSelect }: Props) {
  return (
    <nav className="mobile-tabbar" aria-label="页面切换">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const className = isActive ? "mobile-tab is-active" : "mobile-tab";
        const content = (
          <>
            <span className="mobile-tab-icon" aria-hidden="true">
              <TabIcon name={tab.key} />
            </span>
            <span className="mobile-tab-text">{tab.label}</span>
            {tab.key === "today" && todayBadge && todayBadge > 0 ? (
              <span className="mobile-tab-badge">{todayBadge}</span>
            ) : null}
          </>
        );

        if (isActive) {
          return (
            <span key={tab.key} className={className} aria-current="page">
              {content}
            </span>
          );
        }

        const key = tab.key;
        if (onSelect && (key === "today" || key === "week")) {
          return (
            <button key={key} type="button" className={className} onClick={() => onSelect(key)}>
              {content}
            </button>
          );
        }

        return (
          <Link key={tab.key} className={className} to={tab.to}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
