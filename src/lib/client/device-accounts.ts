// この端末でログインしたことのあるアカウント（ログイン画面の選択肢用）。
// サーバーには保存せず、この端末の localStorage にだけ置く。使えない環境では何もしない。

export type DeviceAccount = { userId: string; displayName: string; thumb: string | null; lastUsedAt: number };

const KEY = "condofit:accounts";
const EVENT = "condofit:accounts-changed";
const MAX = 8;

function read(): DeviceAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as DeviceAccount[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: DeviceAccount[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // 保存できない環境（プライベートモード等）では記憶しない
  }
}

export function rememberAccount(account: Omit<DeviceAccount, "lastUsedAt">) {
  const others = read().filter((a) => a.userId !== account.userId);
  write([{ ...account, lastUsedAt: Date.now() }, ...others].slice(0, MAX));
}

export function forgetAccount(userId: string) {
  write(read().filter((a) => a.userId !== userId));
}

// useSyncExternalStore 用
let cache: { raw: string | null; list: DeviceAccount[] } = { raw: null, list: [] };
export function getAccountsSnapshot(): DeviceAccount[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, list: read() };
  return cache.list;
}
const EMPTY: DeviceAccount[] = [];
export const getAccountsServerSnapshot = () => EMPTY;
export function subscribeAccounts(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** 画像URLを小さなJPEGのdata URLにする（端末に保存するサムネイル用） */
export async function toThumbnail(url: string, size = 96): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}
