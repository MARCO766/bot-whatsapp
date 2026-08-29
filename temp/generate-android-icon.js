const fs = require("fs");
const path = require("path");
const sharp = require("./node_modules/sharp");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(__dirname, "icon-preview.png");
const OUT_DIR = path.join(ROOT, "macbot-android", "app", "src", "main", "res");

function makeTransparentForeground(buffer, width, height) {
  const out = Buffer.from(buffer);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const isGreen = g > 80 && g > r + 18 && g > b + 10;
    const isDark = lum < 42 && !isGreen;
    if (isDark) {
      out[i + 3] = 0;
    }
  }
  return out;
}

async function buildForeground(size) {
  const inset = Math.round(size * 0.16);
  const inner = size - inset * 2;

  const { data, info } = await sharp(SOURCE)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const transparent = makeTransparentForeground(data, info.width, info.height);

  return sharp(transparent, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extend({
      top: inset,
      bottom: inset,
      left: inset,
      right: inset,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function buildBackground(size) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 10, g: 16, b: 24, alpha: 255 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 15, g: 26, b: 18, alpha: 255 },
          },
        })
          .png()
          .toBuffer(),
        blend: "over",
      },
    ])
    .png()
    .toBuffer();
}

async function buildSplashLogo(size) {
  const inset = Math.round(size * 0.22);
  const inner = size - inset * 2;
  const { data, info } = await sharp(SOURCE)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const transparent = makeTransparentForeground(data, info.width, info.height);
  return sharp(transparent, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extend({
      top: inset,
      bottom: inset,
      left: inset,
      right: inset,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function main() {
  const foreground432 = await buildForeground(432);
  const splash288 = await buildSplashLogo(288);

  const drawableDir = path.join(OUT_DIR, "drawable-nodpi");
  fs.mkdirSync(drawableDir, { recursive: true });

  await sharp(foreground432).toFile(path.join(drawableDir, "ic_macbot_logo.png"));
  await sharp(splash288).toFile(path.join(drawableDir, "ic_macbot_splash_logo.png"));

  const preview = path.join(__dirname, "icon-generated-preview.png");
  await sharp(foreground432)
    .flatten({ background: "#0A1018" })
    .toFile(preview);

  console.log("Generated:");
  console.log(" - drawable-nodpi/ic_macbot_logo.png");
  console.log(" - drawable-nodpi/ic_macbot_splash_logo.png");
  console.log(" - temp/icon-generated-preview.png");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
