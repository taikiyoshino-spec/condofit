import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CondoFit",
    short_name: "CondoFit",
    description: "今度Fit行こう！",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#1f8a4c",
    lang: "ja",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
