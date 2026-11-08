import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "auto" | "morning" | "night";
export type ThemeName = "morning" | "night";

const MODE_KEY = "jiuzuo.theme.mode";

/** 06:00–17:59 晨光，18:00–05:59 夜色；手动选择直接返回对应主题。 */
export function effectiveTheme(mode: ThemeMode): ThemeName {
  if (mode === "morning" || mode === "night") return mode;
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "morning" : "night";
}

function readSavedMode(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(MODE_KEY);
    return saved === "auto" || saved === "morning" || saved === "night" ? saved : "auto";
  } catch {
    return "auto";
  }
}

function readUrlMode(): ThemeMode | null {
  const value = new URLSearchParams(window.location.search).get("theme");
  return value === "auto" || value === "morning" || value === "night" ? value : null;
}

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ThemeName;
  setMode: (mode: ThemeMode, persist?: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readUrlMode() ?? readSavedMode());
  const [theme, setTheme] = useState<ThemeName>(() => effectiveTheme(mode));

  const apply = useCallback((next: ThemeMode) => {
    const resolved = effectiveTheme(next);
    document.body.dataset.theme = resolved;
    document.body.dataset.mode = next === "auto" ? "auto" : "manual";
    document.documentElement.style.colorScheme = resolved === "night" ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", resolved === "night" ? "#0A1622" : "#F8F6F0");
    }
    setTheme(resolved);
  }, []);

  useEffect(() => {
    apply(mode);
  }, [mode, apply]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (mode === "auto") apply("auto");
    }, 60_000);
    const onVisible = () => {
      if (!document.hidden && mode === "auto") apply("auto");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [mode, apply]);

  const setMode = useCallback((next: ThemeMode, persist = true) => {
    setModeState(next);
    if (persist) {
      try {
        window.localStorage.setItem(MODE_KEY, next);
      } catch {
        // 隐私模式下 localStorage 不可写，主题仍在本次会话内生效
      }
    }
  }, []);

  const value = useMemo(() => ({ mode, theme, setMode }), [mode, theme, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return context;
}
