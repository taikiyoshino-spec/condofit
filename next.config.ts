import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 写真・スクリーンショットからのレシピの取り込み（端末で縮小した画像を3枚まで）とレシピの写真のため。Vercel の上限 4.5MB の内側
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 位置情報は自サイトのみ。マイクは CondoCook の作るモードの音声操作用に自サイトのみ許可
          // （/cook だけにすると、ログイン後に画面を読み込み直さずに /cook へ移ったとき効かないため全体で指定。使うときは利用者の許可が必要）
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(self)" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
