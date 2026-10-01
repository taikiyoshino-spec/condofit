// 順位付け（純粋関数）。同じ値は同じ順位にする（1位・1位・3位）

export type Ranked<T> = T & { rank: number };

/** compare は「良い方を前に」並べる比較関数。0 を返す組は同順位 */
export function assignRanks<T>(items: T[], compare: (a: T, b: T) => number): Ranked<T>[] {
  const sorted = [...items].sort(compare);
  const result: Ranked<T>[] = [];
  sorted.forEach((item, i) => {
    const prev = result[i - 1];
    const rank = prev && compare(sorted[i - 1], item) === 0 ? prev.rank : i + 1;
    result.push({ ...item, rank });
  });
  return result;
}

/** 数値の大きい順（null は最後） */
export function byDesc<T>(...keys: ((x: T) => number | null)[]) {
  return (a: T, b: T) => {
    for (const key of keys) {
      const av = key(a) ?? -Infinity;
      const bv = key(b) ?? -Infinity;
      if (av !== bv) return bv - av;
    }
    return 0;
  };
}
