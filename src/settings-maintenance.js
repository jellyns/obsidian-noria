"use strict";

const NORIA_SETTINGS_BACKUP_FORMAT = "noria-settings-backup";
const NORIA_SETTINGS_BACKUP_SCHEMA_VERSION = 1;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSettingsBackupPayload(settings, normalizeSettings, metadata = {}) {
  if (typeof normalizeSettings !== "function") {
    throw new TypeError("A settings normalizer is required.");
  }
  const normalized = normalizeSettings(settings || {});
  if (!isPlainObject(normalized)) {
    throw new TypeError("The normalized settings must be an object.");
  }
  return {
    format: NORIA_SETTINGS_BACKUP_FORMAT,
    schemaVersion: NORIA_SETTINGS_BACKUP_SCHEMA_VERSION,
    pluginVersion: String(metadata.pluginVersion || ""),
    exportedAt: String(metadata.exportedAt || new Date().toISOString()),
    settings: cloneJson(normalized),
  };
}

function parseSettingsBackupText(text, normalizeSettings) {
  if (typeof normalizeSettings !== "function") {
    throw new TypeError("A settings normalizer is required.");
  }
  let payload;
  try {
    payload = JSON.parse(String(text || ""));
  } catch (_) {
    throw new Error("The backup must be valid JSON.");
  }
  if (!isPlainObject(payload) || payload.format !== NORIA_SETTINGS_BACKUP_FORMAT) {
    throw new Error("This is not a Noria settings backup.");
  }
  if (payload.schemaVersion !== NORIA_SETTINGS_BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported settings backup schema version: ${String(payload.schemaVersion ?? "missing")}.`);
  }
  if (!isPlainObject(payload.settings)) {
    throw new Error("The backup must contain a settings object.");
  }
  const normalized = normalizeSettings(cloneJson(payload.settings));
  if (!isPlainObject(normalized)) {
    throw new Error("The imported settings could not be normalized.");
  }
  return {
    format: payload.format,
    schemaVersion: payload.schemaVersion,
    pluginVersion: String(payload.pluginVersion || ""),
    exportedAt: String(payload.exportedAt || ""),
    settings: cloneJson(normalized),
  };
}

async function replaceSettingsFromBackup(plugin, text) {
  if (!plugin || typeof plugin.normalizeSettings !== "function" || typeof plugin.saveSettings !== "function") {
    throw new TypeError("A Noria plugin settings host is required.");
  }
  const normalize = typeof plugin.normalizeSettingsBackup === "function"
    ? (value) => plugin.normalizeSettingsBackup(value)
    : (value) => plugin.normalizeSettings(value);
  const parsed = parseSettingsBackupText(text, normalize);
  const previous = plugin.settings;
  plugin.settings = parsed.settings;
  try {
    await plugin.saveSettings();
  } catch (error) {
    plugin.settings = previous;
    throw error;
  }
  return parsed;
}

module.exports = {
  NORIA_SETTINGS_BACKUP_FORMAT,
  NORIA_SETTINGS_BACKUP_SCHEMA_VERSION,
  createSettingsBackupPayload,
  parseSettingsBackupText,
  replaceSettingsFromBackup,
};
