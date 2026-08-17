"use client";

import { useSyncExternalStore } from "react";
import {
  APP_THEMES,
  saveTheme,
  serverTheme,
  storedTheme,
  subscribeTheme,
} from "@/lib/theme";

export default function ThemePicker() {
  const selected = useSyncExternalStore(subscribeTheme, storedTheme, serverTheme);

  return (
    <fieldset>
      <legend className="font-medium">外观主题</legend>
      <p className="mt-1 text-xs leading-5 text-muted">
        每套主题都有独立排版、字体与组件规则，功能和数据保持一致。
      </p>
      <div className="theme-picker-grid mt-3 grid grid-cols-2 gap-2">
        {APP_THEMES.map((theme) => (
          <button
            key={theme.value}
            type="button"
            aria-pressed={selected === theme.value}
            onClick={() => saveTheme(theme.value)}
            className={`theme-picker-option min-h-24 rounded-xl border p-3 text-left transition-colors ${
              selected === theme.value
                ? "border-tint ring-2 ring-tint"
                : "border-separator"
            }`}
          >
            <span
              aria-hidden="true"
              className="mb-2 block h-5 w-10 rounded-full border border-black/10"
              style={{ background: theme.color }}
            />
            <span className="block text-sm font-medium">{theme.label}</span>
            <span className="mt-1 block text-[11px] leading-4 text-muted">
              {theme.description}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
