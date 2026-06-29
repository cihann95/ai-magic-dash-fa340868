import { Info } from "lucide-react";
import { useApp } from "@/contexts/AppContext";

export default function AIDisclaimer({ className = "" }: { className?: string }) {
  const { lang } = useApp();
  return (
    <div className={`flex items-start gap-1.5 text-[11px] text-muted-foreground ${className}`}>
      <Info className="size-3 shrink-0 mt-0.5" />
      <span>
        {lang === "tr"
          ? "Bu analiz bilgilendirme amaçlıdır, yatırım tavsiyesi değildir."
          : "This analysis is for informational purposes only, not financial advice."}
      </span>
    </div>
  );
}
