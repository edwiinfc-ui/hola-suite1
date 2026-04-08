# 📤 INSTRUCCIONES PARA HACER PUSH A GITHUB

## Problema
El usuario del sistema (`edwincampos-glitch`) no tiene credenciales configuradas en GitHub.

## Solución 1: Git Credentials Cache (Rápido)

```bash
# En tu máquina (local), configura credenciales
git config --global credential.helper cache

# Luego hace push (te pedirá usuario/token una sola vez)
git push origin main
```

## Solución 2: Git Credentials Store (Persistente)

```bash
# Guardar credenciales
git config --global credential.helper store

# Luego hace push y selecciona "Store credentials"
git push origin main

# Las credenciales se guardan en ~/.git-credentials
```

## Solución 3: GitHub Personal Access Token (Recomendado)

### Paso 1: Crear token en GitHub
1. Ve a https://github.com/settings/tokens
2. Click en "Generate new token"
3. Dale nombre: "hola-suite-push"
4. Selecciona permisos: `repo` (acceso completo a repos)
5. Copia el token (ej: `ghp_xxxxxxxxxxxxxx`)

### Paso 2: Usar el token como contraseña
```bash
# Cuando GitHub pida credenciales:
Username: tu-usuario-github
Password: ghp_xxxxxxxxxxxxxx  (el token que copiaste)
```

## Solución 4: SSH Key (Profesional)

```bash
# Generar clave SSH
ssh-keygen -t ed25519 -C "tu@email.com"

# Copiar contenido de ~/.ssh/id_ed25519.pub
cat ~/.ssh/id_ed25519.pub

# Ve a https://github.com/settings/ssh/new
# Pega la clave

# Luego puedes hacer push sin credenciales
git push origin main
```

---

## Estado Actual del Repo

✅ 2 commits listos para publicar:
- `2c0af86` - Frontend filters by date and department
- `9647d7a` - Backend v1 API endpoints

Total: ~23 archivos modificados/creados

---

## Comando para hacer Push (une vez configurado)

```bash
cd "/home/ixcsoft/Dashboard- Hola suite"
git push origin main
```

---

## Verificar después del Push

```bash
# Ver rama remota
git branch -r

# Ver último commit en GitHub
git log --oneline -5
```

---

**Nota:** Los commits están locales. El push es solo para sincronizar con GitHub.

Una vez hagas el push, el código estará disponible en:
https://github.com/edwiinfc-ui/hola-suite1
