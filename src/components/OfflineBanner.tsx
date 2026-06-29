import { useState, useEffect } from "react";
import { WifiOff, Wifi, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [show, setShow] = useState(false);
  const [cacheCount, setCacheCount] = useState(0);

  useEffect(() => {
    const updateCacheInfo = () => {
      try {
        const count = Object.keys(localStorage).filter((k) => k.startsWith("lumen_offline_")).length;
        setCacheCount(count);
      } catch {
        setCacheCount(0);
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      setTimeout(() => setShow(false), 2000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShow(true);
    };

    // Initial check
    setIsOnline(navigator.onLine);
    setShow(!navigator.onLine);
    updateCacheInfo();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("storage", updateCacheInfo);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("storage", updateCacheInfo);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[100] px-4 py-3 text-sm font-medium text-center transition-all duration-300",
        isOnline
          ? "bg-green-600 text-white"
          : "bg-yellow-600 text-white"
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center justify-center gap-2">
        {isOnline ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
        <span>
          {isOnline
            ? "Back online"
            : "No internet connection — working offline"}
        </span>
        {!isOnline && cacheCount > 0 && (
          <span className="flex items-center gap-1 text-yellow-200 text-xs">
            <Database className="size-3" />
            {cacheCount} cached
          </span>
        )}
      </div>
    </div>
  );
}
