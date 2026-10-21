import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractRecipeFromHtml,
  extractRecipeFromText,
  htmlToText,
  pageText,
  pageTitle,
  parseIsoMinutes,
  parseYield,
  splitIngredientLine,
  toIngredients,
} from "../src/lib/cook/import.ts";

const page = (ld: unknown, extra = "") =>
  `<html><head><meta property="og:site_name" content="サンプルレシピ">${extra}<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>本文</body></html>`;

test("extractRecipeFromHtml: @graph の中の Recipe を読み取る", () => {
  const html = page({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: "x" },
      {
        "@type": ["Recipe"],
        name: "親子丼 &amp; みそ汁",
        recipeYield: "2人分",
        totalTime: "PT25M",
        recipeIngredient: ["鶏もも肉 1枚", "卵　3個", "■タレ", "しょうゆ 大さじ 2", "みりん…大さじ1", "三つ葉 適量"],
        recipeInstructions: [
          { "@type": "HowToSection", name: "下ごしらえ", itemListElement: [{ "@type": "HowToStep", text: "鶏肉を切る" }] },
          { "@type": "HowToStep", text: "煮る<br>卵でとじる" },
        ],
      },
    ],
  });
  const r = extractRecipeFromHtml(html);
  assert.ok(r);
  assert.equal(r.title, "親子丼 & みそ汁");
  assert.equal(r.servings, 2);
  assert.equal(r.cookMinutes, 25);
  assert.equal(r.sourceName, "サンプルレシピ");
  assert.deepEqual(r.ingredients, [
    { name: "鶏もも肉", amount: "1枚", section: null },
    { name: "卵", amount: "3個", section: null },
    { name: "しょうゆ", amount: "大さじ2", section: "タレ" },
    { name: "みりん", amount: "大さじ1", section: "タレ" },
    { name: "三つ葉", amount: "適量", section: "タレ" },
  ]);
  assert.deepEqual(r.steps, ["鶏肉を切る", "煮る", "卵でとじる"]);
});

test("extractRecipeFromHtml: Recipe がない・壊れたJSONは null", () => {
  assert.equal(extractRecipeFromHtml("<html>なし</html>"), null);
  assert.equal(extractRecipeFromHtml('<script type="application/ld+json">{壊れ</script>'), null);
  assert.equal(extractRecipeFromHtml(page({ "@type": "Article", name: "x" })), null);
  assert.equal(extractRecipeFromHtml(page({ "@type": "Recipe", name: "材料なし", recipeIngredient: [] })), null);
});

test("extractRecipeFromHtml: publisher の名前を出典に、手順が1つの文字列でも分ける", () => {
  const r = extractRecipeFromHtml(
    page({ "@type": "Recipe", name: "A", publisher: { name: "Pub" }, recipeIngredient: ["塩 少々"], recipeInstructions: "切る\n焼く" }),
  );
  assert.equal(r?.sourceName, "Pub");
  assert.deepEqual(r?.steps, ["切る", "焼く"]);
});

test("splitIngredientLine / toIngredients", () => {
  assert.deepEqual(splitIngredientLine("豚バラ肉 200g"), { name: "豚バラ肉", amount: "200g" });
  assert.deepEqual(splitIngredientLine("★砂糖：小さじ1/2"), { name: "★砂糖", amount: "小さじ1/2" });
  assert.deepEqual(splitIngredientLine("塩こしょう 少々"), { name: "塩こしょう", amount: "少々" });
  assert.deepEqual(splitIngredientLine("お好みのきのこ"), { name: "お好みのきのこ", amount: "" });
  assert.deepEqual(splitIngredientLine("サラダ油 (炒め用)"), { name: "サラダ油 (炒め用)", amount: "" });
  assert.deepEqual(toIngredients(["【A】", "酒 大さじ1", ""]), [{ name: "酒", amount: "大さじ1", section: "A" }]);
});

test("parseIsoMinutes / parseYield / htmlToText / pageText", () => {
  assert.equal(parseIsoMinutes("PT1H30M"), 90);
  assert.equal(parseIsoMinutes("P0DT0H45M"), 45);
  assert.equal(parseIsoMinutes("30分"), null);
  assert.equal(parseIsoMinutes("PT0M"), null);
  assert.equal(parseYield(["4", "4人前"]), 4);
  assert.equal(parseYield(3), 3);
  assert.equal(parseYield("約２〜３人分"), 2);
  assert.equal(parseYield("たくさん"), null);
  assert.equal(htmlToText("<b>A</b>&#x3042;&#12354;&nbsp;"), "Aああ");
  assert.equal(pageText("<script>x()</script><p>材料</p><p>手順</p>"), "材料\n手順");
});

test("htmlToText / pageText: 属性の値に「>」があるタグも外す（広告のコードを本文に残さない）", () => {
  const html = "<div data-selector='body > div:eq(2)' data-code='PGRpdj4='>本文</div><p>材料</p>";
  assert.equal(htmlToText(html), "本文材料");
  assert.equal(pageText(html), "本文\n材料");
  assert.equal(htmlToText("A&mdash;B&hellip;"), "A—B…");
});

test("pageTitle: サイト名を外す", () => {
  assert.equal(pageTitle("<title>至高の焼きそば - 料理研究家リュウジのバズレシピ.com</title>"), "至高の焼きそば");
  assert.equal(pageTitle('<meta property="og:title" content="【簡単】親子丼 | うちのごはん">'), "【簡単】親子丼");
  assert.equal(pageTitle("<p>題名なし</p>"), null);
});

test("extractRecipeFromText: 「【材料】」「【作り方】」のブログ形式", () => {
  const text = [
    "至高の焼きそば",
    "レシピはこちら！",
    "【材料（2人分）】",
    "焼きそば麺…1袋（150gのもの）",
    "豚バラ肉…80g",
    "キャベツ…1／8個",
    "（麺を焼く際と野菜を炒める際、2回に分けて使います）",
    "■タレ",
    "ウスターソース…大さじ1",
    "【作り方】",
    "1. 麺は予め",
    "油小2で両面焼いておく",
    "豚肉、キャベツを焼き、",
    "麺とソースを入れる",
    "▼詳しい作り方は動画をご覧ください。",
    "関係ない文章",
  ].join("\n");
  const r = extractRecipeFromText(text, "至高の焼きそば")!;
  assert.equal(r.servings, 2);
  assert.deepEqual(r.ingredients.map((i) => [i.name, i.amount, i.section]), [
    ["焼きそば麺", "1袋（150gのもの）", null],
    ["豚バラ肉", "80g", null],
    ["キャベツ", "1／8個", null],
    ["ウスターソース", "大さじ1", "タレ"],
  ]);
  assert.deepEqual(r.steps, ["麺は予め", "油小2で両面焼いておく", "豚肉、キャベツを焼き、麺とソースを入れる"], "読点で終わる行は次の行とまとめる。▼から先は読まない");
  assert.equal(extractRecipeFromText("材料\n塩", null), null, "分量のある材料が2つ未満なら読まない");
  assert.equal(extractRecipeFromText("今日のごはん\nおいしかった", null), null);
});
