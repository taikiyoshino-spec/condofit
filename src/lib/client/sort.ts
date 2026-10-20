// 並べ替え（純粋関数）。長押しで持ち上げた行を、指の位置の行の前・後ろへ動かす

/** fromKey の要素を、toKey の要素の前（after = false）・後ろ（after = true）へ動かす。変わらなければ同じ配列を返す */
export function moveKeyTo<T extends { key: number }>(list: T[], fromKey: number, toKey: number, after: boolean): T[] {
  if (fromKey === toKey) return list;
  const from = list.findIndex((x) => x.key === fromKey);
  if (from < 0 || list.findIndex((x) => x.key === toKey) < 0) return list;
  const rest = list.filter((x) => x.key !== fromKey);
  const to = rest.findIndex((x) => x.key === toKey) + (after ? 1 : 0);
  const next = [...rest.slice(0, to), list[from], ...rest.slice(to)];
  return next.every((x, i) => x === list[i]) ? list : next;
}
