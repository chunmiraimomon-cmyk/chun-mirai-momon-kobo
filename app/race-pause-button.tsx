"use client";

export function RacePauseButton({ onPause }: { onPause: () => void }) {
  return (
    <button
      type="button"
      className="race-pause-button"
      aria-label="レースを中断・メニューへ戻る"
      aria-haspopup="dialog"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onPause(); }}
    >
      <span aria-hidden="true">Ⅱ</span> 中断
    </button>
  );
}
