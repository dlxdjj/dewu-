export const APP_THEMES = [
  { value: "cirrus", label: "云海", description: "当前使用的清透蓝白主题", color: "#b8d4f1" },
  { value: "spritecraft", label: "像素工坊", description: "米黄、森林绿与硬朗像素边框", color: "#f4e9c8" },
  { value: "voltura", label: "伏特夜航", description: "深色仪表盘与荧光绿强调", color: "#15191a" },
  { value: "lumen", label: "流明边界", description: "冷灰黑与底部微光的暗色主题", color: "#1b1c22" },
] as const;

export type AppTheme = (typeof APP_THEMES)[number]["value"];

const STORAGE_KEY = "dewu_app_theme";
const THEME_EVENT = "dewu-theme-change";
let volatileTheme: AppTheme = "cirrus";

export function isAppTheme(value: unknown): value is AppTheme {
  return APP_THEMES.some((theme) => theme.value === value);
}

export function storedTheme(): AppTheme {
  if (typeof window === "undefined") return "cirrus";
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (isAppTheme(value)) volatileTheme = value;
  } catch {
    // Safari private/storage-restricted contexts still keep the theme for this tab.
  }
  return volatileTheme;
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  const definition = APP_THEMES.find((item) => item.value === theme)!;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", definition.color);
}

export function saveTheme(theme: AppTheme): void {
  volatileTheme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Applying the visual theme does not depend on persistent storage access.
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

export function serverTheme(): AppTheme {
  return "cirrus";
}
