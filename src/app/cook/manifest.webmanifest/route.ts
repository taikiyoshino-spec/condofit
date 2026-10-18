// CondoCook 用のマニフェスト（ホーム画面に CondoFit とは別のアプリとして追加できるように）。
// マニフェストのファイル規約はアプリのルートにしか置けないため、ルートハンドラで返す
export function GET() {
  const manifest = {
    name: "CondoCook",
    short_name: "CondoCook",
    description: "仲間のレシピで、今日なに作る？",
    id: "/cook",
    start_url: "/cook",
    scope: "/cook",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#b9501a",
    lang: "ja",
    icons: [
      { src: "/icons/cook-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/cook-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/cook-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
