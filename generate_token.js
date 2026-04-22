#!/usr/bin/env node
'use strict';

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Generar token válido
const JWT_SECRET = process.env.JWT_SECRET || 'tu_jwt_secret_super_seguro_aqui';

const user = {
  id: 1,
  username: 'admin@holasuite.com',
  role: 'admin'
};

const token = jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });

console.log('🔑 Token JWT válido:');
console.log(token);
console.log('\nExporta como:');
console.log(`export TOKEN="${token}"`);
