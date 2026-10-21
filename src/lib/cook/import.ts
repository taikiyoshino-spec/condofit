// レシピサイトのページから、埋め込まれた構造化データ（JSON-LD の schema.org/Recipe）を読み取る（純粋関数）。
// 取り込むのは料理名・材料・分量・作り方・何人分・時間・出典まで。写真は取り込まない（RECIPE_SPEC.md D12）

export type ImportedIngredient = { name: string; amount: string; section: string | null };
export type ImportedRecipe = {
  title: string;
  servings: number | null;
  cookMinutes: number | null;
  sourceName: string | null;
  ingredients: ImportedIngredient[];
  steps: string[];
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  middot: "・",
  times: "×",
};

/** タグの中身（属性の値に「>」があっても、引用符の中は1つの値として読む） */
const TAG_BODY = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
const ANY_TAG = new RegExp(`<${TAG_BODY}>`, "g");

/** HTMLのタグと文字参照を外したテキスト */
export function htmlToText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(ANY_TAG, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t　]+/g, " ")
    .trim();
}

function isType(node: unknown, type: string): boolean {
  if (!node || typeof node !== "object") return false;
  const t = (node as { "@type"?: unknown })["@type"];
  return Array.isArray(t) ? t.includes(type) : t === type;
}

/** JSON-LD（配列・@graph・入れ子）から Recipe を探す */
function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findRecipe(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (isType(node, "Recipe")) return node as Record<string, unknown>;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement"]) {
    const hit = findRecipe((node as Record<string, unknown>)[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** ISO 8601 の時間（PT1H30M）→ 分 */
export function parseIsoMinutes(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return null;
  const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Math.round(Number(m[4] ?? 0) / 60);
  return minutes > 0 && minutes <= 1440 ? minutes : null;
}

/** 「2人分」「4 servings」「["2", "2人前"]」→ 2 */
export function parseYield(v: unknown): number | null {
  const first = Array.isArray(v) ? v[0] : v;
  const n = typeof first === "number" ? first : Number(String(first ?? "").normalize("NFKC").match(/\d+/)?.[0]);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}

const AMOUNT_HINT = /\d|[½⅓⅔¼¾]|少々|少量|適量|適宜|ひとつまみ|お好み|大さじ|小さじ|カップ|ひとかけ|ひと片|ひとつ|半分|一つ|一個|一本|一枚|一片/;
const HEADING_MARK = /^[\s]*(?:[■□◆◇●○◎★☆▼▽※]|【.*】$|<.*>$|＜.*＞$|\[.*\]$)/;

/**
 * 材料の1行（「鶏もも肉 300g」「★しょうゆ…大さじ2」）を名前と分量に分ける。
 * 分量らしい部分がなければ全体を名前にする
 */
export function splitIngredientLine(line: string): { name: string; amount: string } {
  const s = htmlToText(line).replace(/[…‥]+|・{2,}|\.{3,}|：|:/g, " ").replace(/\s+/g, " ").trim();
  const i = s.lastIndexOf(" ");
  if (i > 0) {
    const tail = s.slice(i + 1);
    // 「大さじ 2」のように単位と数字の間に空白がある場合はまとめて分量にする
    const j = s.lastIndexOf(" ", i - 1);
    const tail2 = j > 0 ? s.slice(j + 1) : "";
    if (j > 0 && /^(大さじ|小さじ|カップ)\s/.test(tail2)) return { name: s.slice(0, j).trim(), amount: tail2.replace(/\s/, "") };
    if (AMOUNT_HINT.test(tail)) return { name: s.slice(0, i).trim(), amount: tail };
  }
  return { name: s, amount: "" };
}

/** 材料の行の並び → 材料（「■タレ」「【A】」のような見出しの行はまとまりにする） */
export function toIngredients(lines: string[]): ImportedIngredient[] {
  const out: ImportedIngredient[] = [];
  let section: string | null = null;
  for (const raw of lines) {
    const text = htmlToText(raw);
    if (!text) continue;
    const { name, amount } = splitIngredientLine(text);
    if (!amount && HEADING_MARK.test(text)) {
      section = text.replace(/^[\s■□◆◇●○◎★☆▼▽※]+/, "").replace(/^[【<＜[]|[】>＞\]]$/g, "").trim().slice(0, 20) || null;
      continue;
    }
    out.push({ name: name.slice(0, 60), amount: amount.slice(0, 30), section });
  }
  return out;
}

/** recipeInstructions（文字列・HowToStep・HowToSection の入れ子）→ 手順の文 */
function toSteps(v: unknown, depth = 0): string[] {
  if (!v || depth > 4) return [];
  if (typeof v === "string") return htmlToText(v).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap((x) => toSteps(x, depth + 1));
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (isType(o, "HowToSection") || o.itemListElement) return toSteps(o.itemListElement, depth + 1);
    if (typeof o.text === "string") return toSteps(o.text, depth + 1);
    if (typeof o.name === "string") return toSteps(o.name, depth + 1);
  }
  return [];
}

/** ページのHTMLから JSON-LD のレシピを読み取る。見つからなければ null */
export function extractRecipeFromHtml(html: string): ImportedRecipe | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block.trim());
    } catch {
      continue;
    }
    const r = findRecipe(data);
    if (!r) continue;
    const title = htmlToText(String(r.name ?? "")).slice(0, 60);
    const lines = Array.isArray(r.recipeIngredient) ? r.recipeIngredient.map(String) : [];
    const ingredients = toIngredients(lines);
    const steps = toSteps(r.recipeInstructions).map((s) => s.slice(0, 500)).slice(0, 40);
    if (!title || ingredients.length === 0) continue;
    const publisher = r.publisher as { name?: unknown } | undefined;
    return {
      title,
      servings: parseYield(r.recipeYield),
      cookMinutes: parseIsoMinutes(r.totalTime) ?? parseIsoMinutes(r.cookTime),
      sourceName: typeof publisher?.name === "string" ? htmlToText(publisher.name).slice(0, 60) : siteName(html),
      ingredients: ingredients.slice(0, 60),
      steps,
    };
  }
  return null;
}

