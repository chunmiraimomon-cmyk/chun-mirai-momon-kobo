export const KEYBOARD_GLITCH_PAIR_MS = 5;

/**
 * Delays only steering-key keyup events long enough to decide whether the next
 * same-key non-repeat keydown forms the sub-human RAW pair seen in diagnostics.
 * It also rejects a steering keydown when the immediately preceding RAW key
 * event was an orphan keyup for a different physical key within the same 5ms
 * window. This covers the recorded Backquote/Zenkaku -> KeyD fault without
 * treating ordinary cross-key transitions as invalid.
 * Committed keyups retain their RAW timestamp and prior state separately, so
 * a busy frame cannot erase the evidence before a queued RAW keydown is
 * processed. Late detection restores the original state/order rather than
 * promoting the false keydown to a new press.
 * It does not infer releases from time, repeat activity, or hold duration.
 */
export class KeyboardTransitionFilter {
  constructor({
    thresholdMs = KEYBOARD_GLITCH_PAIR_MS,
    setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimer = (timer) => globalThis.clearTimeout(timer),
  } = {}) {
    this.thresholdMs = thresholdMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.pendingUps = new Map();
    this.recentCommittedUps = new Map();
    this.lastOrphanKeyUp = null;
  }

  noteKeyUp(event) {
    this.lastOrphanKeyUp = event.wasActive
      ? null
      : {
          event,
          keyId: event.keyId ?? event.code,
          timeStamp: event.timeStamp,
        };
  }

  noteOtherEvent() {
    this.lastOrphanKeyUp = null;
  }

  handleKeyUp(event, emit) {
    const keyId = event.keyId ?? event.code;
    this.recentCommittedUps.delete(keyId);
    this.flushKey(keyId);

    const pending = {
      emit,
      event,
      keyId,
      timeStamp: event.timeStamp,
      wasActive: event.wasActive,
      restoreState: event.restoreState,
      timer: undefined,
    };
    pending.timer = this.setTimer(() => {
      if (this.pendingUps.get(keyId) !== pending) return;
      this.pendingUps.delete(keyId);
      this.commitKeyUp(pending);
    }, this.thresholdMs);
    this.pendingUps.set(keyId, pending);

    return { accepted: false, pending: true };
  }

  handleKeyDown(event, emit) {
    const keyId = event.keyId ?? event.code;
    const orphanKeyUp = this.lastOrphanKeyUp;
    this.lastOrphanKeyUp = null;
    const pending = this.pendingUps.get(keyId);
    if (pending) {
      const gapMs = event.timeStamp - pending.timeStamp;
      if (!event.repeat && gapMs >= 0 && gapMs <= this.thresholdMs) {
        this.clearTimer(pending.timer);
        this.pendingUps.delete(keyId);
        this.recentCommittedUps.delete(keyId);
        return {
          accepted: false,
          gapMs,
          pairedEvent: pending.event.payload ?? pending.event,
          reason: pending.wasActive
            ? "glitch-pair-keep-on"
            : "glitch-pair-keep-off",
        };
      }
      this.flushKey(keyId);
    }

    const committedUp = this.recentCommittedUps.get(keyId);
    if (committedUp) {
      const gapMs = event.timeStamp - committedUp.timeStamp;
      this.recentCommittedUps.delete(keyId);
      if (!event.repeat && gapMs >= 0 && gapMs <= this.thresholdMs) {
        return {
          accepted: false,
          gapMs,
          pairedEvent: committedUp.event.payload ?? committedUp.event,
          reason: committedUp.wasActive
            ? "late-glitch-pair-restore-on"
            : "late-glitch-pair-keep-off",
          restoreState: committedUp.wasActive ? committedUp.restoreState : undefined,
        };
      }
    }

    if (orphanKeyUp && orphanKeyUp.keyId !== keyId) {
      const gapMs = event.timeStamp - orphanKeyUp.timeStamp;
      if (!event.repeat && gapMs >= 0 && gapMs <= this.thresholdMs) {
        return {
          accepted: false,
          gapMs,
          pairedEvent: orphanKeyUp.event.payload ?? orphanKeyUp.event,
          reason: "orphan-keyup-cross-key",
        };
      }
    }

    emit(event.payload ?? event);
    return { accepted: true, reason: "accepted" };
  }

  flushKey(keyId) {
    const pending = this.pendingUps.get(keyId);
    if (!pending) return false;
    this.clearTimer(pending.timer);
    this.pendingUps.delete(keyId);
    this.commitKeyUp(pending);
    return true;
  }

  commitKeyUp(pending) {
    pending.emit(pending.event.payload ?? pending.event);
    this.recentCommittedUps.set(pending.keyId, pending);
  }

  reset() {
    this.pendingUps.forEach((pending) => this.clearTimer(pending.timer));
    this.pendingUps.clear();
    this.recentCommittedUps.clear();
    this.lastOrphanKeyUp = null;
  }
}
