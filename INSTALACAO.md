# 🚀 Guia de Instalação Rápida

## Para Chrome

1. **Abra o Chrome** e vá para `chrome://extensions/`

2. **Ative o Modo de Desenvolvedor** (canto superior direito)

3. **Clique em "Carregar extensão sem empacotamento"**

4. **Selecione a pasta** `whatsapp-hubspot-extension`

5. **Pronto!** A extensão aparecerá na lista com um ícone

## Para Microsoft Edge

1. **Abra o Edge** e vá para `edge://extensions/`

2. **Ative o Modo de Desenvolvedor** (canto inferior esquerdo)

3. **Clique em "Carregar extensão sem empacotamento"**

4. **Selecione a pasta** `whatsapp-hubspot-extension`

5. **Pronto!** A extensão aparecerá na lista

---

## ✅ Verificar se está funcionando

1. Acesse [WhatsApp Web](https://web.whatsapp.com)
2. Abra qualquer conversa
3. Você deve ver o botão **📤 Salvar no HubSpot** no header do chat
4. Clique no botão para testar

---

## 🔧 Configurar Middleware (Opcional)

Se você quer integração completa com HubSpot:

### 1. Instale Node.js
```bash
# Verifique se tem Node.js instalado
node --version
```

### 2. Instale as dependências
```bash
cd whatsapp-hubspot-extension
npm install
```

### 3. Configure o arquivo .env
```bash
# Copie o arquivo de exemplo
cp .env.example .env

# Edite o arquivo .env com suas credenciais
nano .env
```

Adicione sua HubSpot API Key:
```
HUBSPOT_API_KEY=seu_api_key_aqui
PORT=3000
```

**Onde obter a API Key:**
- Acesse [HubSpot Settings](https://app.hubspot.com/l/settings/api-key)
- Crie uma nova chave privada
- Copie e cole no arquivo .env

### 4. Inicie o middleware
```bash
npm start
```

O servidor rodará em `http://localhost:3000`

### 5. Atualize o content.js
No arquivo `content.js`, altere o endpoint:

```javascript
// Antes (simulado):
chrome.runtime.sendMessage({ action: "exportToHubSpot", data: data }, ...)

// Depois (com middleware real):
fetch('http://localhost:3000/api/whatsapp-to-hubspot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
})
```

---

## 🐛 Solução de Problemas

### "Extensão não aparece no Chrome"
- Verifique se o Modo de Desenvolvedor está ativado
- Tente recarregar a página `chrome://extensions/`
- Verifique se a pasta contém o arquivo `manifest.json`

### "Botão não aparece no WhatsApp Web"
- Recarregue a página do WhatsApp Web (F5)
- Verifique se a extensão está habilitada em `chrome://extensions/`
- Abra o console (F12) e procure por erros

### "Erro ao exportar conversa"
- Verifique se o WhatsApp Web está em `https://web.whatsapp.com`
- Verifique se o middleware está rodando (se usar integração)
- Abra o console (F12 → Console) para ver mensagens de erro

### "Middleware retorna erro 404"
- Verifique se o contato existe no HubSpot
- Confirme que o telefone está no formato correto
- Verifique a API Key no arquivo .env

---

## 📚 Próximos Passos

1. **Testar com um contato real** no WhatsApp Web
2. **Verificar a timeline** do contato no HubSpot CRM
3. **Ajustar os seletores** se o DOM do WhatsApp mudar
4. **Publicar a extensão** na Chrome Web Store (opcional)

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs do console (F12)
2. Verifique os logs do middleware (terminal)
3. Confirme que o WhatsApp Web está aberto
4. Reinicie a extensão desabilitando e habilitando em `chrome://extensions/`
