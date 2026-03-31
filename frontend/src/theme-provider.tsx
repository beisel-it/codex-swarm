import { useLayoutEffect, useState, type PropsWithChildren } from "react";
import {
  ThemeContext,
  themeOptions,
  type ThemeContextValue,
  type ThemeName,
} from "./theme";

const THEME_STORAGE_KEY = "codex-swarm-theme";

const allowedThemes = new Set(themeOptions.map((theme) => theme.value));

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && allowedThemes.has(value as ThemeName);
}

function resolveInitialTheme(): ThemeName {
  if (typeof window === "undefined") {
    return "default";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemeName(storedTheme)) {
    return storedTheme;
  }

  return "default";
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [activeTheme, setActiveTheme] =
    useState<ThemeName>(resolveInitialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = activeTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
  }, [activeTheme]);

  const value: ThemeContextValue = {
    activeTheme,
    setActiveTheme,
    themes: themeOptions,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
