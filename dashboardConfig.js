'use strict';

const fs = require('fs');
const path = require('path');

const DASHBOARDS_FILE = path.join(__dirname, 'dashboards.json');

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_e) {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function normalizeWidget(widget) {
  if (!widget || typeof widget !== 'object') return null;
  const id = String(widget.id || '').trim();
  if (!id) return null;
  const type = String(widget.type || '').trim() || 'unknown';
  const enabled = widget.enabled === undefined ? true : Boolean(widget.enabled);
  const order = Number.isFinite(widget.order) ? widget.order : parseInt(widget.order, 10);
  return {
    id,
    type,
    enabled,
    order: Number.isFinite(order) ? order : 999
  };
}

function normalizeWidgets(widgets) {
  if (!Array.isArray(widgets)) return [];
  const mapped = widgets.map(normalizeWidget).filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const w of mapped) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    unique.push(w);
  }
  return unique;
}

function mergeWidgetArrays(baseWidgets, overrideWidgets) {
  const map = new Map();
  normalizeWidgets(baseWidgets).forEach(w => map.set(w.id, { ...w }));
  normalizeWidgets(overrideWidgets).forEach(w => {
    const prev = map.get(w.id) || {};
    map.set(w.id, { ...prev, ...w });
  });
  return Array.from(map.values()).sort((a, b) => (a.order || 999) - (b.order || 999));
}

function readDashboardsFile() {
  return safeReadJson(DASHBOARDS_FILE, { default: { widgets: [] }, byUser: {}, byRole: {} });
}

function getUserDashboardConfig(user) {
  const config = readDashboardsFile();
  const role = String(user?.role || '').trim();
  const userId = String(user?.id ?? '').trim();

  const base = config.default?.widgets || [];
  const byRole = role && config.byRole?.[role]?.widgets ? config.byRole[role].widgets : [];
  const byUser = userId && config.byUser?.[userId]?.widgets ? config.byUser[userId].widgets : [];

  const merged = mergeWidgetArrays(base, byRole);
  const merged2 = mergeWidgetArrays(merged, byUser);

  return { widgets: merged2 };
}

function saveUserDashboardConfig(user, widgets) {
  const userId = String(user?.id ?? '').trim();
  if (!userId) {
    const err = new Error('Usuario inválido');
    err.statusCode = 400;
    throw err;
  }

  const cfg = readDashboardsFile();
  if (!cfg.byUser || typeof cfg.byUser !== 'object') cfg.byUser = {};

  cfg.byUser[userId] = {
    widgets: normalizeWidgets(widgets)
  };

  writeJsonAtomic(DASHBOARDS_FILE, cfg);
  return { ok: true };
}

module.exports = {
  getUserDashboardConfig,
  saveUserDashboardConfig
};

