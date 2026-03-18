# 📖 Documentação Técnica - WhatsApp para HubSpot

## 1. Visão Geral da Arquitetura

A extensão funciona em três camadas:

```
┌─────────────────────────────────────────────────────────────┐
│ CAMADA 1: EXTENSÃO CHROME/EDGE                              │
├─────────────────────────────────────────────────────────────┤
│ • Content Script: Captura dados do WhatsApp Web             │
│ • Background Script: Gerencia requisições e mensagens       │
│ • Popup UI: Interface de controle do usuário                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ CAMADA 2: MIDDLEWARE (OPCIONAL)                             │
├─────────────────────────────────────────────────────────────┤
│ • Node.js + Express                                         │
│ • Valida e formata dados                                    │
│ • Gerencia tokens de segurança                              │
│ • Comunica com HubSpot API                                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ CAMADA 3: HUBSPOT CRM                                       │
├─────────────────────────────────────────────────────────────┤
│ • API REST v3                                               │
│ • Busca contatos por telefone                               │
│ • Cria notas na timeline                                    │
└─────────────────────────────────────────────────────────────┘
```

## 2. Componentes da Extensão

### 2.1 manifest.json

Define as permissões e configuração da extensão:

| Campo | Descrição |
|-------|-----------|
| `manifest_version` | Versão 3 (padrão moderno) |
| `permissions` | `activeTab`, `storage` |
| `host_permissions` | Acesso a `https://web.whatsapp.com/*` |
| `content_scripts` | Injeta `content.js` no WhatsApp Web |
| `background.service_worker` | Service Worker para background |
| `action` | Define popup e ícone |

### 2.2 content.js

Injeta código diretamente no WhatsApp Web:

**Funções principais:**

```javascript
addExportButton()
// Adiciona botão "Salvar no HubSpot" ao header do chat

extractConversation()
// Extrai mensagens, horários e participantes
// Retorna: { contactName, messages: [{from, text, time}] }
```

**Seletores CSS usados:**

```css
div.message-in, div.message-out    /* Mensagens */
span[data-testid='msg-time']       /* Horário */
header span[dir="auto"]            /* Nome do contato */
.selectable-text                   /* Texto da mensagem */
```

⚠️ **Nota importante**: O DOM do WhatsApp Web muda frequentemente. Se os seletores não funcionarem, abra o DevTools (F12) e inspecione os elementos para atualizar.

### 2.3 background.js

Service Worker que gerencia comunicação entre content script e popup:

```javascript
chrome.runtime.onMessage.addListener()
// Recebe mensagens do content script
// Envia para o middleware (se configurado)
// Retorna resposta ao content script
```

### 2.4 popup.html / popup.js

Interface visual que aparece ao clicar no ícone:

**Elementos:**
- Título e descrição
- Botão "Exportar Conversa Atual"
- Mensagem de status

**Fluxo:**
1. Usuário clica no botão
2. `popup.js` verifica se está em `web.whatsapp.com`
3. Executa `content.js` para extrair conversa
4. Envia para `background.js`
5. Mostra resultado ao usuário

### 2.5 content.css

Estilos do botão injetado no WhatsApp:

```css
.hubspot-btn {
  background-color: #ff7a59;  /* Cor HubSpot */
  color: white;
  border: none;
  border-radius: 5px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  margin-left: 15px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  transition: background-color 0.3s;
}
```

## 3. Fluxo de Dados

### Fluxo Básico (Sem Middleware)

```
1. Usuário abre conversa no WhatsApp Web
2. Content Script detecta e adiciona botão
3. Usuário clica "Salvar no HubSpot"
4. Content Script extrai dados:
   - Nome do contato
   - Mensagens (texto, hora, remetente)
5. Envia para Background Script
6. Background Script simula envio (ou chama middleware)
7. Mostra confirmação ao usuário
```

### Fluxo Completo (Com Middleware)

```
1-5. [Igual ao fluxo básico]
6. Background Script faz POST para middleware:
   POST /api/whatsapp-to-hubspot
   {
     "contactName": "João Silva",
     "phone": "+551199999999",
     "messages": [...]
   }
7. Middleware recebe e valida dados
8. Busca contato no HubSpot:
   POST /crm/v3/objects/contacts/search
   {
     "filterGroups": [{
       "filters": [{
         "propertyName": "phone",
         "operator": "EQ",
         "value": "+551199999999"
       }]
     }]
   }
9. Se encontrado, formata conversa e cria nota:
   POST /crm/v3/objects/notes
   {
     "properties": {
       "hs_note_body": "[10:12] Cliente: Olá..."
     },
     "associations": [{
       "to": { "id": "CONTACT_ID" },
       "types": [{
         "associationCategory": "HUBSPOT_DEFINED",
         "associationTypeId": 202
       }]
     }]
   }
10. HubSpot retorna ID da nota criada
11. Middleware retorna sucesso ao background.js
12. Background.js mostra confirmação ao usuário
```

