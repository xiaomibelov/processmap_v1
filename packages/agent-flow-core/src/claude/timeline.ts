import { cloneModel, createSessionModel, foldUpdate, type SessionModel, type Update } from "./session-model.js";

export type Timing =
  | { kind: "Dated"; ts: Date }
  | { kind: "Pending"; agentId: string }
  | { kind: "Leader" };

export interface ReplayItem {
  timing: Timing;
  update: Update;
}

export function itemTs(item: ReplayItem): Date | null {
  return item.timing.kind === "Dated" ? item.timing.ts : null;
}

const GAP_FAITHFUL_KNEE_MS = 800;
const GAP_COMPRESS_SCALE_MS = 600;

/**
 * Compress a real-time idle gap for replay pacing.
 * Faithful below the knee, then graded log compression.
 */
export function compressGap(realMs: number): number {
  if (realMs <= 0) return 0;
  if (realMs <= GAP_FAITHFUL_KNEE_MS) return realMs;
  const over = realMs - GAP_FAITHFUL_KNEE_MS;
  return GAP_FAITHFUL_KNEE_MS + GAP_COMPRESS_SCALE_MS * Math.log(1 + over / GAP_FAITHFUL_KNEE_MS);
}

function sortItems(items: ReplayItem[]): ReplayItem[] {
  return [...items].sort((a, b) => {
    const ta = itemTs(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const tb = itemTs(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
}

/**
 * A time-shifted timeline over a Claude replay stream.
 *
 * Owns a `SessionModel` and folds updates as the playhead advances.
 * Backward seek rebuilds the model from the prefix; forward seek applies
 * only newly due updates.
 */
export class Timeline {
  private items: ReplayItem[];
  private _replay: boolean;
  private _cursor: Date | null = null;
  private followHead = false;
  private speed = 1;
  private compress = true;
  private model: SessionModel;
  private appliedIndex = -1;

  constructor(items: ReplayItem[] = [], replay = false, sessionId?: string) {
    this.items = sortItems(items);
    this._replay = replay;
    this.model = createSessionModel(sessionId ?? this.inferSessionId());
    if (this.items.length > 0) {
      this._cursor = itemTs(this.items[0]) ?? new Date(0);
      this.seek(itemTs(this.items[this.items.length - 1]) ?? new Date(0));
      if (!replay) {
        this.followHead = true;
      }
    }
  }

  get isReplay(): boolean {
    return this._replay;
  }

  private inferSessionId(): string {
    for (const item of this.items) {
      const entry = item.update.type === "Entry" ? item.update.entry : undefined;
      if (entry && "sessionId" in entry && entry.sessionId) return entry.sessionId;
    }
    return "session";
  }

  get cursor(): Date | null {
    return this._cursor;
  }

  get length(): number {
    return this.items.length;
  }

  get currentIndex(): number {
    return this.appliedIndex;
  }

  timestampAt(index: number): Date | null {
    if (index < 0 || index >= this.items.length) return null;
    return itemTs(this.items[index]);
  }

  get eventTimes(): string[] {
    return this.items.map((i) => itemTs(i)?.toISOString() ?? "");
  }

  get liveIndex(): number {
    return Math.max(0, this.items.length - 1);
  }

  get atEdge(): boolean {
    return this.appliedIndex >= this.liveIndex;
  }

  get following(): boolean {
    return this.followHead;
  }

  setFollowHead(value: boolean): void {
    this.followHead = value;
    if (value && this.items.length > 0) {
      this.seek(itemTs(this.items[this.liveIndex]) ?? new Date(0));
    }
  }

  setSpeed(value: number): void {
    this.speed = Math.max(0, value);
  }

  setCompressGaps(value: boolean): void {
    this.compress = value;
  }

  getModel(): SessionModel {
    return cloneModel(this.model);
  }

  /**
   * Jump the playhead to the given timestamp and fold the matching prefix.
   */
  seek(ts: Date): void {
    const targetIndex = this.lastIndexAtOrBefore(ts);
    if (targetIndex < this.appliedIndex) {
      this.rebuildTo(targetIndex);
    } else {
      this.applyRange(this.appliedIndex + 1, targetIndex);
    }
    this._cursor = ts;
    if (this.atEdge) this.followHead = true;
  }

  /**
   * Advance the playhead by a presentation-time delta (ms).
   * If followHead is true and we are at the edge, the cursor stays pinned.
   */
  advance(dtMs: number): void {
    if (!this._cursor || this.items.length === 0) return;
    if (this.followHead && this.atEdge) return;

    let remaining = dtMs * this.speed;
    while (remaining > 0 && this.appliedIndex < this.liveIndex) {
      const nextItem = this.items[this.appliedIndex + 1];
      const nextTs = itemTs(nextItem);
      if (!nextTs) {
        this.applyOne();
        continue;
      }
      const realGap: number = nextTs.getTime() - this._cursor!.getTime();
      if (realGap <= 0) {
        this.applyOne();
        continue;
      }
      const compGap = this.compress ? compressGap(realGap) : realGap;
      if (remaining >= compGap) {
        this.applyOne();
        remaining -= compGap;
      } else {
        const frac = remaining / compGap;
        this._cursor = new Date(this._cursor.getTime() + realGap * frac);
        remaining = 0;
      }
    }
    if (this.appliedIndex >= this.liveIndex && this.items.length > 0) {
      this._cursor = itemTs(this.items[this.liveIndex]) ?? this._cursor;
      this.followHead = true;
    }
  }

  /**
   * Append new live items, preserving the current playhead unless followHead
   * is set, in which case we jump to the live edge.
   */
  append(items: ReplayItem[]): void {
    if (items.length === 0) return;
    const wasFollowing = this.followHead;
    this.items = sortItems([...this.items, ...items]);
    if (wasFollowing) {
      if (this.items.length > 0) {
        this.seek(itemTs(this.items[this.liveIndex]) ?? new Date());
      }
    } else if (this._cursor) {
      this.seek(this._cursor);
    }
  }

  private lastIndexAtOrBefore(ts: Date): number {
    let idx = -1;
    for (let i = 0; i < this.items.length; i++) {
      const t = itemTs(this.items[i]);
      if (t && t.getTime() <= ts.getTime()) idx = i;
      else break;
    }
    return idx;
  }

  private applyRange(start: number, end: number): void {
    for (let i = start; i <= end && i < this.items.length; i++) {
      this.applyItem(i);
    }
  }

  private applyOne(): void {
    this.applyItem(this.appliedIndex + 1);
  }

  private applyItem(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    const item = this.items[index];
    foldUpdate(this.model, item.update, this._cursor ?? undefined);
    this.appliedIndex = index;
    const ts = itemTs(item);
    if (ts) this._cursor = ts;
  }

  private rebuildTo(targetIndex: number): void {
    this.model = createSessionModel(this.model.sessionId);
    this.appliedIndex = -1;
    this.applyRange(0, targetIndex);
  }
}
