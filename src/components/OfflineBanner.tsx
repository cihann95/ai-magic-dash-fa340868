import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [show, setShow] = useState(false);

  useEffect(() => {
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

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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
        {!isOnline && <WifiOff className="size-4" />}
        <span>
          {isOnline
            ? "Back online"
            : "No internet connection - working in offline mode"}
        </span>
      </div>
    </div>
  );
}
