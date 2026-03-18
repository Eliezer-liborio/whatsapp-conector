// middleware.js
// Servidor Node.js para integracao WhatsApp Web com HubSpot CRM
// Busca de contato: APENAS por numero de telefone

require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));

const HUBSPOT_TOKEN = process.env.HUBSPOT_API_KEY;
const HUBSPOT_BASE  = 'https://api.hubapi.com';

const headers = () => ({
  'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
  'Content-Type': 'application/json'
});

// ─────────────────────────────────────────────
// Gera todas as variantes de formato do numero
// para cobrir como o HubSpot pode ter armazenado
// Ex: "5566996215988" gera:
//   5566996215988, +5566996215988,
//   +55-66-99621-5988, 66996215988, 996215988
// ─────────────────────────────────────────────
function phoneVariants(phone) {
  if (!phone) return [];
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return [];

  const variants = new Set();

  // Somente digitos
  variants.add(digits);

  // Com + na frente
  variants.add('+' + digits);

  // Formato com hifens para numeros brasileiros de 13 digitos (+55 + DDD + 9 digitos)
  if (digits.length === 13) {
    variants.add(`+${digits.slice(0,2)}-${digits.slice(2,4)}-${digits.slice(4,9)}-${digits.slice(9)}`);
  }
  // Formato com hifens para 12 digitos (+55 + DDD + 8 digitos)
  if (digits.length === 12) {
    variants.add(`+${digits.slice(0,2)}-${digits.slice(2,4)}-${digits.slice(4,8)}-${digits.slice(8)}`);
  }

  // Sem o codigo do pais 55
  if (digits.startsWith('55') && digits.length >= 10) {
    const sem55 = digits.slice(2);
    variants.add(sem55);
    variants.add('+55' + sem55);
    variants.add('0' + sem55);
  }

  // Ultimos 9 digitos (numero local com o 9)
  if (digits.length >= 9) variants.add(digits.slice(-9));

  // Ultimos 8 digitos (numero local sem o 9)
  if (digits.length >= 8) variants.add(digits.slice(-8));

  return [...variants];
}

// ─────────────────────────────────────────────
// Busca contato no HubSpot APENAS por telefone
// Testa os campos: phone e mobilephone
// com todas as variantes de formato
// ─────────────────────────────────────────────
async function findContactByPhone(phone) {
  const variants = phoneVariants(phone);

  if (variants.length === 0) return null;

  for (const variant of variants) {
    for (const prop of ['phone', 'mobilephone']) {
      try {
        const res = await axios.post(
          `${HUBSPOT_BASE}/crm/v3/objects/contacts/search`,
          {
            filterGroups: [{
              filters: [{ propertyName: prop, operator: 'EQ', value: variant }]
            }],
            properties: ['firstname', 'lastname', 'phone', 'mobilephone', 'email'],
            limit: 1
          },
          { headers: headers() }
        );
        if (res.data.results?.length > 0) {
          console.log('  Encontrado por: ' + prop + ' = "' + variant + '"');
          return res.data.results[0];
        }
      } catch (e) { /* tenta proxima variante */ }
    }
  }

  return null;
}

// ─────────────────────────────────────────────
// Formatar conversa como texto estruturado
// ─────────────────────────────────────────────
function formatConversation(contactName, messages) {
  const date = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  let text = `CONVERSA WHATSAPP\n`;
  text += `----------------------------------\n`;
  text += `Cliente: ${contactName}\n`;
  text += `Exportado em: ${date}\n`;
  text += `Total de mensagens: ${messages.length}\n`;
  text += `----------------------------------\n\n`;

  messages.forEach(msg => {
    const sender = msg.from === 'vendedor' ? 'Vendedor' : 'Cliente';
    const time   = msg.time ? `[${msg.time}] ` : '';
    text += `${time}${sender}:\n${msg.text}\n\n`;
  });

  return text;
}

// ─────────────────────────────────────────────
// Criar nota na timeline do contato
// ─────────────────────────────────────────────
async function createNote(contactId, noteBody) {
  const res = await axios.post(
    `${HUBSPOT_BASE}/crm/v3/objects/notes`,
    {
      properties: {
        hs_note_body: noteBody,
        hs_timestamp: Date.now()
      },
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
      }]
    },
    { headers: headers() }
  );
  return res.data;
}

