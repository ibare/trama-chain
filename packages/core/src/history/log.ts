import type { Model } from '../model/index.js';
import type { Operation } from './types.js';

/**
 * 단순 stack 기반 undo/redo. v1엔 무제한 깊이.
 * UI store가 이 객체를 들고 있다가 mutation마다 record를 호출.
 */
export class OperationLog {
  private undoStack: Operation[] = [];
  private redoStack: Operation[] = [];

  record(op: Operation): void {
    this.undoStack.push(op);
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** undo: 가장 최근 op의 before 상태를 반환하고, 그 op을 redo stack으로 옮긴다. */
  undo(): Model | null {
    const op = this.undoStack.pop();
    if (!op) return null;
    this.redoStack.push(op);
    return op.before;
  }

  /** redo: 가장 최근에 undo된 op의 after 상태를 반환하고, 다시 undo stack으로. */
  redo(): Model | null {
    const op = this.redoStack.pop();
    if (!op) return null;
    this.undoStack.push(op);
    return op.after;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** 직전 op과 같은 kind/nodeId면 coalesce 가능. 스크럽 1회를 한 undo 단위로 묶을 때 사용. */
  coalesceWithLast(op: Operation): boolean {
    const last = this.undoStack[this.undoStack.length - 1];
    if (!last) return false;
    if (last.kind !== op.kind) return false;
    if (last.meta?.nodeId !== op.meta?.nodeId) return false;
    if (last.meta?.edgeId !== op.meta?.edgeId) return false;
    // before는 그대로 두고 after만 갱신
    this.undoStack[this.undoStack.length - 1] = {
      ...last,
      after: op.after,
      label: op.label,
    };
    this.redoStack = [];
    return true;
  }

  /** 현재 상태 (디버그용) */
  depth(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }
}
