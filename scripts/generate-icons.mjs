// PWA用のシンプルなアイコンを生成する。画像ツールなしで PNG を直接書き出す。
// CondoFit: 緑地に白いリング（"C"）、CondoCook: オレンジ地に白いお椀
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, { maskable = false, cook = false } = {}) {
  const bg = cook ? [0xb9, 0x50, 0x1a] : [0x1f, 0x8a, 0x4c];
  const fg = [0xff, 0xff, 0xff];
  const c = size / 2;
  const scale = maskable ? 0.8 : 1; // maskable はセーフゾーン内に収める
  const outer = size * 0.3 * scale;
  const inner = size * 0.18 * scale;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      // 右下を欠いたリング（"C"）
      const gap = x > c && y > c - size * 0.05 && y < c + size * 0.05;
      // お椀: 下半分の円＋縁、上に湯気の線2本
      const yy = y + 0.5 - c;
      const bowl = yy >= -size * 0.02 * scale && d <= outer;
      const rim = Math.abs(yy + size * 0.02 * scale) <= size * 0.025 * scale && Math.abs(x + 0.5 - c) <= outer * 1.1;
      const steam = [-0.08, 0.08].some(
        (dx) => Math.abs(x + 0.5 - (c + size * dx * scale + Math.sin((yy / size) * 18) * size * 0.015)) <= size * 0.018 * scale &&
          yy < -size * 0.08 * scale && yy > -size * 0.3 * scale,
      );
      const on = cook ? bowl || rim || steam : d <= outer && d >= inner && !gap;
      row.push(...(on ? fg : bg));
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync("public/icons/icon-192.png", png(192));
writeFileSync("public/icons/icon-512.png", png(512));
writeFileSync("public/icons/icon-maskable-512.png", png(512, { maskable: true }));
writeFileSync("public/icons/apple-touch-icon.png", png(180));
writeFileSync("public/icons/cook-192.png", png(192, { cook: true }));
writeFileSync("public/icons/cook-512.png", png(512, { cook: true }));
writeFileSync("public/icons/cook-maskable-512.png", png(512, { maskable: true, cook: true }));
writeFileSync("public/icons/cook-apple-touch-icon.png", png(180, { cook: true }));
console.log("icons generated");
