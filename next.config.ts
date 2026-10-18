import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
