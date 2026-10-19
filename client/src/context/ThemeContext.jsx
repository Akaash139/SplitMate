import { useState, useEffect, useMemo, useCallback } from "react";
import { ThemeContext } from "./themeContextDef";

const STORAGE_KEY = "splitmate_theme";

/**
 * Resolves initial theme state:
 * 1. Explicit user selection in localStorage ("light" or "dark")
 * 2. System preference via window.matchMedia("(prefers-color-scheme: dark)")
 * 3. Default fallback to "light"
 */
function getInitialTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch {
    // Graceful fallback for restricted iframe or privacy mode environments
  }
  return "light";
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  // Sync document attribute and localStorage on theme update
  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage error safeguard
    }
  }, [theme]);

  // Listen to OS preference changes if user hasn't explicitly set a preference
  useEffect(() => {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemChange(e) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) {
          setThemeState(e.matches ? "dark" : "light");
        }
      } catch {
        // Ignored
      }
    }

    mediaQuery.addEventListener?.("change", handleSystemChange);
    return () => mediaQuery.removeEventListener?.("change", handleSystemChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const setTheme = useCallback((newTheme) => {
    if (newTheme === "light" || newTheme === "dark") {
      setThemeState(newTheme);
    }
  }, []);

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === "dark",
      toggleTheme,
      setTheme
    }),
    [theme, toggleTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
