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

/** Shape of structured JSON returned by edge functions on non-2xx responses. */
interface EdgeFunctionResponse {
  code?: string;
  error?: string;
  retryable?: boolean;
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
  MATCHMAKER_UNAVAILABLE:
    "Eşleştirme servisi geçici olarak kullanılamıyor.",
  ROOM_NOT_FOUND: "Oda bulunamadı.",
  ROOM_UNAVAILABLE: "Oda artık katılıma açık değil.",
  ROOM_FULL: "Bu oda doldu. Başka bir oda deneyin.",
  ALREADY_JOINED: "Bu odaya zaten katıldınız.",
  ALREADY_IN_ROOM: "Zaten bir oyun odasındasınız.",
  INVALID_INVITE: "Davet kodu geçersiz veya süresi dolmuş.",
  LOCK_FAILED: "Eş zamanlı istek oluştu. Tekrar deneyin.",
  LOCK_CONFLICT: "Eş zamanlı istek oluştu. Tekrar deneyin.",
  // Price
  PRICE_UNAVAILABLE:
    "Fiyat bilgisi alınamadı. Kısa süre sonra tekrar deneyin.",
  // AI
  AI_TIMEOUT: "Yapay zeka yanıt vermedi. Tekrar deneyin.",
  AI_PROVIDER_ERROR:
    "Yapay zeka servisinde sorun var. Tekrar deneyin.",
  // Rate limit
  RATE_LIMITED: "Çok fazla istek. Lütfen biraz bekleyin.",
  // Generic
  UNKNOWN: "Bir hata oluştu. Lütfen tekrar deneyin.",
  PROFILE_NOT_FOUND: "Profil bulunamadı.",
  ROOM_CREATE_FAILED: "Oda oluşturulamadı. Tekrar deneyin.",
};

const RETRYABLE_CODES = new Set([
  "MATCHMAKER_UNAVAILABLE",
  "LOCK_FAILED",
  "LOCK_CONFLICT",
  "PRICE_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_PROVIDER_ERROR",
  "RATE_LIMITED",
  "UNKNOWN",
]);

/**
 * Try to read structured error JSON from a Supabase error's Response context.
 * FunctionsHttpError and FunctionsRelayError store the Response in `.context`.
 */
async function readResponseContext(
  err: { context?: unknown }
): Promise<EdgeFunctionResponse | null> {
  const ctx = err.context;
  if (
    ctx &&
    typeof ctx === "object" &&
    typeof (ctx as Response).json === "function"
  ) {
    try {
      const body: unknown = await (ctx as Response).json();
      if (body && typeof body === "object" && "code" in body) {
        return body as EdgeFunctionResponse;
      }
    } catch {
      // Response body already consumed or not JSON — fall through
    }
  }
  return null;
}

/**
 * Map a structured edge-function response body to an EdgeError,
 * using known error code messages as the default.
 */
function errorFromResponse(body: EdgeFunctionResponse): EdgeError {
  const code = body.code ?? "UNKNOWN";
  return {
    error:
      body.error ?? ERROR_MESSAGES[code] ?? "Bir hata oluştu",
    code,
    retryable:
      typeof body.retryable === "boolean"
        ? body.retryable
        : RETRYABLE_CODES.has(code),
    details: body.details,
  };
}

/**
 * Parse a raw error message string into an EdgeError.
 * Fallback when the Response body cannot be read directly.
 */
function parseEdgeError(rawMessage: string): EdgeError {
  // Try to extract JSON from the raw message
  try {
    const jsonMatch = rawMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === "object" && "code" in parsed) {
        return errorFromResponse(parsed as EdgeFunctionResponse);
      }
    }
  } catch {
    // Not JSON — fall through
  }

  // Network / relay failure wrapping
  if (
    rawMessage.includes("Failed to send a request") ||
    rawMessage.includes("Relay Error")
  ) {
    return {
      error:
        "Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.",
      code: "UNKNOWN",
      retryable: true,
    };
  }

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

/**
 * Resolve an error from supabase.functions.invoke() into a structured EdgeError.
 * Reads the Response body when available (FunctionsHttpError / FunctionsRelayError),
 * then falls back to message-based parsing.
 */
async function resolveEdgeError(rawError: unknown): Promise<EdgeError> {
  if (rawError && typeof rawError === "object") {
    const errObj = rawError as { name?: string; context?: unknown };

    // FunctionsHttpError / FunctionsRelayError — read the Response body
    if (
      errObj.name === "FunctionsHttpError" ||
      errObj.name === "FunctionsRelayError"
    ) {
      const body = await readResponseContext(errObj);
      if (body) {
        return errorFromResponse(body);
      }
    }

    // FunctionsFetchError — network failure, wrap nicely
    if (errObj.name === "FunctionsFetchError") {
      return {
        error:
          "Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.",
        code: "UNKNOWN",
        retryable: true,
      };
    }
  }

  // Fallback: parse the error message string
  const message =
    rawError instanceof Error
      ? rawError.message
      : String(rawError ?? "Beklenmedik hata");
  return parseEdgeError(message);
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
    const edgeError = await resolveEdgeError(error);

    if (options?.showToast !== false) {
      const userMessage = ERROR_MESSAGES[edgeError.code] ?? edgeError.error;
      toast.error(userMessage, {
        action: edgeError.retryable
          ? {
              label: "Tekrar Dene",
              onClick: () =>
                callEdgeFunction(functionName, payload, options),
            }
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
