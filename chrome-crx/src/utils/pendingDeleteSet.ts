export class PendingDeleteSet {
  private readonly versions = new Map<string, number>();

  mark(key: string, revision: number): void {
    this.versions.set(key, revision);
  }

  clear(key: string): void {
    this.versions.delete(key);
  }

  applyTo<T>(state: Record<string, T>): Record<string, T> {
    for (const key of this.versions.keys()) {
      delete state[key];
    }
    return state;
  }
}
