// this file has some copied and pasted code from typedoc. these classes/functions
// were not exported out of typedoc but were useful

// https://github.com/TypeStrong/typedoc/blob/1269e3ab6d169e89724328ada21a14ecaba89525/src/lib/utils-common/map.ts#L1
export class DefaultMap<K, V> extends Map<K, V> {
  constructor(private creator: (key: K) => V) {
    super();
  }

  override get(key: K): V {
    const saved = super.get(key);
    if (saved != null) {
        return saved;
    }

    const created = this.creator(key);
    this.set(key, created);
    return created;
  }

  getNoInsert(key: K): V | undefined {
    return super.get(key);
  }
}

// https://github.com/TypeStrong/typedoc/blob/1269e3ab6d169e89724328ada21a14ecaba89525/src/lib/utils-common/array.ts#L121
export function* zip<T extends Iterable<any>[]>(
  ...args: T
): Iterable<{ [K in keyof T]: T[K] extends Iterable<infer U> ? U : T[K] }> {
  const iterators = args.map((x) => x[Symbol.iterator]());

  for (;;) {
    const next = iterators.map((i) => i.next());
    if (next.some((v) => v.done)) {
      break;
    }
    yield next.map((v) => v.value) as any;
  }
}
