import { useState, useEffect } from "react";

interface StreakData {
  date: string;
  streak: number;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayStr(today: string): string {
  const d = new Date(today);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useDailyStreak() {
  const [streak, setStreak] = useState(0);
  const [lastVisit, setLastVisit] = useState("");
  const [isNewDay, setIsNewDay] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("daily_streak");
      const stored: StreakData | null = raw ? JSON.parse(raw) : null;
      const today = todayStr();

      if (!stored) {
        const data: StreakData = { date: today, streak: 1 };
        localStorage.setItem("daily_streak", JSON.stringify(data));
        setStreak(1);
        setLastVisit(today);
        setIsNewDay(true);
        return;
      }

      setLastVisit(stored.date);

      if (stored.date === today) {
        setStreak(stored.streak);
        setIsNewDay(false);
        return;
      }

      if (stored.date === yesterdayStr(today)) {
        const data: StreakData = { date: today, streak: stored.streak + 1 };
        localStorage.setItem("daily_streak", JSON.stringify(data));
        setStreak(data.streak);
        setIsNewDay(true);
        return;
      }

      // gap > 1 day → reset
      const data: StreakData = { date: today, streak: 1 };
      localStorage.setItem("daily_streak", JSON.stringify(data));
      setStreak(1);
      setIsNewDay(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  return { streak, lastVisit, isNewDay };
}
