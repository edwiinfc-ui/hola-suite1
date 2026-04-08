# Rodar localmente (PC)

Este projeto é um **Node.js + Express** que serve o frontend (`vylex.html`) e expõe APIs em `/api/*`.

## Requisitos (Linux)

- Node.js **18+** (recomendado 20+)
- npm (vem junto com o Node)

## Passo a passo

1) Instale dependências:

```bash
npm install
```

2) Crie o arquivo de ambiente:

```bash
cp .env.example .env
```

3) Edite o `.env` e pelo menos defina:

- `JWT_SECRET` (obrigatório)
- `PORT` (opcional, padrão `3000`)
- `CLICKUP_API_KEY` e `CLICKUP_LIST_ID` (opcionais; sem isso o dashboard roda, mas sem sincronizar dados reais)

4) Rode o servidor:

```bash
npm run dev
```

5) Abra no navegador:

- `http://localhost:3000`

## Se não tiver Node instalado (Linux)

- Verifique:

```bash
node -v
```

- Se não existir, a forma mais comum é instalar via `nvm` (Node Version Manager) e depois:

```bash
nvm install 20
nvm use 20
```

## Login local

Os usuários locais ficam em `users.json`. Você pode editar/alterar senhas ali para seu PC.

Exemplo (se ainda estiver como no repo):

- Usuário: `admin@holasuite.com`
- Senha: `hola2025`

## Dicas rápidas

- Se der erro de porta em uso, mude `PORT` no `.env` (ex.: `3001`) e rode de novo.
- Se você só quer “ver a tela” sem APIs, até dá pra abrir `vylex.html` direto, mas **várias funções vão falhar** (porque dependem de `/api/*`). O recomendado é rodar o `server.js`.
