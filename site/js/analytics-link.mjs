const copy = {
  en: { title: 'Connect your Frazia visit', ready: 'Connect this browser visit with your Frazia installation for usage analytics.', button: 'Open Frazia', unavailable: 'No eligible download was found in this browser. You can continue using Frazia without connecting.' },
  ru: { title: 'Связать посещение сайта с Frazia', ready: 'Связать посещение этого сайта с установленной Frazia для аналитики использования.', button: 'Открыть Frazia', unavailable: 'В этом браузере не найдено подходящее скачивание. Вы можете пользоваться Frazia без связывания.' },
};
let language = 'en';
let id, clicked, choice;
try {
  if (localStorage.getItem('voicehelper-language') === 'ru') language = 'ru';
  choice = localStorage.getItem('frazia-analytics-choice');
  id = localStorage.getItem('frazia-analytics-id');
  clicked = Number(localStorage.getItem('frazia-analytics-download'));
} catch { /* linking remains unavailable */ }
document.documentElement.lang = language;
document.getElementById('title').textContent = copy[language].title;
const state = new URLSearchParams(location.hash.slice(1)).get('state');
// Keep the state out of browser history after reading it.
history.replaceState(null, '', location.pathname);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const elapsed = Date.now() - clicked;
const valid = choice === 'allow' && uuid.test(id || '') && uuid.test(state || '') &&
  Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 24 * 60 * 60 * 1000;
document.getElementById('message').textContent = valid ? copy[language].ready : copy[language].unavailable;
if (valid) {
  const link = document.getElementById('connect');
  link.href = `frazia://analytics-link?state=${encodeURIComponent(state)}&visitor=${encodeURIComponent(id)}`;
  link.textContent = copy[language].button;
  link.hidden = false;
}
