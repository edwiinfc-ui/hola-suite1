#!/usr/bin/env node

/**
 * MIGRATE_PASSWORDS.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Script para migrar todas las contraseñas de plaintext a bcrypt hash
 * 
 * Uso:
 *   node migrate_passwords.js
 * 
 * ⚠️  IMPORTANTE: Ejecutar solo una vez en cada ambiente
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const bcryptjs = require('bcryptjs');

const USERS_FILE = path.join(__dirname, 'users.json');
const BACKUP_FILE = path.join(__dirname, 'users.json.backup');

console.log('🔒 MIGRANDO CONTRASEÑAS A BCRYPT');
console.log('═'.repeat(60));

// 1. Validar que bcryptjs esté instalado
try {
  require.resolve('bcryptjs');
} catch (e) {
  console.error('❌ ERROR: bcryptjs no está instalado');
  console.error('   Instala con: npm install bcryptjs');
  process.exit(1);
}

// 2. Verificar que el archivo de usuarios exista
if (!fs.existsSync(USERS_FILE)) {
  console.error(`❌ ERROR: No se encontró ${USERS_FILE}`);
  process.exit(1);
}

// 3. Crear backup
console.log('\n1️⃣  Creando backup...');
try {
  const backupData = fs.readFileSync(USERS_FILE, 'utf8');
  fs.writeFileSync(BACKUP_FILE, backupData);
  console.log(`   ✅ Backup guardado: ${BACKUP_FILE}`);
} catch (e) {
  console.error(`   ❌ Error al crear backup: ${e.message}`);
  process.exit(1);
}

// 4. Leer usuarios
console.log('\n2️⃣  Leyendo usuarios...');
let users = [];
try {
  users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  console.log(`   ✅ ${users.length} usuario(s) encontrado(s)`);
} catch (e) {
  console.error(`   ❌ Error al leer usuarios: ${e.message}`);
  process.exit(1);
}

// 5. Detectar cuáles ya están hasheadas
console.log('\n3️⃣  Analizando contraseñas...');
let plainTextCount = 0;
let hashedCount = 0;

users.forEach((user, idx) => {
  // Las contraseñas bcrypt siempre empiezan con $2a$, $2b$ o $2x$ y tienen 60 caracteres
  const isBcryptHash = /^\$2[aby]\$/.test(user.password) && user.password.length === 60;
  
  if (isBcryptHash) {
    hashedCount++;
    console.log(`   ✓ Usuario ${idx + 1} (${user.username}): YA HASHEADA`);
  } else {
    plainTextCount++;
    console.log(`   ⚠️  Usuario ${idx + 1} (${user.username}): plaintext → será hasheada`);
  }
});

console.log(`\n   📊 Resumen:`);
console.log(`      - Plaintext: ${plainTextCount}`);
console.log(`      - Ya hasheadas: ${hashedCount}`);

if (plainTextCount === 0) {
  console.log('\n✅ ¡Todas las contraseñas ya están hasheadas!');
  console.log('   No es necesaria migración.');
  process.exit(0);
}

// 6. Hashear contraseñas
console.log('\n4️⃣  Hasheando contraseñas...');
let migratedCount = 0;

users = users.map((user, idx) => {
  const isBcryptHash = /^\$2[aby]\$/.test(user.password) && user.password.length === 60;
  
  if (!isBcryptHash && user.password) {
    try {
      const hashedPassword = bcryptjs.hashSync(user.password, 10);
      migratedCount++;
      console.log(`   ✅ ${user.username}: contraseña hasheada`);
      return { ...user, password: hashedPassword };
    } catch (e) {
      console.error(`   ❌ Error al hashear ${user.username}: ${e.message}`);
      return user; // No modificar si hay error
    }
  }
  
  return user;
});

// 7. Guardar usuarios migrados
console.log('\n5️⃣  Guardando cambios...');
try {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  console.log(`   ✅ ${migratedCount} contraseña(s) migrada(s)`);
} catch (e) {
  console.error(`   ❌ Error al guardar: ${e.message}`);
  console.error(`   Restaurando desde backup...`);
  fs.copyFileSync(BACKUP_FILE, USERS_FILE);
  process.exit(1);
}

// 8. Verificar resultado
console.log('\n6️⃣  Verificando resultado...');
const updatedUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
let verifiedCount = 0;

updatedUsers.forEach(user => {
  const isBcryptHash = /^\$2[aby]\$/.test(user.password) && user.password.length === 60;
  if (isBcryptHash) verifiedCount++;
});

console.log(`   ✅ ${verifiedCount}/${updatedUsers.length} contraseñas verificadas como bcrypt`);

// 9. Información de seguridad
console.log('\n' + '='.repeat(60));
console.log('🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!');
console.log('='.repeat(60));
console.log(`
✅ Cambios realizados:
   • ${migratedCount} contraseña(s) convertida(s) a bcrypt
   • Backup guardado en: ${BACKUP_FILE}

🔒 Cambios de seguridad implementados:
   ✓ Contraseñas ahora están hasheadas con bcrypt (salt rounds: 10)
   ✓ Login automáticamente verificará con bcryptjs.compareSync()
   ✓ Compatibilidad temporal con contraseñas plaintext (para transición)

📝 Próximos pasos:
   1. Probar login con un usuario
   2. Verificar en audit_logs.json que AUTH_LOGIN_SUCCESS aparece
   3. En producción, eliminar BACKUP_FILE después de verificar todo

⚠️  IMPORTANTE:
   • Nunca subas USERS_FILE a control de versiones
   • Mantén BACKUP_FILE seguro por 7 días mínimo
   • Si hay problema, restaura: cp users.json.backup users.json
`);

process.exit(0);
