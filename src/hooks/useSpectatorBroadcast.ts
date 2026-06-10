import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface EmojiReaction {
  emoji: string;
  user_id: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  text: string;
  timestamp: number;
}

interface BroadcastPayload {
  type: "emoji" | "chat";
  emoji?: string;
  text?: string;
  username: string;
  user_id: string;
  timestamp: number;
  id: string;
}

const DEFAULT_CHAT_RATE_LIMIT_MS = 2000;
const EMOJI_RATE_LIMIT_MS = 333;
const MAX_CHAT_MESSAGES = 50;
const EMOJI_TTL_MS = 5000;

interface UseSpectatorBroadcastOptions {
  roomId: string | null;
  userId?: string;
  username?: string;
  chatRateLimitMs?: number;
}

interface UseSpectatorBroadcastReturn {
  recentEmojis: EmojiReaction[];
  chatMessages: ChatMessage[];
  sendEmoji: (emoji: string) => boolean;
  sendChat: (text: string) => boolean;
  isConnected: boolean;
  error: string | null;
}

export function useSpectatorBroadcast({
  roomId,
  userId = "anonymous",
  username = "Anonymous",
  chatRateLimitMs = DEFAULT_CHAT_RATE_LIMIT_MS,
}: UseSpectatorBroadcastOptions): UseSpectatorBroadcastReturn {
  const [recentEmojis, setRecentEmojis] = useState<EmojiReaction[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastEmojiTime = useRef(0);
  const lastChatTime = useRef(0);

  // Auto-evict old emojis every 1 second
  useEffect(() => {
    if (recentEmojis.length === 0) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - EMOJI_TTL_MS;
      setRecentEmojis((prev) => prev.filter((e) => e.timestamp > cutoff));
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentEmojis.length > 0]);

  // Subscribe to broadcast channel
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const channelName = `spectator:${roomId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { ack: false, selfEcho: true } },
    });

    channel
      .on("broadcast", { event: "spectator_event" }, (payload: { payload: BroadcastPayload }) => {
        if (cancelled) return;
        const msg = payload.payload;
        if (msg.type === "emoji" && msg.emoji) {
          setRecentEmojis((prev) => [
            ...prev,
            { emoji: msg.emoji!, user_id: msg.user_id, timestamp: msg.timestamp },
          ]);
        } else if (msg.type === "chat" && msg.text && msg.text.trim()) {
          setChatMessages((prev) => {
            const next = [
              ...prev,
              { id: msg.id, user_id: msg.user_id, username: msg.username, text: msg.text!, timestamp: msg.timestamp },
            ];
            return next.length > MAX_CHAT_MESSAGES ? next.slice(next.length - MAX_CHAT_MESSAGES) : next;
          });
        }
      })
      .subscribe((status) => {
        if (cancelled) return;
        setIsConnected(status === "SUBSCRIBED");
        if (status === "CHANNEL_ERROR") setError("Broadcast connection failed");
      });

    channelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const sendEmoji = useCallback((emoji: string): boolean => {
    const now = Date.now();
    if (now - lastEmojiTime.current < EMOJI_RATE_LIMIT_MS) return false;
    lastEmojiTime.current = now;

    const payload: BroadcastPayload = {
      type: "emoji", emoji, username, user_id: userId, timestamp: now, id: crypto.randomUUID(),
    };
    channelRef.current?.send({
      type: "broadcast",
      event: "spectator_event",
      payload,
    });
    return true;
  }, [username, userId]);

  const sendChat = useCallback((text: string): boolean => {
    const now = Date.now();
    if (now - lastChatTime.current < chatRateLimitMs) return false;
    if (!text.trim()) return false;
    lastChatTime.current = now;

    const payload: BroadcastPayload = {
      type: "chat", text: text.trim(), username, user_id: userId, timestamp: now, id: crypto.randomUUID(),
    };
    channelRef.current?.send({
      type: "broadcast",
      event: "spectator_event",
      payload,
    });
    return true;
  }, [username, userId, chatRateLimitMs]);

  return { recentEmojis, chatMessages, sendEmoji, sendChat, isConnected, error };
}
