import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  getStorageValue: vi.fn(),
  setStorageValue: vi.fn()
}));

vi.mock('../extensionServices', () => storageMocks);

import { PersistentDeadlineStore, type DeadlineState } from './persistentDeadlineStore';

type Kind = 'deadline';
type RecordValue = { dueAt: number };

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createStore() {
  return new PersistentDeadlineStore<Kind, RecordValue>({
    storageKey: 'deadlines',
    kinds: ['deadline'],
    emptyState: { deadline: {} },
    loadState: (stored): DeadlineState<Kind, RecordValue> =>
      (stored as DeadlineState<Kind, RecordValue>) ?? { deadline: {} }
  });
}

async function flushPromises(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('PersistentDeadlineStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.getStorageValue.mockResolvedValue(undefined);
    storageMocks.setStorageValue.mockResolvedValue(undefined);
  });

  it('serializes storage writes so older snapshots cannot overwrite newer deadlines', async () => {
    const firstWrite = createDeferred();
    storageMocks.setStorageValue
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValueOnce(undefined);
    const store = createStore();

    store.set('deadline', 'tab:1', { dueAt: 1 });
    await flushPromises();

    expect(storageMocks.setStorageValue).toHaveBeenCalledTimes(1);
    expect(storageMocks.setStorageValue).toHaveBeenNthCalledWith(1, 'deadlines', {
      deadline: { 'tab:1': { dueAt: 1 } }
    });

    store.set('deadline', 'tab:2', { dueAt: 2 });
    await flushPromises();

    expect(storageMocks.setStorageValue).toHaveBeenCalledTimes(1);

    firstWrite.resolve();
    await firstWrite.promise;
    await flushPromises();

    expect(storageMocks.setStorageValue).toHaveBeenCalledTimes(2);
    expect(storageMocks.setStorageValue).toHaveBeenNthCalledWith(2, 'deadlines', {
      deadline: {
        'tab:1': { dueAt: 1 },
        'tab:2': { dueAt: 2 }
      }
    });
  });

  it('continues persisting after a synchronous serialization failure', async () => {
    const serializeState = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('serialize failed');
      })
      .mockImplementation((state: DeadlineState<Kind, RecordValue>) => state);
    const store = new PersistentDeadlineStore<Kind, RecordValue>({
      storageKey: 'deadlines',
      kinds: ['deadline'],
      emptyState: { deadline: {} },
      loadState: (stored): DeadlineState<Kind, RecordValue> =>
        (stored as DeadlineState<Kind, RecordValue>) ?? { deadline: {} },
      serializeState
    });

    store.set('deadline', 'tab:1', { dueAt: 1 });
    await flushPromises();
    expect(storageMocks.setStorageValue).not.toHaveBeenCalled();

    store.set('deadline', 'tab:2', { dueAt: 2 });
    await flushPromises();

    expect(storageMocks.setStorageValue).toHaveBeenCalledWith('deadlines', {
      deadline: {
        'tab:1': { dueAt: 1 },
        'tab:2': { dueAt: 2 }
      }
    });
  });
});
