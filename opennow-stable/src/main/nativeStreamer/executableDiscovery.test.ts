import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveNativeStreamerExecutableCandidates } from "./executableDiscovery";

test("packaged status discovery returns the bundled executable without materializing cache", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "opennow-native-discovery-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const resourcesPath = join(root, "resources");
  const executablePath = join(
    resourcesPath,
    "native",
    "opennow-streamer",
    "win32-x64",
    "opennow-streamer.exe",
  );
  mkdirSync(join(executablePath, "..", "gstreamer"), { recursive: true });
  writeFileSync(executablePath, "test-executable");

  const candidates = await resolveNativeStreamerExecutableCandidates({
    platform: "win32",
    arch: "x64",
    resourcesPath,
    appPath: join(root, "app"),
    mainDir: join(root, "main"),
    isPackaged: true,
    envExecutablePath: undefined,
    getConfiguredPath: () => "",
    materializeCache: false,
    cacheContext: {
      appVersion: "1.0.3",
      isPackaged: true,
      platform: "win32",
      resourcesPath,
      tempDirectory: root,
      userDataPath: join(root, "user-data"),
    },
  });

  assert.deepEqual(candidates, [executablePath]);
});
