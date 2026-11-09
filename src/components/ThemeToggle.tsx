import { useEffect, useRef, useState, type ReactNode } from "react";

import { useTheme, type ThemeMode } from "../theme";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** 顶部显式主题切换键：跟随时间 / 晨光 / 夜色，状态写入 localStorage。 */
export function ThemeToggle() {
  const { mode, theme, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [open]);

  const options: Array<{ key: ThemeMode; label: string; sub: string; icon: ReactNode }> = [
    { key: "auto", label: "跟随时间", sub: "06:00 晨光 · 18:00 夜色", icon: <ClockIcon /> },
    { key: "morning", label: "晨光", sub: "暖白底 · 墨绿主色", icon: <SunIcon /> },
    { key: "night", label: "夜色", sub: "深蓝底 · 低眩光薄荷", icon: <MoonIcon /> },
  ];

  const currentIcon = mode === "auto" ? <ClockIcon /> : theme === "morning" ? <SunIcon /> : <MoonIcon />;

  return (
    <div className="theme-switch" ref={wrapper}>
      <button
        className="theme-toggle-btn"
        type="button"
        aria-label="切换界面主题"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {currentIcon}
      </button>
      {open ? (
        <div className="theme-menu" role="menu" aria-label="界面主题">
          <p className="theme-menu-title">界面主题</p>
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitemradio"
              aria-checked={mode === option.key}
              className={mode === option.key ? "theme-option is-active" : "theme-option"}
              onClick={() => {
                setMode(option.key);
                setOpen(false);
              }}
            >
              <span className="theme-option-icon">{option.icon}</span>
              <span className="theme-option-text">
                <strong>{option.label}</strong>
                <small>{option.sub}</small>
              </span>
              <span className="theme-option-check" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
