# 🚀 Deploy em 3 Minutos - Escolha Sua Plataforma

## ⚡ Opção 1: Vercel (Recomendado - Mais rápido)

### Passo 1: Criar repositório no GitHub
```bash
# No seu computador, dentro da pasta do projeto:
git branch -M main
git remote add origin https://github.com/SEU-USERNAME/bhband-api.git
git push -u origin main
```

**Substituir:**
- `SEU-USERNAME` pelo seu usuário GitHub
- Se não tiver conta: https://github.com/signup (5 min)

### Passo 2: Conectar Vercel ao GitHub
1. Abra https://vercel.com
2. Clique em "Sign Up" (ou faça login se já tem conta)
3. Clique em "Continue with GitHub"
4. Autorize Vercel
5. Na dashboard, clique "New Project"
6. Clique "Import Git Repository"
7. Busque e selecione `bhband-api`
8. Clique "Import"
9. Deixe as configurações padrão e clique "Deploy"

✅ **Pronto!** Sua URL aparecerá como: `https://bhband-api.vercel.app`

---

## 🎯 Opção 2: Netlify (Mais fácil - Drag & Drop)

### Passo 1: Fazer upload na Netlify
1. Acesse https://app.netlify.com/drop
2. Arraste a pasta `calculadora - BH band` para a página
3. Espere o upload terminar

✅ **Pronto!** Sua URL aparecerá em segundos como: `https://seu-nome-aleatorio.netlify.app`

---

## 📱 Teste Rápido da API

Depois que tiver a URL, teste assim:

```bash
# Substitua "sua-url" pela URL que você recebeu

# Health check
curl https://sua-url/api/health

# Calcular orçamento
curl -X POST https://sua-url/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{
    "quantidade": 500,
    "custoUnitario": 2.50,
    "nomeProduto": "Caneta",
    "personalizacao": "Tampografia"
  }'
```

---

## 🔗 URLs Disponíveis da API

Após deploy, você terá acesso a:

```
POST   /api/calcular-orcamento        ← Calcular preço
POST   /api/comparar-estrategias      ← Comparar 3 preços
GET    /api/tecnicas                  ← Listar técnicas
GET    /api/estrategias               ← Listar estratégias
GET    /api/health                    ← Verificar status
```

---

## 📝 Próximas Etapas

1. ✅ **Deploy** (escolha Vercel ou Netlify acima)
2. 📍 **Teste a API** (execute os cURL acima)
3. 🤖 **Integre com n8n** (siga o arquivo `GUIA_N8N_PASSO_A_PASSO.md`)
4. 📊 **Quando tiver acesso ao Google Drive**, implemente sincronização de produtos
5. 🔄 **Quando tiver acesso ao Shopify**, ative a sincronização automática

---

## 💾 Estrutura do Código (para referência)

```
calculadora - BH band/
├── api/index.js              ← API Node.js (Express)
├── package.json              ← Dependências
├── vercel.json               ← Config Vercel
├── README.md                 ← Documentação completa
├── SUMARIO.md                ← O que foi entregue
├── GUIA_N8N_PASSO_A_PASSO.md ← Como integrar com n8n
└── [outros arquivos...]
```

---

## ✨ Pronto!

Depois que fizer o deploy, **me mande a URL** e eu posso:
- ✅ Testar se está funcionando corretamente
- ✅ Ajustar se necessário
- ✅ Conectar com seu n8n
- ✅ Implementar a sincronização com Google Drive quando tiver acesso

**Qual opção você escolhe: Vercel (GitHub) ou Netlify (Drag & Drop)?**
