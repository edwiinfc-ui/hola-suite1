#!/usr/bin/env node
'use strict';

/**
 * Crea `data/global_config.local.json` (gitignored) si no existe.
 * No sobreescribe si ya existe.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const dataDir = path.join(repoRoot, 'data');
const localPath = path.join(dataDir, 'global_config.local.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(dataDir);
  if (fs.existsSync(localPath)) {
    console.log(`✅ Ya existe: ${localPath}`);
    process.exit(0);
  }

  const template = {
    clickupApiKey: '',
    clickupListId: '',
    holaUrl: 'https://wispro.holasuite.com/api/v1',
    holaToken: '',
    googleSheetsApiKey: '',
    // Opcional: si usas importación de ventas por Sheet
    salesSheetId: '',
    salesSheetName: ''
  };

  fs.writeFileSync(localPath, JSON.stringify(template, null, 2));
  console.log(`✅ Creado: ${localPath}`);
  console.log('ℹ️  Completa las credenciales en ese archivo o usa `.env`.');
}

main();

