import { useState, useEffect, useRef } from "react";
import { useSpectatorBroadcast } from "../../hooks/useSpectatorBroadcast";
import type { EmojiReaction, ChatMessage } from "../../hooks/useSpectatorBroadcast";

const QUICK_EMOJIS = ["🔥", "🚀", "💎", "🙌", "😱", "👏", "💪", "🎯"];

// ---------- EmojiGrid ----------
function EmojiGrid({
  recentEmojis,
  onSendEmoji,
  isConnected,
}: {
  recentEmojis: EmojiReaction[];
  onSendEmoji: (emoji: string) => void;
  isConnected: boolean;
}) {
  return (
    <div className="relative">
      {/* Floating emojis */}
      <div className="absolute bottom-full left-0 right-0 h-20 pointer-events-none overflow-hidden">
        {recentEmojis.slice(-6).map((e, i) => (
          <span
            key={`${e.timestamp}-${i}`}
            className="absolute text-2xl"
            style={{
              left: `${(i * 20) % 80}%`,
              animation: "float-up 2s ease-out forwards",
            }}
          >
            {e.emoji}
          </span>
        ))}
      </div>
      {/* Quick emoji buttons */}
      <div className="flex gap-1 flex-wrap">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSendEmoji(emoji)}
            disabled={!isConnected}
            className="size-8 rounded-lg hover:bg-white/10 text-lg disabled:opacity-40 transition-all active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- ChatPanel ----------
function ChatPanel({
  messages,
  onSendChat,
  isConnected,
}: {
  messages: ChatMessage[];
  onSendChat: (text: string) => boolean;
  isConnected: boolean;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const sent = onSendChat(input);
    if (sent) setInput("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scrollRef}
        className="h-32 overflow-y-auto space-y-1 rounded-lg bg-black/20 p-2 text-xs"
      >
        {messages.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            Chat messages appear here
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-1.5">
            <span className="font-semibold text-primary shrink-0">
              {msg.username}:
            </span>
            <span className="text-foreground/80 break-words">{msg.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Chat..."
          maxLength={200}
          disabled={!isConnected}
          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs outline-none focus:border-primary/50 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!isConnected || !input.trim()}
          className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

// ---------- SpectatorPanel (composed) ----------
interface SpectatorPanelProps {
  roomId: string;
  userId?: string;
  username?: string;
}

export default function SpectatorPanel({
  roomId,
  userId,
  username,
}: SpectatorPanelProps) {
  const {
    recentEmojis,
    chatMessages,
    sendEmoji,
    sendChat,
    isConnected,
    error,
  } = useSpectatorBroadcast({
    roomId,
    userId,
    username,
  });

  if (error) return null; // silently fail for non-critical feature

  return (
    <div className="rounded-2xl glass border border-border/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Spectator
        </span>
        <span
          className={`size-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
        />
      </div>
      <EmojiGrid
        recentEmojis={recentEmojis}
        onSendEmoji={sendEmoji}
        isConnected={isConnected}
      />
      <ChatPanel
        messages={chatMessages}
        onSendChat={sendChat}
        isConnected={isConnected}
      />
    </div>
  );
}
