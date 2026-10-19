// CondoCook の食材マスタの検索・当てはめ（純粋関数）。
// 「トリ」→ 鶏もも肉・鶏むね肉… のような候補出しと、レシピの材料名 → 食材の当てはめに使う

export type IngredientLike = { id: string; name: string; reading: string; aliases: string[] };

/** 比較用: 全角半角・カタカナ/ひらがな・大文字小文字・空白の違いを無視 */
/** 食材の分類（DB の check 制約と同じ並び） */
export const INGREDIENT_CATEGORIES = ["肉", "魚介", "野菜", "果物", "卵・乳製品", "豆腐・大豆製品", "米・パン・麺", "調味料", "乾物・粉", "その他"] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export function normalizeFood(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･]/g, "");
}

function keys(ing: IngredientLike): string[] {
  return [ing.name, ing.reading, ...ing.aliases].map(normalizeFood).filter(Boolean);
}

/**
 * 入力途中の文字列から食材の候補を出す。
 * 並び: 完全一致 → 前方一致（読み・名前・別名）→ 部分一致。同じ順位なら名前の短い順
 */
export function searchIngredients<T extends IngredientLike>(query: string, list: T[], limit = 20): T[] {
  const q = normalizeFood(query);
  if (!q) return [];
  const scored: { ing: T; score: number }[] = [];
  for (const ing of list) {
    const ks = keys(ing);
    const score = ks.some((k) => k === q) ? 0 : ks.some((k) => k.startsWith(q)) ? 1 : ks.some((k) => k.includes(q)) ? 2 : -1;
    if (score >= 0) scored.push({ ing, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || [...a.ing.name].length - [...b.ing.name].length)
    .slice(0, limit)
    .map((s) => s.ing);
}

/** レシピの材料名の飾りを外す（「鶏もも肉（皮なし）」→「鶏もも肉」、「★しょうゆ」→「しょうゆ」） */
export function cleanIngredientName(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\(.*?\)|【.*?】|\[.*?\]|<.*?>/g, "")
    .replace(/^[\s☆★○●◎◇◆□■▲△※*・･\-]+|^[a-zA-Z][\s.:)）]+/, "")
    .replace(/(お好みで|あれば|適量|少々)$/g, "")
    .trim();
}

/** 材料名に当てはまる食材（名前・読み・別名の完全一致）。飾りを外しても見つからなければ null */
export function matchIngredient<T extends IngredientLike>(raw: string, list: T[]): T | null {
  for (const candidate of [raw, cleanIngredientName(raw)]) {
    const q = normalizeFood(candidate);
    if (!q) continue;
    const hit = list.find((ing) => keys(ing).includes(q));
    if (hit) return hit;
  }
  return null;
}

/** 読みをひらがなにそろえる（カタカナ入力も可。ひらがなと長音以外は除く） */
export function cleanReading(raw: string): string {
  return normalizeFood(raw).replace(/[^ぁ-ゟー]/g, "").slice(0, 60);
}

/** 別名の入力（「、」「,」・改行区切り）を配列にする。名前と同じもの・重複は除く */
export function parseAliases(raw: string, name = ""): string[] {
  const seen = new Set([normalizeFood(name)]);
  const out: string[] = [];
  for (const a of raw.normalize("NFC").split(/[、,，\n]/)) {
    const alias = a.trim();
    if (!alias || [...alias].length > 30 || seen.has(normalizeFood(alias))) continue;
    seen.add(normalizeFood(alias));
    out.push(alias);
  }
  return out.slice(0, 20);
}

/** 統合したとき、統合先の別名に統合元の名前と別名を足す（統合元の名前でも見つかるように） */
export function mergeAliases(into: { name: string; aliases: string[] }, from: { name: string; aliases: string[] }): string[] {
  return parseAliases([...into.aliases, from.name, ...from.aliases].join("、"), into.name);
}
