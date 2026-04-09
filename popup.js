let detectedGenre = 'default';
let isPaused = false;
let playbackRate = 1;

const badge   = document.getElementById('genre-badge');
const reden   = document.getElementById('genre-reden');
const select  = document.getElementById('profiel-select');
const speedSelect = document.getElementById('speed-select');

const status  = document.getElementById('status');
const btnPlay  = document.getElementById('btn-play');
const btnPause = document.getElementById('btn-pause');
const btnStop  = document.getElementById('btn-stop');

const GENRE_LABELS = {
  horror: '👻 Horror',
  nieuws: '📰 Nieuws',
  tech: '💻 Tech',
  fictie: '📖 Fictie',
  poëzie: '✍️ Poëzie',
  default: '💬 Neutraal'
};

// SPEED STATE
speedSelect.addEventListener('change', () => {
  playbackRate = parseFloat(speedSelect.value);
});

// Analyse actieve tab
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      title: document.title,
      meta: document.querySelector('meta[name="description"]')?.content || '',
      excerpt: document.body.innerText.slice(0, 600),
      url: location.href
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

// START
btnPlay.addEventListener('click', () => {
  isPaused = false;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, {
      type: 'START',
      profile: getActiveProfile(),
      rate: playbackRate
    });

    status.textContent = 'Bezig met voorlezen…';
  });
});

// PAUSE / RESUME
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

// STOP
btnStop.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: 'STOP' });
    status.textContent = '';
    btnPause.textContent = 'Pauze';
    isPaused = false;
  });
});

// options page
document.getElementById('link-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// klaar melding
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'READING_DONE') {
    status.textContent = 'Klaar met voorlezen.';
  }
});

// zorg dat content script geladen is
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, files: ['content.js'] }
  );
});

speedSelect.addEventListener('change', () => {
  const rate = parseFloat(speedSelect.value);

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SET_RATE',
      rate
    });
  });
});