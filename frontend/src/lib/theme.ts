import { useCallback, useState } from "react";

type Theme = "light" | "dark";
const KEY = "meetmind-theme";

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* preference just won't persist */
      }
      return next;
    });
  }, []);
  return [theme, toggle];
}
