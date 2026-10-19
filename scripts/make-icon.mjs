// 从用户提供的图标源文件（build/source-icon.png）生成多尺寸 icon.ico / icon.png。
// 复用 DSH 依赖里的 sharp（通过 createRequire 指向已装好的 node_modules）。
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SHARP_PKG = "D:/DeepSeek/deepseek-harness/node_modules/sharp";
const requireFromCheckout = createRequire(join(SHARP_PKG, "package.json"));
const sharp = requireFromCheckout("sharp");

const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  const outDir = resolve(__dirname, "..", "build");
  mkdirSync(outDir, { recursive: true });

  const source = process.argv[2] ?? join(outDir, "source-icon.png");
  if (!existsSync(source)) throw new Error(`图标源文件不存在: ${source}`);

  const pngs = new Map();
  for (const size of SIZES) {
    const buf = await sharp(source).resize(size, size).png().toBuffer();
    pngs.set(size, buf);
  }

  // 512 PNG 供预览及其它场景使用。
  writeFileSync(join(outDir, "icon.png"), await sharp(source).resize(512, 512).png().toBuffer());

  // 组装 ICO：ICONDIR + N 个 ICONDIRENTRY + PNG 数据（256 尺寸编码为 0）。
  const entries = [...pngs.entries()].sort((a, b) => b[0] - a[0]);
  const count = entries.length;
  const dirSize = 6 + 16 * count;
  const header = Buffer.alloc(dirSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  let offset = dirSize;
  const body = [];
  entries.forEach(([size, buf], i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e); // width
    header.writeUInt8(size >= 256 ? 0 : size, e + 1); // height
    header.writeUInt8(0, e + 2); // palette
    header.writeUInt8(0, e + 3); // reserved
    header.writeUInt16LE(1, e + 4); // color planes
    header.writeUInt16LE(32, e + 6); // bpp
    header.writeUInt32LE(buf.length, e + 8); // size
    header.writeUInt32LE(offset, e + 12); // offset
    offset += buf.length;
    body.push(buf);
  });

  const ico = Buffer.concat([header, ...body]);
  writeFileSync(join(outDir, "icon.ico"), ico);
  console.log(`icon.ico 已生成：${ico.length} bytes，${count} 个尺寸（来源 ${source}）`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
