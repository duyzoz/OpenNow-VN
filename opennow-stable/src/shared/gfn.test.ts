/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";

import type { GameInfo, GameVariant } from "./gfn";
import {
  OWNED_LIBRARY_STATUSES,
  isEpicStore,
  isGameInLibrary,
  isOwnedLibraryStatus,
  isOwnedVariant,
  getDefaultStreamPreferences,
  normalizeGameStore,
  normalizeStreamPreferences,
} from "./gfn";

function makeVariant(overrides: Partial<GameVariant> = {}): GameVariant {
  return {
    id: overrides.id ?? "variant-1",
    store: overrides.store ?? "Steam",
    supportedControls: overrides.supportedControls ?? [],
    librarySelected: overrides.librarySelected,
    libraryStatus: overrides.libraryStatus,
    lastPlayedDate: overrides.lastPlayedDate,
    gfnStatus: overrides.gfnStatus,
  };
}

function makeGame(variants: GameVariant[]): GameInfo {
  return {
    id: "game-1",
    title: "Test Game",
    selectedVariantIndex: 0,
    variants,
  };
}

test("counts only the GeForce NOW owned library statuses as owned", () => {
  assert.deepEqual(OWNED_LIBRARY_STATUSES, ["MANUAL", "PLATFORM_SYNC", "IN_LIBRARY"]);

  assert.equal(isOwnedLibraryStatus("MANUAL"), true);
  assert.equal(isOwnedLibraryStatus("PLATFORM_SYNC"), true);
  assert.equal(isOwnedLibraryStatus("IN_LIBRARY"), true);

  assert.equal(isOwnedLibraryStatus("NOT_OWNED"), false);
  assert.equal(isOwnedLibraryStatus(""), false);
  assert.equal(isOwnedLibraryStatus(undefined), false);
});

test("does not treat librarySelected by itself as ownership", () => {
  assert.equal(isOwnedVariant(makeVariant({ librarySelected: true })), false);
  assert.equal(
    isOwnedVariant(makeVariant({ librarySelected: true, libraryStatus: "NOT_OWNED" })),
    false,
  );
  assert.equal(
    isOwnedVariant(makeVariant({ librarySelected: true, libraryStatus: "PLATFORM_SYNC" })),
    true,
  );
});

test("derives game in-library state from owned variants only", () => {
  assert.equal(
    isGameInLibrary(
      makeGame([
        makeVariant({ id: "steam", store: "Steam", libraryStatus: "NOT_OWNED" }),
        makeVariant({ id: "epic", store: "Epic", libraryStatus: "PLATFORM_SYNC" }),
      ]),
    ),
    true,
  );

  assert.equal(
    isGameInLibrary(
      makeGame([
        makeVariant({ id: "steam", store: "Steam" }),
        makeVariant({ id: "epic", store: "Epic", librarySelected: true }),
      ]),
    ),
    false,
  );
});

test("matches Epic store aliases only", () => {
  assert.equal(isEpicStore("EPIC_GAMES_STORE"), true);
  assert.equal(isEpicStore("Epic Games Store"), true);
  assert.equal(isEpicStore("EPIC"), true);
  assert.equal(isEpicStore("EGS"), true);
  assert.equal(isEpicStore("Steam"), false);
});

test("normalizes equivalent store spellings to one canonical key", () => {
  assert.equal(normalizeGameStore("Epic"), "EPIC_GAMES_STORE");
  assert.equal(normalizeGameStore("EGS"), "EPIC_GAMES_STORE");
  assert.equal(normalizeGameStore("GOG.com"), "GOG");
  assert.equal(normalizeGameStore("Battle.net"), "BATTLE_NET");
  assert.equal(normalizeGameStore("Gaijin.net"), "GAIJIN");
  assert.equal(normalizeGameStore("Microsoft Store"), "XBOX");
});

test("stream preferences keep WebRTC-compatible codec and color quality", () => {
  assert.deepEqual(normalizeStreamPreferences("H265", "10bit_444"), {
    codec: "H265",
    colorQuality: "10bit_444",
    migrated: false,
  });
});

test("defaults H264 streaming to 8-bit SDR-compatible color quality", () => {
  assert.deepEqual(getDefaultStreamPreferences(), {
    codec: "H264",
    colorQuality: "8bit_420",
  });
});

test("normalizes H264 stream preferences away from high bit-depth modes", () => {
  assert.deepEqual(normalizeStreamPreferences("H264", "10bit_420"), {
    codec: "H264",
    colorQuality: "8bit_420",
    migrated: true,
  });
  assert.deepEqual(normalizeStreamPreferences("H265", "10bit_420"), {
    codec: "H265",
    colorQuality: "10bit_420",
    migrated: false,
  });
});

test("keeps H264 streaming on the safe SDR profile", () => {
  assert.deepEqual(normalizeStreamPreferences("H264", "10bit_420"), {
    codec: "H264",
    colorQuality: "8bit_420",
    migrated: true,
  });
});
