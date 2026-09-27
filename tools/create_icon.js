"use strict";

const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(__dirname, "logo-icon-source.png");
const destination = path.join(projectRoot, "app.ico");

async function createIcon() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = [];

  for (const size of sizes) {
    const padding = Math.max(1, Math.round(size * 0.07));
    const innerSize = size - (padding * 2);
    const { data: grayscale, info } = await sharp(source)
      .resize(size - (padding * 2), size - (padding * 2), { fit: "contain" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rgba = Buffer.alloc(innerSize * innerSize * 4);
    for (let pixel = 0; pixel < innerSize * innerSize; pixel += 1) {
      const luminance = grayscale[pixel * info.channels];
      const output = pixel * 4;
      rgba[output] = 24;
      rgba[output + 1] = 24;
      rgba[output + 2] = 24;
      rgba[output + 3] = 255 - luminance;
    }

    const logo = await sharp(rgba, {
      raw: { width: innerSize, height: innerSize, channels: 4 },
    }).png().toBuffer();

    const image = await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: "#ffd400",
      },
    })
      .composite([{ input: logo, left: padding, top: padding }])
      .png()
      .toBuffer();
    images.push({ size, image });
  }

  const directorySize = 6 + (images.length * 16);
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = directorySize;
  images.forEach(({ size, image }, index) => {
    const entryOffset = 6 + (index * 16);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(image.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.length;
  });

  fs.writeFileSync(destination, Buffer.concat([header, ...images.map(({ image }) => image)]));
  fs.writeFileSync(path.join(__dirname, "app-icon-preview.png"), images.at(-1).image);
}

createIcon().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
