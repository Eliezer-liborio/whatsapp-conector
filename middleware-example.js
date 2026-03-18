// middleware-example.js
// Exemplo de middleware Node.js para integração com HubSpot API

const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Variáveis de configuração
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// ========================================
// 1️⃣ BUSCAR CONTATO NO HUBSPOT
// ========================================
async function searchHubSpotContact(phone) {
  try {
    const response = await axios.post(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "phone",
                operator: "EQ",
                value: phone
              }
            ]
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.results && response.data.results.length > 0) {
      return response.data.results[0];
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar contato:', error.message);
    throw error;
  }
}

// ========================================
// 2️⃣ FORMATAR CONVERSA
// ========================================
function formatConversation(contactName, messages) {
  let formatted = `WhatsApp Conversation\n\n`;
  formatted += `Cliente: ${contactName}\n\n`;

  messages.forEach(msg => {
    const sender = msg.from === 'vendedor' ? 'Vendedor' : 'Cliente';
    formatted += `[${msg.time}] ${sender}:\n${msg.text}\n\n`;
  });

  return formatted;
}

// ========================================
// 3️⃣ CRIAR NOTA NO HUBSPOT
// ========================================
async function createHubSpotNote(contactId, noteBody) {
  try {
    const response = await axios.post(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/notes`,
      {
        properties: {
          hs_note_body: noteBody
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 202  // Associação padrão nota-contato
              }
            ]
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Erro ao criar nota:', error.message);
    throw error;
  }
}

// ========================================
// 4️⃣ ENDPOINT PRINCIPAL
// ========================================
app.post('/api/whatsapp-to-hubspot', async (req, res) => {
  try {
    const { contactName, phone, messages } = req.body;

    // Validar dados
    if (!contactName || !messages || messages.length === 0) {
      return res.status(400).json({
        error: 'Dados inválidos. Envie contactName e messages.'
      });
    }

    // Buscar contato no HubSpot
    console.log(`Buscando contato: ${contactName}`);
    const contact = await searchHubSpotContact(phone);

    if (!contact) {
      return res.status(404).json({
        error: `Contato não encontrado no HubSpot. Telefone: ${phone}`
      });
    }

    // Formatar conversa
    const conversationText = formatConversation(contactName, messages);

    // Criar nota no HubSpot
    console.log(`Criando nota para contato ID: ${contact.id}`);
    const note = await createHubSpotNote(contact.id, conversationText);

    // Retornar sucesso
    res.json({
      success: true,
      message: 'Conversa salva com sucesso na timeline do HubSpot',
      noteId: note.id,
      contactId: contact.id
    });

  } catch (error) {
    console.error('Erro no endpoint:', error);
    res.status(500).json({
      error: 'Erro ao processar a conversa',
      details: error.message
    });
  }
});

// ========================================
// 5️⃣ HEALTH CHECK
// ========================================
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Middleware rodando' });
});

// ========================================
// 6️⃣ INICIAR SERVIDOR
// ========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Middleware rodando em http://localhost:${PORT}`);
  console.log(`Endpoint: POST http://localhost:${PORT}/api/whatsapp-to-hubspot`);
});

// ========================================
// EXEMPLO DE REQUISIÇÃO
// ========================================
/*
POST /api/whatsapp-to-hubspot
Content-Type: application/json

{
  "contactName": "João Silva",
  "phone": "+551199999999",
  "messages": [
    {
      "from": "cliente",
      "text": "Olá gostaria de saber sobre o produto",
      "time": "10:12"
    },
    {
      "from": "vendedor",
      "text": "Claro posso te explicar",
      "time": "10:13"
    },
    {
      "from": "cliente",
      "text": "Qual valor?",
      "time": "10:14"
    }
  ]
}

RESPOSTA:
{
  "success": true,
  "message": "Conversa salva com sucesso na timeline do HubSpot",
  "noteId": "12345678",
  "contactId": "87654321"
}
*/
