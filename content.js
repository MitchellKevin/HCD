let isReading = false;
let isPaused  = false;
let currentGenre = 'default';

let audioContext  = null;
let currentSource = null;
let playbackRate  = 1;

// Position tracking for proper pause/resume
let pausedBlockIndex    = 0;
let pausedSentenceIndex = 0;

const PAUSES = {
  horror:  900,
  nieuws:  250,
  tech:    320,
  fictie:  500,
  'poëzie': 1100,
  default: 380
};

// -----------------------------
// TEXT EXTRACTION (structured)
// -----------------------------
function extractPageBlocks() {
  const skip = new Set(['nav','header','footer','aside','script','style','noscript']);

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (skip.has(node.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const blocks = [];
  let node;

  while ((node = walker.nextNode())) {
    const tag = node.tagName.toLowerCase();
    if (['p','h1','h2','h3','h4','li','blockquote'].includes(tag)) {
      const text = node.innerText?.trim();
      if (text && text.length > 20) {
        blocks.push({
          text,
          isHeading: ['h1','h2','h3','h4'].includes(tag)
        });
      }
    }
  }

  return blocks;
}

// -----------------------------
// SPLIT SENTENCES
// -----------------------------
function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+/g) || [text];
}

// -----------------------------
// AUDIO PLAYBACK
// -----------------------------
async function playBase64Audio(base64) {
  if (!audioContext) audioContext = new AudioContext();

  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);

  return new Promise((resolve) => {
    currentSource = audioContext.createBufferSource();
    currentSource.buffer = audioBuffer;
    currentSource.playbackRate.value = playbackRate;
    currentSource.connect(audioContext.destination);
    currentSource.onended = resolve;
    currentSource.start();
  });
}

// -----------------------------
// FETCH + PLAY ONE SENTENCE
// -----------------------------
async function speakSentence(text, genre) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_AUDIO', text, genre },
      async (response) => {
        if (!response?.base64) { console.warn('Audio ontbreekt'); return resolve(); }
        try { await playBase64Audio(response.base64); } catch (e) { console.warn('Playback error:', e); }
        resolve();
      }
    );
  });
}

// -----------------------------
// START (with position support)
// -----------------------------
async function startReading(genre, fromBlock = 0, fromSentence = 0) {
  stopReading();
  isReading = true;
  isPaused  = false;
  currentGenre = genre;

  const blocks = extractPageBlocks();
  const pause  = PAUSES[genre] || PAUSES.default;

  for (let bi = fromBlock; bi < blocks.length; bi++) {
    if (!isReading) break;

    const block = blocks[bi];

    // Announce section headings for spatial awareness
    if (block.isHeading) {
      await speakSentence(`Sectie: ${block.text}`, genre);
      if (!isReading) { pausedBlockIndex = bi; pausedSentenceIndex = 0; return; }
      await new Promise(r => setTimeout(r, 600));
      continue;
    }

    const sentences  = splitSentences(block.text);
    const startSent  = (bi === fromBlock) ? fromSentence : 0;

    for (let si = startSent; si < sentences.length; si++) {
      if (!isReading) {
        pausedBlockIndex    = bi;
        pausedSentenceIndex = si;
        return;
      }

      const trimmed = sentences[si].trim();
      if (!trimmed) continue;

      pausedBlockIndex    = bi;
      pausedSentenceIndex = si;

      await speakSentence(trimmed, genre);
      if (!isReading) { return; }
      await new Promise(r => setTimeout(r, pause));
    }
  }

  isReading = false;
  chrome.runtime.sendMessage({ type: 'READING_DONE' });
}

// -----------------------------
// STOP / PAUSE
// -----------------------------
function stopReading() {
  isReading = false;
  if (currentSource) {
    try { currentSource.stop(); } catch (_) {}
    currentSource = null;
  }
}

function pauseReading() {
  isPaused  = true;
  isReading = false;
  if (currentSource) {
    try { currentSource.stop(); } catch (_) {}
    currentSource = null;
  }
}

// -----------------------------
// KEYBOARD SHORTCUTS
// Alt+Shift+R = start/restart
// Alt+Shift+P = pause / resume
// Alt+Shift+S = stop
// -----------------------------
document.addEventListener('keydown', (e) => {
  if (!e.altKey || !e.shiftKey) return;

  if (e.key === 'R') {
    e.preventDefault();
    pausedBlockIndex = 0; pausedSentenceIndex = 0;
    startReading(currentGenre);
    chrome.runtime.sendMessage({ type: 'READING_STARTED', genre: currentGenre });
  }

  if (e.key === 'P') {
    e.preventDefault();
    if (isReading) {
      pauseReading();
      chrome.runtime.sendMessage({ type: 'READING_PAUSED' });
    } else if (isPaused) {
      startReading(currentGenre, pausedBlockIndex, pausedSentenceIndex);
      chrome.runtime.sendMessage({ type: 'READING_RESUMED' });
    }
  }

  if (e.key === 'S') {
    e.preventDefault();
    stopReading();
    isPaused = false;
    chrome.runtime.sendMessage({ type: 'READING_STOPPED' });
  }
});

// -----------------------------
// MESSAGE HANDLER
// -----------------------------
chrome.runtime.onMessage.addListener((msg) => {

  if (msg.type === 'START') {
    playbackRate = msg.rate || 1;

    if (msg.summaryOnly && msg.summaryText) {
      stopReading();
      isReading = true;
      speakSentence(msg.summaryText, msg.profile).then(() => {
        isReading = false;
        chrome.runtime.sendMessage({ type: 'READING_DONE' });
      });
      return;
    }

    pausedBlockIndex    = 0;
    pausedSentenceIndex = 0;
    startReading(msg.profile);
  }

  if (msg.type === 'STOP') {
    stopReading();
    isPaused = false;
  }

  if (msg.type === 'PAUSE') {
    pauseReading();
  }

  if (msg.type === 'RESUME') {
    startReading(currentGenre, pausedBlockIndex, pausedSentenceIndex);
  }

  if (msg.type === 'SET_GENRE') {
    currentGenre = msg.genre;
  }

  if (msg.type === 'SET_RATE') {
    playbackRate = msg.rate;
    if (currentSource) { try { currentSource.stop(); } catch (_) {} }
  }
});

// -----------------------------
window.addEventListener('beforeunload', stopReading);
