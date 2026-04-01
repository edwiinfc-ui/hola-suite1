# 🚀 Git & GitHub - Hola Suite Dashboard

## ✅ Estado Actual

El código ya está **inicializado en Git** con el primer commit:

```
✅ Repositorio local: /home/ixcsoft/Dashboard- Hola suite
✅ Rama: master (cambiaremos a main)
✅ Commits: 1 inicial con 66 archivos
✅ .gitignore: Configurado
```

## 📋 Paso a Paso: Subir a GitHub

### 1️⃣ Crear Repositorio en GitHub

Ve a **https://github.com/new** y:

1. **Nombre:** `hola-suite`
2. **Descripción:** Sistema de gestión de clientes y vendedores con ClickUp
3. **Público:** Sí ✓
4. **No inicializar con README:** (ya tenemos)
5. **Crear repositorio**

### 2️⃣ Ejecutar Comandos en Terminal

Después de crear el repo en GitHub, GitHub te mostrará los comandos. Ejecuta en tu terminal:

```bash
cd "/home/ixcsoft/Dashboard- Hola suite"

# Agregar el repositorio remoto (reemplaza TU_USUARIO)
git remote add origin https://github.com/TU_USUARIO/hola-suite.git

# Cambiar rama de master a main
git branch -M main

# Subir a GitHub
git push -u origin main
```

### 3️⃣ Verificar

Ve a **https://github.com/TU_USUARIO/hola-suite** y verifica que el código esté allí.

---

## 💡 Comandos Útiles para el Futuro

### Después de hacer cambios locales:

```bash
# Ver cambios
git status

# Agregar cambios
git add -A

# Hacer commit
git commit -m "Descripción de cambios"

# Subir a GitHub
git push origin main
```

### Ver historial:

```bash
git log --oneline
git log --graph --all --oneline
```

### Crear rama para nuevas características:

```bash
git checkout -b feature/nombre-feature
# ... hacer cambios ...
git push origin feature/nombre-feature
# Luego abrir Pull Request en GitHub
```

---

## 📦 Estructura del Repositorio

```
hola-suite/
├── server.js                    # Backend Node.js
├── vylex.html                   # Frontend principal
├── charts.js                    # Configuración gráficos
├── package.json                 # Dependencias
├── .gitignore                   # Archivos ignorados
├── README.md                    # Documentación
├── GITHUB_SETUP.sh             # Esta guía
├── install.sh                   # Script instalación
└── data/
    ├── sales_config.json       # Config de ventas
    └── audit_log.json          # Auditoría
```

---

## 🔒 Seguridad

### ⚠️ NO subas nunca:

- `.env` (credenciales)
- API keys
- JWT secrets
- Datos sensibles

**Están protegidos por `.gitignore`:**

```
.env
.env.local
credentials.json
secrets.json
```

---

## 🤝 Colaboración

Si otros quieren contribuir:

1. **Fork** el repositorio
2. **Clonar** su fork: `git clone https://github.com/otro/hola-suite.git`
3. **Crear rama:** `git checkout -b feature/nueva-funcion`
4. **Hacer cambios** y commits
5. **Push:** `git push origin feature/nueva-funcion`
6. **Pull Request** desde GitHub

---

## 📊 Ver estado del repositorio

```bash
# Estado actual
git status

# Últimos commits
git log --oneline -5

# Ramas disponibles
git branch -a

# Remote configurado
git remote -v
```

---

## ✨ Próximos Pasos

1. ✅ **Git inicializado localmente** (YA HECHO)
2. ⏳ **Crear repo en GitHub** (TÚ: ir a https://github.com/new)
3. ⏳ **Ejecutar comandos push** (TÚ: copiar-pegar comandos)
4. ✅ **¡Código en GitHub!**

---

## 🆘 Problemas Comunes

### Error: "origin ya existe"
```bash
git remote rm origin
git remote add origin https://github.com/TU_USUARIO/hola-suite.git
```

### Error: "Please configure your identity"
```bash
git config user.email "tu@email.com"
git config user.name "Tu Nombre"
```

### Error: "fatal: remote origin already exists"
```bash
git remote set-url origin https://github.com/TU_USUARIO/hola-suite.git
```

---

**Versión:** 2.1  
**Fecha:** 1 de Abril de 2026  
**Sistema:** Hola Suite Dashboard

