let detectedGenre = 'default';
let isPaused = false;

const badge   = document.getElementById('genre-badge');
const reden   = document.getElementById('genre-reden');
const select  = document.getElementById('profiel-select');
const status  = document.getElementById('status');
const btnPlay  = document.getElementById('btn-play');
const btnPause = document.getElementById('btn-pause');
const btnStop  = document.getElementById('btn-stop');

const GENRE_LABELS = {
  horror: '👻 Horror', nieuws: '📰 Nieuws', tech: '💻 Tech',
  fictie: '📖 Fictie', 'poëzie': '✍️ Poëzie', default: '💬 Neutraal'
};

// Haal de actieve tab op en analyseer de pagina
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      title:   document.title,
      meta:    document.querySelector('meta[name="description"]')?.content || '',
      excerpt: document.body.innerText.slice(0, 600),
      url:     location.href
    })
  }, ([result]) => {
    if (!result?.result) return;
    const { title, meta, excerpt, url } = result.result;

    chrome.runtime.sendMessage(
      { type: 'ANALYZE_PAGE', title, meta, excerpt, url },
      (response) => {
        detectedGenre = response?.genre || 'default';
        badge.textContent = GENRE_LABELS[detectedGenre] || detectedGenre;
        reden.textContent = response?.reden || '';
      }
    );
  });
});

function getActiveProfile() {
  const val = select.value;
  return val === 'auto' ? detectedGenre : val;
}

btnPlay.addEventListener('click', () => {
  isPaused = false;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: 'START', profile: getActiveProfile() });
    status.textContent = 'Bezig met voorlezen…';
  });
});

btnPause.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!isPaused) {
      chrome.tabs.sendMessage(tab.id, { type: 'PAUSE' });
      btnPause.textContent = 'Verder';
      isPaused = true;
    } else {
      chrome.tabs.sendMessage(tab.id, { type: 'RESUME' });
      btnPause.textContent = 'Pauze';
      isPaused = false;
    }
  });
});

btnStop.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: 'STOP' });
    status.textContent = '';
    btnPause.textContent = 'Pauze';
    isPaused = false;
  });
});

document.getElementById('link-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Luister of het voorlezen klaar is
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'READING_DONE') status.textContent = 'Klaar met voorlezen.';
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, files: ['content.js'] },
    () => { /* script is nu zeker geladen */ }
  );
});