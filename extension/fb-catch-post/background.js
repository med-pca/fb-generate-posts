/**
 * Après une capture dans la page, le popup est fermé (cliquer dans la page
 * le ferme). On marque l'icône, et on tente de rouvrir le popup : Chrome ne
 * l'autorise pas partout, d'où la pastille et le message dans la page.
 */
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'fcp:captured') return;
  const tabId = sender.tab?.id;
  chrome.action.setBadgeBackgroundColor({ color: '#1a7f37' });
  chrome.action.setBadgeText({ text: '1', ...(tabId ? { tabId } : {}) });
  chrome.action.openPopup?.().catch(() => {});
});
