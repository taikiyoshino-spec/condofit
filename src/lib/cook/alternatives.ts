// 材料の「または」（純粋関数）。orPrevious の材料は直前の材料の代わりで、続けて並んだものを1つのまとまりにする

/** 材料を「または」のまとまりに分ける（まとまりのない材料は1つだけのまとまり） */
export function alternativeGroups<T extends { orPrevious?: boolean }>(ingredients: T[]): T[][] {
  const groups: T[][] = [];
  for (const ing of ingredients) {
    const last = groups[groups.length - 1];
    if (ing.orPrevious && last) last.push(ing);
    else groups.push([ing]);
  }
  return groups;
}
