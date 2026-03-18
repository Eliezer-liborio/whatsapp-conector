// content.js — WhatsApp para HubSpot CRM
// Extração de telefone via data-id das mensagens (fonte mais confiável)
// Funciona mesmo para contatos salvos na agenda

const MIDDLEWARE_URL = 'http://localhost:3000/api/whatsapp-to-hubspot';
const BTN_ID = 'hubspot-save-btn';

// ─────────────────────────────────────────────
// Cria o botão fixo no topo direito
// ─────────────────────────────────────────────
function createFixedButton() {
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.title = 'Salvar conversa no HubSpot CRM';

  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
    style="flex-shrink:0">
    <polyline points="16 16 12 12 8 16"></polyline>
    <line x1="12" y1="12" x2="12" y2="21"></line>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path>
  </svg>`;

  btn.innerHTML = svgIcon + '<span id="hubspot-btn-text">Salvar no HubSpot</span>';

  btn.style.cssText = `
    position: fixed;
    top: 12px;
    right: 80px;
    z-index: 99999;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background-color: #FF7A59;
    color: #ffffff;
    border: none;
    border-radius: 20px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 700;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 3px 10px rgba(0,0,0,0.30);
    letter-spacing: 0.2px;
    transition: background-color 0.2s, transform 0.15s, box-shadow 0.2s;
    user-select: none;
  `;

  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) {
      btn.style.backgroundColor = '#e8623a';
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 5px 16px rgba(0,0,0,0.35)';
    }
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 3px 10px rgba(0,0,0,0.30)';
    if (!btn.disabled) btn.style.backgroundColor = '#FF7A59';
  });

  btn.addEventListener('click', handleSave);
  document.body.appendChild(btn);
}

// ─────────────────────────────────────────────
// ESTRATÉGIA PRINCIPAL: extrai número do
// atributo data-id das mensagens.
//
// O WhatsApp Web armazena em data-id o ID único
// de cada mensagem no formato:
//   "false_5566996215988@c.us_XXXXXXXX"  (recebida)
//   "true_5566996215988@c.us_XXXXXXXX"   (enviada)
//
// O número está SEMPRE presente aqui, mesmo
// quando o contato está salvo na agenda.
// ─────────────────────────────────────────────
function extractPhoneFromDataId() {
  // Busca mensagens RECEBIDAS (false_ = mensagem do contato)
  const received = document.querySelectorAll('[data-id^="false_"]');
  for (const el of received) {
    const dataId = el.getAttribute('data-id') || '';
    const match = dataId.match(/false_(\d+)@c\.us/);
    if (match && match[1].length >= 8) {
      return match[1]; // retorna somente dígitos
    }
  }

  // Fallback: mensagens enviadas (true_ = mensagem do usuário)
  // Neste caso o número é do DESTINATÁRIO
  const sent = document.querySelectorAll('[data-id^="true_"]');
  for (const el of sent) {
    const dataId = el.getAttribute('data-id') || '';
    const match = dataId.match(/true_(\d+)@c\.us/);
    if (match && match[1].length >= 8) {
      return match[1];
    }
  }

  return null;
}

// ─────────────────────────────────────────────
// ESTRATÉGIA 2: extrai número da URL da página
// Funciona quando a conversa é aberta via link
// https://web.whatsapp.com/send?phone=55...
// ─────────────────────────────────────────────
function extractPhoneFromURL() {
  try {
    const url = new URL(window.location.href);
    const phoneParam = url.searchParams.get('phone');
    if (phoneParam) {
      const digits = phoneParam.replace(/\D/g, '');
      if (digits.length >= 8) return digits;
    }
  } catch (e) {}
  return null;
}

// ─────────────────────────────────────────────
// ESTRATÉGIA 3: extrai número do subtítulo
// do header (funciona para contatos NÃO salvos)
// ─────────────────────────────────────────────
function extractPhoneFromHeader() {
  const selectors = [
    'span[data-testid="conversation-info-header-subtitle"]',
    '#main header span[dir="auto"]:nth-of-type(2)',
    'header span[title]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const txt = el.innerText.trim();
      const digits = txt.replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) return digits;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// ESTRATÉGIA 4: extrai número do atributo
// data-pre-plain-text das mensagens
// Formato: "[hora, data] +55 66 99999-9999:"
// ─────────────────────────────────────────────
function extractPhoneFromPreText() {
  const els = document.querySelectorAll('[data-pre-plain-text]');
  for (const el of els) {
    const preText = el.getAttribute('data-pre-plain-text') || '';
    // Extrai número após "] " e antes de ":"
    const match = preText.match(/\]\s*(\+?[\d\s\-().]{8,})\s*:/);
    if (match) {
      const digits = match[1].replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) return digits;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// Captura nome do contato
// ─────────────────────────────────────────────
function getContactName() {
  const selectors = [
    'span[data-testid="conversation-info-header-chat-title"]',
    '#main header span[dir="auto"]:first-of-type',
    '#main header div[data-testid="conversation-info-header"] span[dir="auto"]',
    'header span[dir="auto"]',
  ];
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const txt = el.innerText.trim();
      const lower = txt.toLowerCase();
      if (
        txt.length > 1 &&
        !['online', 'offline', 'digitando...', 'gravando áudio...', 'gravando audio...'].includes(lower)
      ) {
        return txt;
      }
    }
  }
  return 'Desconhecido';
}

// ─────────────────────────────────────────────
// Orquestra todas as estratégias de captura
// ─────────────────────────────────────────────
function getContactInfo() {
  const name = getContactName();

  // Tenta cada estratégia em ordem de confiabilidade
  const phone =
    extractPhoneFromDataId()   ||  // ← mais confiável
    extractPhoneFromURL()      ||
    extractPhoneFromHeader()   ||
    extractPhoneFromPreText(); //  ← menos confiável

  return { name, phone };
}

// ─────────────────────────────────────────────
// Captura mensagens da conversa
// ─────────────────────────────────────────────
function getMessages() {
  const messages = [];

  // Método 1: data-pre-plain-text (mais estruturado)
  const copyables = document.querySelectorAll('[data-pre-plain-text]');
  if (copyables.length > 0) {
    copyables.forEach(el => {
      const preText = el.getAttribute('data-pre-plain-text') || '';
      const timeMatch = preText.match(/\[(\d{2}:\d{2})/);
      const time = timeMatch ? timeMatch[1] : '';

      const isOut = !!el.closest('div.message-out') ||
                    !!el.closest('[data-testid="msg-container-out"]');

      const textEl =
        el.querySelector('span[data-testid="msg-text"]') ||
        el.querySelector('span.selectable-text') ||
        el;

      const txt = textEl.innerText.trim();
      if (txt) {
        messages.push({ text: txt, time, from: isOut ? 'vendedor' : 'cliente' });
      }
    });
    if (messages.length > 0) return messages;
  }

  // Método 2: containers de mensagem
  const msgElements = document.querySelectorAll(
    'div[data-testid="msg-container"], div.message-in, div.message-out'
  );
  msgElements.forEach(el => {
    const textEl =
      el.querySelector('span[data-testid="msg-text"]') ||
      el.querySelector('span.selectable-text') ||
      el.querySelector('.copyable-text span');
    const timeEl = el.querySelector("span[data-testid='msg-time']");
    const isOut  = el.classList.contains('message-out');
    if (textEl && textEl.innerText.trim()) {
      messages.push({
        text: textEl.innerText.trim(),
        time: timeEl ? timeEl.innerText.trim() : '',
        from: isOut ? 'vendedor' : 'cliente',
      });
    }
  });

  return messages;
}

// ─────────────────────────────────────────────
// Ação do botão
// ─────────────────────────────────────────────
async function handleSave() {
  const btn     = document.getElementById(BTN_ID);
  const btnText = document.getElementById('hubspot-btn-text');
  if (!btn || !btnText) return;

  const { name, phone } = getContactInfo();
  const messages = getMessages();

  if (messages.length === 0) {
    showToast('Abra uma conversa antes de salvar.', 'error');
    return;
  }

  // Estado: carregando
  btnText.innerText = 'Salvando...';
  btn.disabled = true;
  btn.style.backgroundColor = '#aaaaaa';
  btn.style.cursor = 'not-allowed';

  try {
    const res = await fetch(MIDDLEWARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactName: name, phone, messages }),
    });

    const data = await res.json();

    if (data.success) {
      showToast('Conversa salva no HubSpot!', 'success');
      btnText.innerText = 'Salvo!';
      btn.style.backgroundColor = '#25D366';
      setTimeout(() => resetButton(btn, btnText), 3000);
    } else {
      showToast(data.error || 'Erro ao salvar.', 'error');
      resetButton(btn, btnText);
    }
  } catch (err) {
    showToast('Middleware offline. Inicie o servidor Node.js (start.bat).', 'error');
    resetButton(btn, btnText);
  }
}

function resetButton(btn, btnText) {
  btnText.innerText = 'Salvar no HubSpot';
  btn.style.backgroundColor = '#FF7A59';
  btn.disabled = false;
  btn.style.cursor = 'pointer';
}

// ─────────────────────────────────────────────
// Toast de notificação
// ─────────────────────────────────────────────
function showToast(message, type = 'success') {
  const existing = document.getElementById('hubspot-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'hubspot-toast';
  toast.innerText = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    background-color: ${type === 'success' ? '#25D366' : '#e53935'};
    color: white;
    padding: 12px 28px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 999999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    opacity: 1;
    transition: opacity 0.4s;
    max-width: 480px;
    text-align: center;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

// ─────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────
createFixedButton();

// Recria o botão se o DOM for modificado (SPA navigation)
const observer = new MutationObserver(() => {
  if (!document.getElementById(BTN_ID)) createFixedButton();
});
observer.observe(document.body, { childList: true, subtree: false });
