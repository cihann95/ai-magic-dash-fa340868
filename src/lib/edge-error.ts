/**
 * Global Edge Function error handler.
 * Wraps supabase.functions.invoke() to parse structured errors and show
 * user-friendly Turkish messages with retry support.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EdgeError {
  error: string;
  code: string;
  retryable: boolean;
  details?: unknown;
}

const ERROR_MESSAGES: Record<string, string> = {
  // Auth
  UNAUTHORIZED: "Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.",
  // Validation
  VALIDATION_ERROR: "Geçersiz veri girdiniz.",
  // Balance
  INSUFFICIENT_BALANCE: "Bakiyeniz yetersiz. Demo bakiyenizi artırın.",
  // Blitz
  ROOM_NOT_FOUND: "Oda bulunamadı.",
  ROOM_UNAVAILABLE: "Oda artık katılıma açık değil.",
  ROOM_FULL: "Bu oda doldu. Başka bir oda deneyin.",
  ALREADY_JOINED: "Bu odaya zaten katıldınız.",
  INVALID_INVITE: "Davet kodu geçersiz veya süresi dolmuş.",
  LOCK_FAILED: "Eş zamanlı istek oluştu. Tekrar deneyin.",
  LOCK_CONFLICT: "Eş zamanlı istek oluştu. Tekrar deneyin.",
  // Price
  PRICE_UNAVAILABLE: "Fiyat bilgisi alınamadı. Kısa süre sonra tekrar deneyin.",
  // AI
  AI_TIMEOUT: "Yapay zeka yanıt vermedi. Tekrar deneyin.",
  AI_PROVIDER_ERROR: "Yapay zeka servisinde sorun var. Tekrar deneyin.",
  // Rate limit
  RATE_LIMITED: "Çok fazla istek. Lütfen biraz bekleyin.",
  // Generic
  UNKNOWN: "Bir hata oluştu. Lütfen tekrar deneyin.",
  PROFILE_NOT_FOUND: "Profil bulunamadı.",
  ROOM_CREATE_FAILED: "Oda oluşturulamadı. Tekrar deneyin.",
};

const RETRYABLE_CODES = new Set([
  "LOCK_FAILED",
  "LOCK_CONFLICT",
  "PRICE_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_PROVIDER_ERROR",
  "RATE_LIMITED",
  "UNKNOWN",
]);

function parseEdgeError(rawMessage: string): EdgeError {
  // Supabase wraps edge function errors in a generic message.
  // Try to extract the JSON from the raw message first.
  try {
    // The raw message may contain the JSON response body
    const jsonMatch = rawMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.code) {
        return {
          error: parsed.error ?? ERROR_MESSAGES[parsed.code] ?? "Bir hata oluştu",
          code: parsed.code,
          retryable: RETRYABLE_CODES.has(parsed.code),
          details: parsed.details,
        };
      }
    }
  } catch {
    // Not JSON — fall through
  }

  // Check if it's the standard Supabase non-2xx wrapper
  if (rawMessage.includes("non-2xx")) {
    return {
      error: "Bir hata oluştu. Lütfen tekrar deneyin.",
      code: "UNKNOWN",
      retryable: true,
    };
  }

  return {
    error: rawMessage || "Beklenmedik hata",
    code: "UNKNOWN",
    retryable: true,
  };
}

export async function callEdgeFunction<T>(
  functionName: string,
  payload: unknown,
  options?: { showToast?: boolean }
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload,
  });

  if (error) {
    const edgeError = parseEdgeError(error.message);

    if (options?.showToast !== false) {
      const userMessage = ERROR_MESSAGES[edgeError.code] ?? edgeError.error;
      toast.error(userMessage, {
        action: edgeError.retryable
          ? { label: "Tekrar Dene", onClick: () => callEdgeFunction(functionName, payload, options) }
          : undefined,
      });
    }

    throw edgeError;
  }

  return data as T;
}

/**
 * Non-throwing variant. Returns { data, error } instead of throwing.
 */
export async function callEdgeFunctionSafe<T>(
  functionName: string,
  payload: unknown,
  options?: { showToast?: boolean }
): Promise<{ data: T | null; error: EdgeError | null }> {
  try {
    const data = await callEdgeFunction<T>(functionName, payload, options);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e as EdgeError };
  }
}
