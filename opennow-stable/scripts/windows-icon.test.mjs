import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptsDir);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("uses the OpenNOW ICO for Windows and ships all common icon sizes", async () => {
  const packageJson = await readJson(join(projectRoot, "package.json"));
  assert.equal(packageJson.build.icon, "build/icon.ico");
  assert.equal(packageJson.build.win.icon, "build/icon.ico");
  assert.equal(packageJson.build.nsis.installerIcon, "build/icon.ico");
  assert.equal(packageJson.build.nsis.uninstallerIcon, "build/icon.ico");

  const icon = await readFile(join(projectRoot, "build/icon.ico"));
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  const count = icon.readUInt16LE(4);
  assert.equal(count, 7);

  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = icon[offset] || 256;
    const height = icon[offset + 1] || 256;
    sizes.push(`${width}x${height}`);
  }
  assert.deepEqual(sizes.sort((a, b) => Number.parseInt(a) - Number.parseInt(b)), [
    "16x16",
    "24x24",
    "32x32",
    "48x48",
    "64x64",
    "128x128",
    "256x256",
  ]);
});
