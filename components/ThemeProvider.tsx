"use client";

import {
  createContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

export type Theme = "dark";

export const DEFAULT_THEME: Theme = "dark";

type ThemeContextValue = {
  theme: Theme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyDocumentTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyDocumentTheme(DEFAULT_THEME);
  }, []);

  const value = useMemo(() => ({ theme: DEFAULT_THEME }), []);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