/** og:site_name（出典の表示用） */
export function siteName(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  return m ? htmlToText(m[1]).slice(0, 60) : null;
}

/** AIに渡すためのページ本文（scriptやstyleを除いたテキスト。長すぎる分は切る） */
export function pageText(html: string, maxChars = 12000): string {
  const body = html
    .replace(/<(script|style|noscript|svg|header|footer|nav)[\s\S]*?<\/\1>/gi, " ")
    .replace(new RegExp(`<(p|div|li|br|h\\d|tr)\\b${TAG_BODY}>`, "gi"), "\n");
  return htmlToText(body).replace(/\n\s*\n+/g, "\n").slice(0, maxChars);
}

/** ページの題名（og:title か <title>。「 - サイト名」「 | サイト名」は外す） */
export function pageTitle(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const title = htmlToText(m[1]).split(/\s+[-|｜–—]\s+/)[0].trim();
  return title ? title.slice(0, 60) : null;
}

const SECTION_OPEN = String.raw`^[\s【［\[■□◆◇●○◎★☆<＜《]*`;
const SECTION_CLOSE = String.raw`[】］\]>＞》]?[\s:：]*$`;
const INGREDIENTS_HEAD = new RegExp(`${SECTION_OPEN}(?:材料|食材)${String.raw`\s*`}(?:[（(]([^）)]*)[）)])?${SECTION_CLOSE}`);
const STEPS_HEAD = new RegExp(`${SECTION_OPEN}(?:作り方|つくり方|手順|調理方法)${SECTION_CLOSE}`);
// 作り方の終わり（動画・ポイント・コツなどの案内や、別の見出し）
const STEPS_END = /^[\s]*(?:[▼▽]|【|■|◆|●|★|※|ポイント|コツ|動画|詳しい作り方|お気に入り|最新情報|コメント)/;

/**
 * 構造化データのないブログ形式のページ（「【材料】」「【作り方】」の見出しの下に1行ずつ書いたもの）を読み取る。
 * AIが使えない・読み取れなかったときの代わり。材料が2つ以上読めなければ null
 */
export function extractRecipeFromText(text: string, title: string | null): ImportedRecipe | null {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const start = lines.findIndex((l) => INGREDIENTS_HEAD.test(l));
  if (start < 0) return null;
  const servings = parseYield(lines[start].match(INGREDIENTS_HEAD)?.[1]);
  const stepsAt = lines.findIndex((l, i) => i > start && STEPS_HEAD.test(l));
  const ingredientLines = lines
    .slice(start + 1, stepsAt > 0 ? stepsAt : start + 40)
    // 「（麺を焼く際と…）」のような補足の行は材料にしない
    .filter((l) => !/^[（(].*[）)]$/.test(l));
  const ingredients = toIngredients(ingredientLines).filter((i) => i.name);
  if (ingredients.filter((i) => i.amount).length < 2) return null;

  const steps: string[] = [];
  if (stepsAt > 0) {
    let current = "";
    for (const line of lines.slice(stepsAt + 1)) {
      if (STEPS_END.test(line) || steps.length >= 30) break;
      const body = line.replace(/^(?:\d+[.．)）、]|[①-⑳])\s*/, "");
      current += body;
      // 読点や助詞で終わる行は、次の行に続く文として1つの手順にまとめる
      if (/[、，をはにでとがもやのへ]$/.test(body)) continue;
      steps.push(current.slice(0, 500));
      current = "";
    }
    if (current) steps.push(current.slice(0, 500));
  }
  return {
    title: title ?? "取り込んだレシピ",
    servings,
    cookMinutes: null,
    sourceName: null,
    ingredients: ingredients.slice(0, 60),
    steps,
  };
}
