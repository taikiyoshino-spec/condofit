import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import { checkImportUrl, isPrivateAddress } from "./net.ts";

// レシピサイトのページを取得する（URL取り込み用）。
// - 接続する瞬間に名前解決の結果を確かめ、社内・ローカルのアドレスには接続しない（DNS をすり替えられても防げる）
// - リダイレクトは3回まで（行き先も毎回確認）、8秒で打ち切り、2MBまで

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as unknown as LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "", 4);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

type Raw = { status: number; location?: string; contentType: string; body: Buffer };

function request(url: URL): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CondoCook/1.0; recipe import)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ja,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType: "", body: Buffer.alloc(0) });
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy(new Error("too large"));
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => resolve({ status, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) }));
        stream.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** 文字コード（Content-Type か meta charset。日本のサイトの Shift_JIS・EUC-JP にも対応） */
function decode(body: Buffer, contentType: string): string {
  const head = body.subarray(0, 4096).toString("latin1");
  const label =
    contentType.match(/charset=["']?([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(label.toLowerCase()).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export type FetchPageResult = { ok: true; html: string; finalUrl: string } | { ok: false; error: string };

export async function fetchRecipePage(rawUrl: string): Promise<FetchPageResult> {
  let check = checkImportUrl(rawUrl);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!check.ok) return check;
    let res: Raw;
    try {
      res = await request(check.url);
    } catch (e) {
      const code = (e as { code?: string }).code;
      return { ok: false, error: code === "EBLOCKED" ? "このURLは使えません" : "ページを開けませんでした" };
    }
    if (res.status >= 300 && res.status < 400 && res.location) {
      check = checkImportUrl(new URL(res.location, check.url).toString());
      continue;
    }
    if (res.status !== 200) return { ok: false, error: `ページを開けませんでした（${res.status}）` };
    if (!/html|xml/i.test(res.contentType)) return { ok: false, error: "レシピのページではないようです" };
    return { ok: true, html: decode(res.body, res.contentType), finalUrl: check.url.toString() };
  }
  return { ok: false, error: "ページを開けませんでした（転送が多すぎます）" };
}
