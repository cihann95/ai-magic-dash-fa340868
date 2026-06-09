// Ana Sahne — parent orchestrator component that manages the 4-state machine
//   loading → active → finished → empty
// All data comes from props (AnaSahneState). Pure presentation — no side effects.

import { useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnaSahneState } from "@/hooks/useAnaSahne";
import EmptyArena from "./EmptyArena";
import FinishedBanner from "./FinishedBanner";
import CountdownCircle from "./CountdownCircle";
import { PlayerCard } from "./PlayerCard";

interface AnaSahneProps extends AnaSahneState {}

export default function AnaSahne({
  room,
  participants,
  timeLeft,
  viewers,
  isLoading,
  isFinished,
  error,
}: AnaSahneProps) {
  const [showEmptyAfterFinish, setShowEmptyAfterFinish] = useState(false);

  const handleFinishComplete = useCallback(() => {
    setShowEmptyAfterFinish(true);
  }, []);

  // Derive winner as the participant with highest PnL (only meaningful when finished)
  const winner =
    isFinished && participants.length > 0
      ? participants.reduce(
          (max, p) => (p.pnl > max.pnl ? p : max),
          participants[0],
        ).username
      : null;

  // Sort participants by PnL descending for leaderboard display
  const sortedParticipants = [...participants].sort((a, b) => b.pnl - a.pnl);

  // ── Loading state ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {/* Section header skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>

        {/* Grid skeleton: 3 placeholder player cards */}
        <div className="flex flex-col md:flex-row gap-6 items-center justify-center">
          <Skeleton className="size-32 md:size-48 rounded-full" />
          <div className="flex flex-col gap-3 w-full max-w-sm">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (error) {
    return <EmptyArena message={error} />;
  }

  // ── Empty state (no featured room) ───────────────────────────────────
  if (!room) {
    return <EmptyArena />;
  }

  // ── Finished state ──────────────────────────────────────────────────
  if (isFinished) {
    return (
      <div className="flex flex-col gap-4">
        <FinishedBanner
          winner={winner}
          pot={Number(room.pot)}
          onComplete={handleFinishComplete}
        />
        {showEmptyAfterFinish && <EmptyArena />}
      </div>
    );
  }

  // ── Active state (room exists, not finished) ─────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Section header */}
      <SectionHeader
        viewers={viewers}
        symbol={room.symbol}
        entryFee={Number(room.entry_fee)}
      />

      {/* Main grid: CountdownCircle left, PlayerCards right */}
      <div className="flex flex-col md:flex-row gap-6 items-center justify-center">
        <CountdownCircle timeLeft={timeLeft} isActive={true} />

        <div className="flex flex-col gap-3 w-full max-w-sm">
          {sortedParticipants.length > 0 ? (
            sortedParticipants.map((p, idx) => (
              <PlayerCard
                key={p.user_id}
                username={p.username}
                side={p.side}
                pnl={p.pnl}
                pnlPct={p.pnlPct}
                isWinner={idx === 0}
                index={idx}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Henüz katılımcı yok
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section header sub-component ────────────────────────────────────────

interface SectionHeaderProps {
  viewers: number;
  symbol: string;
  entryFee: number;
}

function SectionHeader({ viewers, symbol, entryFee }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* "🔴 CANLI" live badge with pulse animation */}
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/15 px-3 py-1 text-xs font-semibold text-red-500">
        <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
        CANLI
      </span>

      {/* Viewer count */}
      <span className="text-sm text-muted-foreground tabular-nums">
        {viewers} İzleyici
      </span>

      {/* Room info: symbol • entry fee */}
      <span className="text-sm text-muted-foreground">
        {symbol} • ${entryFee.toFixed(2)}
      </span>
    </div>
  );
}
