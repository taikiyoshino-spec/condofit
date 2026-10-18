// 材料の分量の文字列（「300g」「大さじ1と1/2」「少々」）を数値と単位に分け、人数分に換算する（RECIPE_SPEC.md D18）

export type ParsedAmount = { quantity: number; unit: string; prefix: boolean } | null;

// 数字の前に付く単位（大さじ1、小さじ½、カップ1）
const PREFIX_UNITS = ["大さじ", "小さじ", "カップ", "大匙", "小匙"];

/** 「1と1/2」「1 1/2」「1/2」「1.5」→ 数値 */
function parseNumberPart(s: string): number | null {
  const t = s.replace(/\s+/g, " ").trim();
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(?:と|\s)\s*(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2]);
  m = t.match(/^\d+(?:\.\d+)?$/);
  if (m) return Number(t);
  return null;
}

const NUM = String.raw`(\d+(?:\.\d+)?\s*(?:と|\s)\s*\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;

/**
 * 分量の文字列を数値と単位に分ける。「少々」「適量」や「2〜3本」のような範囲は null（換算しない）
 * prefix: 単位が数字の前に付くか（大さじ1）
 */
export function parseAmount(raw: string): ParsedAmount {
  // NFKC は「½」を「1⁄2」に変えてしまうので、先に「1と1/2」の形にしておく
  const s = raw
    .replace(/(\d?)([½⅓⅔¼¾⅛])/g, (_, d: string, f: string) => {
      const frac = { "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅛": "1/8" }[f];
      return d ? `${d}と${frac}` : frac!;
    })
    .normalize("NFKC")
    .replace(/⁄/g, "/")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || /[〜~～\-－]/.test(s.replace(/^-/, ""))) return null;
  const pre = s.match(new RegExp(`^(${PREFIX_UNITS.join("|")})\\s*${NUM}$`));
  if (pre) {
    const q = parseNumberPart(pre[2]);
    return q === null ? null : { quantity: q, unit: pre[1].replace("大匙", "大さじ").replace("小匙", "小さじ"), prefix: true };
  }
  const post = s.match(new RegExp(`^${NUM}\\s*([^\\d\\s/][^\\d/]{0,9})?$`));
  if (post) {
    const q = parseNumberPart(post[1]);
    return q === null ? null : { quantity: q, unit: (post[2] ?? "").trim(), prefix: false };
  }
  return null;
}

/** 数値の表示（大さじ・小さじ・カップは 1/2・1/3・1/4 刻みの分数、それ以外は小数1桁まで） */
function formatQuantity(q: number, unit: string): string {
  if (["大さじ", "小さじ", "カップ"].includes(unit)) {
    const whole = Math.floor(q + 1e-9);
    const frac = q - whole;
    const options: [number, string][] = [[0, ""], [0.25, "1/4"], [1 / 3, "1/3"], [0.5, "1/2"], [2 / 3, "2/3"], [0.75, "3/4"], [1, ""]];
    const [best, label] = options.reduce((a, b) => (Math.abs(b[0] - frac) < Math.abs(a[0] - frac) ? b : a));
    const w = best === 1 ? whole + 1 : whole;
    if (!label) return String(w);
    return w > 0 ? `${w}と${label}` : label;
  }
  const rounded = q >= 10 ? Math.round(q) : Math.round(q * 10) / 10;
  return String(rounded);
}

/** 分量を factor 倍した表示。数値と単位に分けられないもの（「少々」「2〜3本」）は元の文字列のまま */
export function scaleAmount(amount: string, factor: number): string {
  if (factor === 1) return amount;
  const p = parseAmount(amount);
  if (!p) return amount;
  const q = formatQuantity(p.quantity * factor, p.unit);
  return p.prefix ? `${p.unit}${q}` : `${q}${p.unit}`;
}
