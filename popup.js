let detectedGenre = 'default';
let isPaused = false;
let playbackRate = 1;

const badge       = document.getElementById('genre-badge');
const reden       = document.getElementById('genre-reden');
const select      = document.getElementById('profiel-select');
const speedSelect = document.getElementById('speed-select');
const btnSummary  = document.getElementById('btn-summary');

const statusEl = document.getElementById('status');
const btnPlay  = document.getElementById('btn-play');
const btnPause = document.getElementById('btn-pause');
const btnStop  = document.getElementById('btn-stop');

const GENRE_LABELS = {
  horror: 'Horror',
  nieuws: 'Nieuws',
  tech: 'Tech',
  fictie: 'Fictie',
  poëzie: 'Poëzie',
  default: 'Neutraal'
};

// SPEED STATE
speedSelect.addEventListener('change', () => {
  playbackRate = parseFloat(speedSelect.value);
});

// Analyse actieve tab
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const skip = new Set(['nav','header','footer','aside','script','style','noscript']);
      const blocks = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode(n) {
          return skip.has(n.tagName.toLowerCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      let node;
      while ((node = walker.nextNode())) {
        if (['p','h2','h3','li','blockquote'].includes(node.tagName.toLowerCase())) {
          const t = node.innerText?.trim();
          if (t && t.length > 30) blocks.push(t);
        }
      }
      return {
        title: document.title,
        meta: document.querySelector('meta[name="description"]')?.content || '',
        excerpt: blocks.slice(0, 6).join(' ').slice(0, 800),
        url: location.href
      };
    }
  }, ([result]) => {
    if (!result?.result) return;

    const { title, meta, excerpt, url } = result.result;

    window._pageData = { title, excerpt };

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

// SUMMARY
btnSummary.addEventListener('click', () => {
  const data = window._pageData;
  if (!data) { statusEl.textContent = 'Pagina nog niet geladen.'; return; }

  statusEl.textContent = 'Samenvatting ophalen…';
  btnSummary.disabled = true;

  chrome.runtime.sendMessage(
    { type: 'SUMMARIZE_PAGE', title: data.title, excerpt: data.excerpt },
    (response) => {
      btnSummary.disabled = false;
      const summary = response?.summary || 'Geen samenvatting beschikbaar.';
      statusEl.textContent = '';

      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'START',
          profile: getActiveProfile(),
          rate: playbackRate,
          summaryOnly: true,
          summaryText: summary
        });
      });
    }
  );
});

// START
btnPlay.addEventListener('click', () => {
  isPaused = false;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    // Sync selected genre to content script for keyboard shortcut use
    chrome.tabs.sendMessage(tab.id, { type: 'SET_GENRE', genre: getActiveProfile() });

    chrome.tabs.sendMessage(tab.id, {
      type: 'START',
      profile: getActiveProfile(),
      rate: playbackRate
    });

    statusEl.textContent = 'Bezig met voorlezen…';
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
    statusEl.textContent = '';
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
    statusEl.textContent = 'Klaar met voorlezen.';
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