import { useState } from "react";
import { AlertTriangle, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const isDev = import.meta.env.DEV;
  const [expanded, setExpanded] = useState(isDev);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="size-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            Bir şeyler ters gitti
          </h2>
          <p className="text-muted-foreground">
            Beklenmeyen bir hata oluştu. Lütfen sayfayı yenileyin.
          </p>
        </div>

        <Button onClick={resetError} className="gradient-primary text-primary-foreground">
          <RefreshCw className="size-4 mr-2" /> Sayfayı Yenile
        </Button>

        {isDev && (
          <div className="text-left">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <ChevronDown className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
              Teknik Detaylar
            </button>
            {expanded && (
              <pre className="mt-2 rounded-lg bg-muted p-4 text-xs text-muted-foreground overflow-auto max-h-48 border">
                {error.name}: {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