## 4. Integração com HubSpot API

### 4.1 Endpoints Utilizados

#### Buscar Contato

```
POST /crm/v3/objects/contacts/search
Authorization: Bearer {API_KEY}

Request:
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "phone",
      "operator": "EQ",
      "value": "+551199999999"
    }]
  }]
}

Response:
{
  "results": [{
    "id": "12345",
    "properties": {
      "firstname": "João",
      "lastname": "Silva",
      "phone": "+551199999999"
    }
  }]
}
```

#### Criar Nota

```
POST /crm/v3/objects/notes
Authorization: Bearer {API_KEY}

Request:
{
  "properties": {
    "hs_note_body": "WhatsApp Conversation\n\nCliente: João Silva\n\n[10:12] Cliente: Olá..."
  },
  "associations": [{
    "to": { "id": "12345" },
    "types": [{
      "associationCategory": "HUBSPOT_DEFINED",
      "associationTypeId": 202
    }]
  }]
}

Response:
{
  "id": "67890",
  "properties": {
    "hs_note_body": "..."
  }
}
```

### 4.2 Códigos de Associação

| Tipo | ID | Descrição |
|------|----|-----------| 
| Nota → Contato | 202 | Associação padrão |
| Nota → Empresa | 203 | Para associar a empresa |
| Nota → Deal | 204 | Para associar oportunidade |

## 5. Segurança

### 5.1 Proteção de Tokens

**❌ Nunca faça:**
```javascript
// INSEGURO: Token exposto no cliente
fetch('https://api.hubapi.com/...', {
  headers: { 'Authorization': 'Bearer seu_token_aqui' }
})
```

**✅ Sempre faça:**
```javascript
// SEGURO: Token no servidor (middleware)
fetch('http://localhost:3000/api/whatsapp-to-hubspot', {
  method: 'POST',
  body: JSON.stringify(data)
})
// Middleware faz a requisição com o token seguro
```

### 5.2 Validação de Dados

```javascript
// Validar antes de enviar
if (!contactName || !messages || messages.length === 0) {
  throw new Error('Dados inválidos');
}

// Sanitizar texto
const sanitized = text.replace(/[<>]/g, '');
```

### 5.3 CORS

Configure no middleware:

```javascript
const cors = require('cors');

app.use(cors({
  origin: ['chrome-extension://seu_id_aqui'],
  credentials: true
}));
```

## 6. Tratamento de Erros

### Cenários Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| "Contato não encontrado" | Telefone não existe no HubSpot | Criar contato manualmente |
| "Permissão negada" | API Key inválida | Gerar nova chave em Settings |
| "DOM não encontrado" | WhatsApp mudou estrutura | Atualizar seletores em content.js |
| "CORS error" | Origem não autorizada | Configurar CORS no middleware |

## 7. Melhorias Futuras

### Curto Prazo
- [ ] Detectar número automaticamente
- [ ] Suporte para múltiplos idiomas
- [ ] Ícones SVG personalizados
- [ ] Validação de email do contato

### Médio Prazo
- [ ] Sincronizar histórico completo
- [ ] Evitar duplicação de mensagens
- [ ] Suporte para grupos
- [ ] Dashboard de estatísticas

### Longo Prazo
- [ ] Publicar na Chrome Web Store
- [ ] Extensão para Firefox
- [ ] Integração com outros CRMs
- [ ] Análise de sentimento das mensagens

## 8. Debugging

### Console do Chrome
```javascript
// Abra F12 na aba do WhatsApp Web

// Ver mensagens extraídas
console.log(extractConversation());

// Ver se botão foi adicionado
console.log(document.getElementById('hubspot-export-btn'));

// Monitorar mensagens
chrome.runtime.onMessage.addListener((msg) => {
  console.log('Mensagem recebida:', msg);
});
```

### Logs do Middleware
```bash
# Terminal onde rodou npm start
# Mostra todas as requisições e respostas
```

### DevTools da Extensão
```
chrome://extensions/ → Detalhes → Inspecionar views → background.js
```

## 9. Performance

### Otimizações Implementadas

- **Lazy Loading**: Botão adicionado apenas quando necessário
- **Event Delegation**: MutationObserver para detectar mudanças
- **Caching**: Armazena dados em `chrome.storage`
- **Async/Await**: Requisições não bloqueantes

### Métricas

| Métrica | Valor |
|---------|-------|
| Tempo de captura | < 500ms |
| Tempo de envio | < 2s |
| Tamanho da extensão | ~50KB |
| Consumo de memória | ~10MB |

## 10. Referências

- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)
- [HubSpot API Reference](https://developers.hubspot.com/docs/api/overview)
- [WhatsApp Web Selectors](https://github.com/open-wa/wa-automate-nodejs)
- [Manifest v3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
