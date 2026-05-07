// ── INJECT HIGHLIGHT STYLE ────────────────────────────────────────────────────
(function () {
  const s = document.createElement('style');
  s.textContent = `
    .hvsr-active {
      background: rgba(79,70,229,0.07) !important;
      border-radius: 6px !important;
      outline: 2px solid rgba(79,70,229,0.25) !important;
      outline-offset: 5px !important;
      transition: background 0.25s ease, outline-color 0.25s ease !important;
    }
  `;
  document.head.appendChild(s);
})();

// ── STATE ─────────────────────────────────────────────────────────────────────
let isReading        = false;
let isPaused         = false;
let currentGenre     = 'default';
let currentStemStijl = 'normaal';
let audioContext     = null;
let currentSource    = null;
let playbackRate     = 1;
let readingGeneration = 0;

let pausedBlockIndex    = 0;
let pausedSentenceIndex = 0;

const PAUSES = {
  horror: 900, nieuws: 250, tech: 320, fictie: 500, 'poëzie': 1100, default: 380
};

// ── TEXT EXTRACTION ───────────────────────────────────────────────────────────
function extractPageBlocks() {
  const skip = new Set(['nav','header','footer','aside','script','style','noscript']);
  const walker = document.createTreeWalker(
    document.body, NodeFilter.SHOW_ELEMENT,
    { acceptNode(n) { return skip.has(n.tagName.toLowerCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } }
  );
  const blocks = [];
  let node;
  while ((node = walker.nextNode())) {
    const tag = node.tagName.toLowerCase();
    if (['p','h1','h2','h3','h4','li','blockquote'].includes(tag)) {
      const text = node.innerText?.trim();
      if (text && text.length > 20) {
        blocks.push({ text, isHeading: ['h1','h2','h3','h4'].includes(tag), el: node });
      }
    }
  }
  return blocks;
}

function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+/g) || [text];
}

// ── HIGHLIGHT ─────────────────────────────────────────────────────────────────
function setActiveBlock(el) {
  document.querySelectorAll('.hvsr-active').forEach(e => e.classList.remove('hvsr-active'));
  if (el) {
    el.classList.add('hvsr-active');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearActiveBlock() {
  document.querySelectorAll('.hvsr-active').forEach(e => e.classList.remove('hvsr-active'));
}

// ── AUDIO ─────────────────────────────────────────────────────────────────────
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

async function speakSentence(text, genre) {
  const gen = readingGeneration;
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_AUDIO', text, genre, stemStijl: currentStemStijl },
      async (response) => {
        if (gen !== readingGeneration) { resolve(); return; }
        if (!response?.base64) {
          if (response?.error) chrome.runtime.sendMessage({ type: 'STATUS', text: response.error });
          resolve();
          return;
        }
        try { await playBase64Audio(response.base64); } catch (e) { console.warn('Playback error:', e); }
        resolve();
      }
    );
  });
}

// ── READING ENGINE ────────────────────────────────────────────────────────────
async function startReading(genre, fromBlock = 0, fromSentence = 0) {
  stopReading();
  const gen = readingGeneration;

  isReading    = true;
  isPaused     = false;
  currentGenre = genre;

  const blocks      = extractPageBlocks();
  const totalBlocks = blocks.length;
  const pause       = PAUSES[genre] || PAUSES.default;

  chrome.runtime.sendMessage({ type: 'READING_STATE', state: 'playing' });

  for (let bi = fromBlock; bi < blocks.length; bi++) {
    if (!isReading || gen !== readingGeneration) break;
    const block = blocks[bi];
    setActiveBlock(block.el);
    chrome.runtime.sendMessage({ type: 'READING_PROGRESS', blockIndex: bi, totalBlocks });

    if (block.isHeading) {
      await speakSentence(`Sectie: ${block.text}`, genre);
      if (!isReading || gen !== readingGeneration) { pausedBlockIndex = bi; pausedSentenceIndex = 0; return; }
      await new Promise(r => setTimeout(r, 600));
      continue;
    }

    const sentences = splitSentences(block.text);
    const startSent = (bi === fromBlock) ? fromSentence : 0;

    for (let si = startSent; si < sentences.length; si++) {
      if (!isReading || gen !== readingGeneration) { pausedBlockIndex = bi; pausedSentenceIndex = si; return; }
      const trimmed = sentences[si].trim();
      if (!trimmed) continue;
      pausedBlockIndex    = bi;
      pausedSentenceIndex = si;
      await speakSentence(trimmed, genre);
      if (!isReading || gen !== readingGeneration) return;
      await new Promise(r => setTimeout(r, pause));
    }
  }

  if (gen !== readingGeneration) return;
  isReading = false;
  clearActiveBlock();
  chrome.runtime.sendMessage({ type: 'READING_DONE' });
}

function stopReading() {
  readingGeneration++;
  isReading = false;
  if (currentSource) { try { currentSource.stop(); } catch (_) {} currentSource = null; }
  clearActiveBlock();
}

function pauseReading() {
  readingGeneration++;
  isPaused  = true;
  isReading = false;
  if (currentSource) { try { currentSource.stop(); } catch (_) {} currentSource = null; }
  chrome.runtime.sendMessage({ type: 'READING_STATE', state: 'paused' });
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (!e.altKey || !e.shiftKey) return;
  if (e.key === 'R') { e.preventDefault(); pausedBlockIndex = 0; pausedSentenceIndex = 0; startReading(currentGenre); }
  if (e.key === 'P') { e.preventDefault(); isReading ? pauseReading() : isPaused ? startReading(currentGenre, pausedBlockIndex, pausedSentenceIndex) : null; }
  if (e.key === 'S') { e.preventDefault(); stopReading(); isPaused = false; chrome.runtime.sendMessage({ type: 'READING_STATE', state: 'idle' }); }
});

// ── MESSAGE HANDLER ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {

  if (msg.type === 'START') {
    playbackRate     = msg.rate     || 1;
    currentStemStijl = msg.stemStijl || 'normaal';

    if (msg.summaryOnly && msg.summaryText) {
      stopReading();
      isReading = true;
      const gen = readingGeneration;
      chrome.runtime.sendMessage({ type: 'READING_STATE', state: 'playing' });
      speakSentence(msg.summaryText, msg.profile).then(() => {
        if (gen !== readingGeneration) return;
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
    chrome.runtime.sendMessage({ type: 'READING_STATE', state: 'idle' });
  }

  if (msg.type === 'PAUSE')  { pauseReading(); }

  if (msg.type === 'RESUME') { startReading(currentGenre, pausedBlockIndex, pausedSentenceIndex); }

  if (msg.type === 'SET_GENRE')  { currentGenre = msg.genre; }

  if (msg.type === 'SET_RATE') {
    playbackRate = msg.rate;
    if (currentSource) { try { currentSource.stop(); } catch (_) {} }
  }
});

window.addEventListener('beforeunload', stopReading);
