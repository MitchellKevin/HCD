// ── STATE ─────────────────────────────────────────────────────────────────────
let detectedGenre = 'default';
let isPaused      = false;
let playbackRate  = 1;

const GENRE_LABELS = {
  horror: 'Horror', nieuws: 'Nieuws', tech: 'Tech',
  fictie: 'Fictie', 'poëzie': 'Poëzie', default: 'Neutraal'
};

// ── ELEMENTS ──────────────────────────────────────────────────────────────────
const badge           = document.getElementById('genre-badge');
const reden           = document.getElementById('genre-reden');
const select          = document.getElementById('profiel-select');
const stemStijlSelect = document.getElementById('stem-stijl-select');
const speedSelect     = document.getElementById('speed-select');
const btnPlay         = document.getElementById('btn-play');
const btnPause        = document.getElementById('btn-pause');
const btnStop         = document.getElementById('btn-stop');
const btnSummary      = document.getElementById('btn-summary');
const statusEl        = document.getElementById('status');
const waveform        = document.getElementById('waveform');
const progressFill    = document.getElementById('progress-bar-fill');
const progressLabel   = document.getElementById('progress-label');

// ── UI STATE ──────────────────────────────────────────────────────────────────
function setReadingState(state) {
  if (state === 'playing') {
    btnPlay.disabled  = true;
    btnPause.disabled = false;
    btnStop.disabled  = false;
    waveform.classList.add('active');
    btnPause.innerHTML = '<span aria-hidden="true">⏸</span> Pauze';
    btnPause.setAttribute('aria-label', 'Pauzeren');
  } else if (state === 'paused') {
    btnPlay.disabled  = true;
    btnPause.disabled = false;
    btnStop.disabled  = false;
    waveform.classList.remove('active');
    btnPause.innerHTML = '<span aria-hidden="true">▶</span> Verder';
    btnPause.setAttribute('aria-label', 'Verder afspelen');
  } else {
    btnPlay.disabled  = false;
    btnPause.disabled = true;
    btnStop.disabled  = true;
    waveform.classList.remove('active');
    btnPause.innerHTML = '<span aria-hidden="true">⏸</span> Pauze';
    btnPause.setAttribute('aria-label', 'Pauzeren');
  }
}

function updateProgress(blockIndex, totalBlocks) {
  const pct = totalBlocks > 0 ? Math.round(((blockIndex + 1) / totalBlocks) * 100) : 0;
  progressFill.style.width = pct + '%';
  progressFill.setAttribute('aria-valuenow', pct);
  progressLabel.textContent = `${blockIndex + 1} van ${totalBlocks}`;
}

function resetProgress() {
  progressFill.style.width = '0%';
  progressFill.setAttribute('aria-valuenow', 0);
  progressLabel.textContent = 'Niet actief';
}

function getActiveProfile() {
  return select.value === 'auto' ? detectedGenre : select.value;
}

// ── PAGE ANALYSIS ─────────────────────────────────────────────────────────────
function analyzeActivePage() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const skip = new Set(['nav','header','footer','aside','script','style','noscript']);
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
          acceptNode(n) { return skip.has(n.tagName.toLowerCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
        });
        const blocks = [];
        let node;
        while ((node = walker.nextNode())) {
          const tag = node.tagName.toLowerCase();
          if (['p','h2','h3','li','blockquote'].includes(tag)) {
            const t = node.innerText?.trim();
            if (t && t.length > 30) blocks.push(t);
          }
        }
        return {
          title:   document.title,
          meta:    document.querySelector('meta[name="description"]')?.content || '',
          excerpt: blocks.slice(0, 6).join(' ').slice(0, 800),
          url:     location.href
        };
      }
    }, ([result]) => {
      if (!result?.result) return;
      const { title, meta, excerpt, url } = result.result;
      window._pageData = { title, excerpt };

      chrome.runtime.sendMessage(
        { type: 'ANALYZE_PAGE', title, meta, excerpt, url },
        (response) => {
          detectedGenre     = response?.genre || 'default';
          badge.textContent = GENRE_LABELS[detectedGenre] || detectedGenre;
          reden.textContent = response?.reden || '';
        }
      );
    });
  });
}

analyzeActivePage();

// ── BUTTON HANDLERS ───────────────────────────────────────────────────────────
speedSelect.addEventListener('change', () => {
  playbackRate = parseFloat(speedSelect.value);
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SET_RATE', rate: playbackRate });
  });
});

btnPlay.addEventListener('click', () => {
  isPaused = false;
  resetProgress();
  statusEl.textContent = '';
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'SET_GENRE', genre: getActiveProfile() });
    chrome.tabs.sendMessage(tab.id, {
      type:      'START',
      profile:   getActiveProfile(),
      stemStijl: stemStijlSelect.value,
      rate:      playbackRate
    });
  });
});

btnPause.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    if (!isPaused) {
      chrome.tabs.sendMessage(tab.id, { type: 'PAUSE' });
      isPaused = true;
    } else {
      chrome.tabs.sendMessage(tab.id, { type: 'RESUME' });
      isPaused = false;
    }
  });
});

btnStop.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'STOP' });
  });
  isPaused = false;
  resetProgress();
  statusEl.textContent = '';
});

btnSummary.addEventListener('click', () => {
  btnSummary.disabled  = true;
  statusEl.textContent = 'Samenvatting genereren…';

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) { btnSummary.disabled = false; return; }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const skip = new Set(['nav','header','footer','aside','script','style','noscript']);
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
          acceptNode(n) { return skip.has(n.tagName.toLowerCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
        });
        const blocks = [];
        let node;
        while ((node = walker.nextNode())) {
          const tag = node.tagName.toLowerCase();
          if (['p','h1','h2','h3','h4','li','blockquote'].includes(tag)) {
            const t = node.innerText?.trim();
            if (t && t.length > 20) blocks.push(t);
          }
        }
        return { title: document.title, fullText: blocks.join('\n') };
      }
    }, ([result]) => {
      if (!result?.result) {
        statusEl.textContent = 'Kon pagina niet lezen.';
        btnSummary.disabled = false;
        return;
      }
      const { title, fullText } = result.result;
      chrome.runtime.sendMessage({ type: 'SUMMARIZE_PAGE', title, fullText }, (response) => {
        btnSummary.disabled  = false;
        statusEl.textContent = response?.error ? `Fout: ${response.error}` : '';
        const summary = response?.summary || 'Geen samenvatting beschikbaar.';
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (!tab?.id) return;
          chrome.tabs.sendMessage(tab.id, {
            type:        'START',
            profile:     getActiveProfile(),
            stemStijl:   stemStijlSelect.value,
            rate:        playbackRate,
            summaryOnly: true,
            summaryText: summary
          });
        });
      });
    });
  });
});

document.getElementById('link-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ── MESSAGES FROM CONTENT SCRIPT ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {

  if (msg.type === 'READING_STATE') {
    setReadingState(msg.state);
    if (msg.state === 'paused') isPaused = true;
    if (msg.state === 'idle')   isPaused = false;
  }

  if (msg.type === 'READING_PROGRESS') {
    updateProgress(msg.blockIndex, msg.totalBlocks);
  }

  if (msg.type === 'READING_DONE') {
    setReadingState('idle');
    isPaused = false;
    resetProgress();
    statusEl.textContent = 'Klaar met voorlezen.';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  }

  if (msg.type === 'STATUS') {
    statusEl.textContent = msg.text || '';
  }
});

// ── ENSURE CONTENT SCRIPT IS LOADED ──────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab?.id) chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
});
