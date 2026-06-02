# 🚀 Guia de Deploy - BHBAND API

## Opção 1: Deploy Automático via GitHub (Recomendado)

### 1. Criar repositório no GitHub
```bash
git init
git add .
git commit -m "Initial commit - BHBAND API"
git branch -M main
git remote add origin https://github.com/SEU-USERNAME/bhband-api.git
git push -u origin main
```

### 2. Conectar Vercel ao GitHub
1. Acesse https://vercel.com
2. Clique em "New Project"
3. Selecione "Import Git Repository"
4. Busque seu repositório `bhband-api`
5. Clique "Import"

### 3. Configurar Vercel
- **Framework Preset**: Node.js
- **Build Command**: `npm run build` (ou deixar em branco)
- **Output Directory**: (deixar em branco)
- **Environment Variables**: (nenhuma necessária)
- Clique "Deploy"

✅ **Pronto!** Sua URL ficará como: `https://bhband-api.vercel.app`

---

## Opção 2: Deploy Manual via Vercel CLI

### 1. Instalar Vercel CLI
```bash
npm i -g vercel
```

### 2. Fazer login
```bash
vercel login
```

### 3. Deploy
```bash
vercel
```

Responda as perguntas:
- **Set up and deploy?** → yes
- **Which scope?** → Seu email
- **Link to existing project?** → no
- **What's your project's name?** → bhband-api
- **In which directory is your code?** → ./
- **Want to modify these settings before deploying?** → no

✅ **Pronto!** URL gerada será mostrada.

---

## Opção 3: Deploy via Netlify

### 1. Clonar este repositório

### 2. Acessar https://app.netlify.com/drop

### 3. Fazer upload
- Arraste a pasta do projeto
- Ou conecte seu repositório GitHub

### 4. Configurar Build
- **Base directory**: (deixar vazio)
- **Publish directory**: (deixar vazio)
- **Build command**: (deixar vazio)

✅ **Pronto!**

---

## ✅ Testar Deployment

Após deploy, acesse:

```bash
curl -X GET https://seu-url.vercel.app/api/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "timestamp": "2024-06-02T10:30:00.000Z"
}
```

---

## 📝 Testando Endpoint Principal

```bash
curl -X POST https://seu-url.vercel.app/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{
    "quantidade": 500,
    "custoUnitario": 2.50,
    "nomeProduto": "Caneta Plástica",
    "personalizacao": "Tampografia",
    "estrategia": "PADRÃO"
  }'
```

---

## 🔄 Atualizar após Deploy

### Via GitHub (automático)
1. Edite o arquivo `api/index.js`
2. Faça commit: `git add . && git commit -m "Update pricing"`
3. Push: `git push`
4. Vercel faz deploy automaticamente em ~1-2 minutos

### Via Vercel CLI (manual)
```bash
vercel --prod
```

---

## 🛠 Troubleshooting

### "Module not found"
```bash
npm install
vercel
```

### "ENOENT: no such file or directory 'api/index.js'"
Verifique se a estrutura está correta:
```
calculadora - BH band/
├── api/
│   └── index.js
├── package.json
├── vercel.json
└── README.md
```

### "Cannot GET /api/health"
- Verifique se a URL está correta
- Espere 2-3 minutos após deploy
- Limpe cache do navegador (Ctrl+Shift+Delete)

---

## 📊 Monitorar Deployment

1. Acesse https://vercel.com/dashboard
2. Selecione seu projeto `bhband-api`
3. Veja logs em "Deployments"
4. Acesse seu endpoint

---

## 💾 Backup & Versionamento

```bash
# Ver histórico de deployment
vercel list

# Reverter para versão anterior
vercel rollback
```

---

Pronto! Sua API está no ar e pronta para integração com n8n! 🎉
