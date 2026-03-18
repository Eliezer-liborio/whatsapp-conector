// background.js

// Ouve mensagens enviadas pelo popup ou content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "exportToHubSpot") {
    console.log("Recebida solicitação de exportação:", request.data);
    
    // Simula o envio para a API Middleware (Node.js)
    // Na implementação real, faria um fetch() para o backend
    
    // Simulação de sucesso
    setTimeout(() => {
      sendResponse({ success: true, message: "Conversa salva com sucesso na timeline do HubSpot!" });
    }, 1500);
    
    // Retorna true para indicar que a resposta será enviada assincronamente
    return true;
  }
});