// ─────────────────────────────────────────────
// ENDPOINT PRINCIPAL
// ─────────────────────────────────────────────
app.post('/api/whatsapp-to-hubspot', async (req, res) => {
  try {
    const { contactName, phone, messages } = req.body;

    if (!messages || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhuma mensagem encontrada. Abra uma conversa antes de salvar.' });
    }

    const digits = phone ? phone.replace(/\D/g, '') : '';

    console.log('');
    console.log('Nova exportacao recebida');
    console.log('  Contato : ' + (contactName || 'Desconhecido'));
    console.log('  Telefone: ' + (phone || 'nao capturado'));
    console.log('  Msgs    : ' + messages.length + ' (apenas mensagens novas, após deduplicação na extensão)');

    // Sem telefone — nao e possivel buscar
    if (!digits || digits.length < 8) {
      console.log('  ERRO: Telefone nao capturado ou invalido');
      return res.status(400).json({
        success: false,
        error: 'Numero de telefone nao encontrado nesta conversa. O contato precisa ter o numero visivel no WhatsApp.'
      });
    }

    const variants = phoneVariants(phone);
    console.log('  Formatos testados: ' + variants.join(', '));

    const contact = await findContactByPhone(phone);

    if (!contact) {
      console.log('  ATENCAO: Contato nao encontrado no HubSpot');
      return res.status(404).json({
        success: false,
        error: `Contato com telefone ${phone} nao encontrado no HubSpot. Verifique se o numero esta cadastrado no campo "Telefone" ou "Celular" do contato.`
      });
    }

    const fullName = [
      contact.properties?.firstname,
      contact.properties?.lastname
    ].filter(Boolean).join(' ') || contactName || 'Contato';

    console.log('  Contato encontrado: ' + fullName + ' (ID ' + contact.id + ')');

    const noteBody = formatConversation(contactName || fullName, messages);
    const note     = await createNote(contact.id, noteBody);

    console.log('  Nota criada: ID ' + note.id);

    return res.json({
      success: true,
      message: `Conversa salva na timeline de ${fullName}!`,
      contactId: contact.id,
      contactName: fullName,
      noteId: note.id,
      msgCount: messages.length
    });

  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error('  ERRO: ' + errMsg);

    if (err.response?.status === 401) {
      return res.status(401).json({ success: false, error: 'Token invalido ou expirado. Verifique o arquivo .env' });
    }
    if (err.response?.status === 403) {
      return res.status(403).json({ success: false, error: 'Permissao negada. Verifique os escopos do Private App no HubSpot.' });
    }

    return res.status(500).json({
      success: false,
      error: 'Erro interno ao processar a conversa.',
      details: errMsg
    });
  }
});

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  const tokenOk = !!HUBSPOT_TOKEN && HUBSPOT_TOKEN.startsWith('pat-');
  res.json({
    status: 'OK',
    token_configured: tokenOk,
    message: tokenOk ? 'Middleware pronto para uso!' : 'Token nao configurado. Verifique o arquivo .env'
  });
});

// ─────────────────────────────────────────────
// INICIAR SERVIDOR
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('==========================================');
  console.log('  WhatsApp para HubSpot CRM - Middleware');
  console.log('==========================================');
  console.log('');
  console.log('Servidor rodando em http://localhost:' + PORT);
  console.log('Health check : http://localhost:' + PORT + '/health');
  console.log('Endpoint     : POST http://localhost:' + PORT + '/api/whatsapp-to-hubspot');

  if (!HUBSPOT_TOKEN || !HUBSPOT_TOKEN.startsWith('pat-')) {
    console.log('');
    console.log('ATENCAO: Token HubSpot nao configurado!');
    console.log('Edite o arquivo .env e adicione seu token.');
  } else {
    console.log('');
    console.log('Token HubSpot configurado com sucesso!');
  }
  console.log('');
  console.log('Aguardando requisicoes...');
  console.log('');
});
