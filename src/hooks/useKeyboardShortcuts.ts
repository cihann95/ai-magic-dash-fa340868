import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Global keyboard shortcuts.
 * - g then h: home
 * - g then p: portfolio
 * - g then i: insights
 * - g then j: journal
 * - ? : show help (dispatch event)
 * - Cmd/Ctrl+K and / are handled by CommandPalette directly.
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    let pendingG = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (pendingG) {
        const map: Record<string, string> = {
          h: "/", p: "/portfolio", i: "/insights", j: "/journal",
          c: "/coach", w: "/watchlist", s: "/settings", l: "/leaderboard",
        };
        const path = map[e.key.toLowerCase()];
        pendingG = false;
        if (timer) clearTimeout(timer);
        if (path) {
          e.preventDefault();
          navigate(path);
          return;
        }
      }

      if (e.key === "g") {
        pendingG = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { pendingG = false; }, 800);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("show-shortcuts-help"));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer) clearTimeout(timer);
    };
  }, [navigate]);
}
