// tamkeen://watch links on the phone (web/js/applink.js) must be read exactly as the computer reads
// them (app/applink.py): both run the cases in tests/fixtures/applink_cases.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTamkeenLink } from "../../web/js/applink.js";

const { cases } = JSON.parse(readFileSync(new URL("../fixtures/applink_cases.json", import.meta.url), "utf8"));

test("tamkeen://watch links are read as the computer reads them", () => {
  for (const { url, expect } of cases) {
    const got = parseTamkeenLink(url);
    assert.deepEqual(got && { video_id: got.videoId, at: got.at, source: got.source }, expect, url);
  }
});
