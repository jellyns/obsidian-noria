const assert = require("node:assert/strict");
const test = require("node:test");

const {
  NORIA_SETTINGS_BACKUP_FORMAT,
  NORIA_SETTINGS_BACKUP_SCHEMA_VERSION,
  createSettingsBackupPayload,
  parseSettingsBackupText,
  replaceSettingsFromBackup,
} = require("../src/settings-maintenance.js");

test("settings backup exports a versioned normalized full snapshot", () => {
  const payload = createSettingsBackupPayload(
    { stale: true, nested: { value: 1 } },
    (value) => ({ normalized: value.nested.value, defaulted: true }),
    { pluginVersion: "0.4.0", exportedAt: "2026-07-26T08:00:00.000Z" }
  );

  assert.deepEqual(payload, {
    format: NORIA_SETTINGS_BACKUP_FORMAT,
    schemaVersion: NORIA_SETTINGS_BACKUP_SCHEMA_VERSION,
    pluginVersion: "0.4.0",
    exportedAt: "2026-07-26T08:00:00.000Z",
    settings: { normalized: 1, defaulted: true },
  });
});

test("settings backup rejects malformed or incompatible payloads before normalization", () => {
  let normalizeCalls = 0;
  const normalize = (value) => {
    normalizeCalls += 1;
    return value;
  };

  assert.throws(() => parseSettingsBackupText("not-json", normalize), /valid JSON/i);
  assert.throws(
    () => parseSettingsBackupText(JSON.stringify({ format: "other", schemaVersion: 1, settings: {} }), normalize),
    /Noria settings backup/i
  );
  assert.throws(
    () => parseSettingsBackupText(JSON.stringify({
      format: NORIA_SETTINGS_BACKUP_FORMAT,
      schemaVersion: 99,
      settings: {},
    }), normalize),
    /schema version/i
  );
  assert.throws(
    () => parseSettingsBackupText(JSON.stringify({
      format: NORIA_SETTINGS_BACKUP_FORMAT,
      schemaVersion: NORIA_SETTINGS_BACKUP_SCHEMA_VERSION,
      settings: [],
    }), normalize),
    /settings object/i
  );
  assert.equal(normalizeCalls, 0);
});

test("settings backup import replaces the complete snapshot and leaves current settings intact on validation failure", async () => {
  const plugin = {
    settings: { keep: "current", removedByReplacement: true },
    normalizeSettings(value) {
      return { imported: String(value.imported || "").trim(), defaulted: "yes" };
    },
    async saveSettings() {
      this.saveCount = (this.saveCount || 0) + 1;
    },
  };

  await assert.rejects(
    replaceSettingsFromBackup(plugin, JSON.stringify({ format: "other", schemaVersion: 1, settings: {} })),
    /Noria settings backup/i
  );
  assert.deepEqual(plugin.settings, { keep: "current", removedByReplacement: true });
  assert.equal(plugin.saveCount || 0, 0);

  const result = await replaceSettingsFromBackup(plugin, JSON.stringify({
    format: NORIA_SETTINGS_BACKUP_FORMAT,
    schemaVersion: NORIA_SETTINGS_BACKUP_SCHEMA_VERSION,
    pluginVersion: "0.4.0",
    settings: { imported: "  new value  " },
  }));

  assert.deepEqual(plugin.settings, { imported: "new value", defaulted: "yes" });
  assert.equal(plugin.saveCount, 1);
  assert.deepEqual(result.settings, { imported: "new value", defaulted: "yes" });
});
