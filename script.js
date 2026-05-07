// ── VOICE CONFIG ──────────────────────────────────────────────────────────────
const VOICE_IDS = {
  default: 'EXAVITQu4vr4xnSDxMaL',
  horror:  'TX3LPaxmHKxFdv7VOQHJ',
  nieuws:  'EXAVITQu4vr4xnSDxMaL',
  tech:    'CwhRBWXzGAHq8TQ4Fs17',
  fictie:  'onwK4e9ZLuTAKqWW03F9',
  'poëzie':'XB0fDUnXU5powFXDhCwa',
};
const VOICE_SETTINGS = {
  horror:  { stability: 0.85, similarity_boost: 0.75, style: 0.60, speed: 0.78 },
  nieuws:  { stability: 0.90, similarity_boost: 0.80, style: 0.10, speed: 1.10 },
  tech:    { stability: 0.88, similarity_boost: 0.78, style: 0.15, speed: 0.97 },
  fictie:  { stability: 0.70, similarity_boost: 0.75, style: 0.45, speed: 0.88 },
  'poëzie':{ stability: 0.65, similarity_boost: 0.70, style: 0.55, speed: 0.72 },
  default: { stability: 0.80, similarity_boost: 0.75, style: 0.20, speed: 1.00 },
};

const VOICE_STYLE_IDS = {
  normaal: null,
  anime:   '21m00Tcm4TlvDq8ikWAM', // Rachel — free premade voice
  sport:   'VR6AewLTigWG4xSOukaG', // Arnold — powerful energetic male
};
const VOICE_STYLE_SETTINGS = {
  anime: { stability: 0.38, similarity_boost: 0.75, style: 0.85, speed: 1.05 },
  sport: { stability: 0.88, similarity_boost: 0.82, style: 0.92, speed: 1.25 },
};

const PAUSES = {
  horror: 900, nieuws: 250, tech: 320, fictie: 500, 'poëzie': 1100, default: 380
};
const GENRE_LABELS = {
  horror: 'Horror', nieuws: 'Nieuws', tech: 'Tech',
  fictie: 'Fictie', 'poëzie': 'Poëzie', default: 'Neutraal'
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let detectedGenre       = 'default';
let isReading           = false;
let isPaused            = false;
let playbackRate        = 1;
let audioContext        = null;
let currentSource       = null;
let pausedBlockIndex    = 0;
let pausedSentenceIndex = 0;
let pageData            = null;
let totalBlocks         = 0;
let readingGeneration   = 0;

// ── ELEMENTS ──────────────────────────────────────────────────────────────────
const overlay         = document.getElementById('popup-overlay');
const badge           = document.getElementById('genre-badge');
const reden           = document.getElementById('genre-reden');
const select          = document.getElementById('profiel-select');
const speedSelect     = document.getElementById('speed-select');
const stemStijlSelect = document.getElementById('stem-stijl-select');
const btnPlay         = document.getElementById('btn-play');
const btnPause        = document.getElementById('btn-pause');
const btnStop         = document.getElementById('btn-stop');
const btnSummary      = document.getElementById('btn-summary');
const btnClose        = document.getElementById('btn-close');
const statusEl        = document.getElementById('status');
const waveform        = document.getElementById('waveform');
const progressFill    = document.getElementById('progress-bar-fill');
const progressLabel   = document.getElementById('progress-label');
const linkOptions     = document.getElementById('link-options');
const optionsPanel    = document.getElementById('options-panel');
const geminiInput     = document.getElementById('gemini-key');
const elevenInput     = document.getElementById('elevenlabs-key');
const btnSaveKeys     = document.getElementById('btn-save-keys');
const saveMsg         = document.getElementById('save-msg');

// ── UI STATE MACHINE ──────────────────────────────────────────────────────────
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

function updateProgress(blockIndex, total) {
  const pct = total > 0 ? Math.round(((blockIndex + 1) / total) * 100) : 0;
  progressFill.style.width = pct + '%';
  progressFill.setAttribute('aria-valuenow', pct);
  progressLabel.textContent = `${blockIndex + 1} van ${total}`;
}

function resetProgress() {
  progressFill.style.width = '0%';
  progressFill.setAttribute('aria-valuenow', 0);
  progressLabel.textContent = 'Niet actief';
}

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

// ── POPUP TOGGLE ──────────────────────────────────────────────────────────────
function openPopup() {
  overlay.classList.add('open');
  analyzeAndShow();
  setTimeout(() => btnPlay.focus(), 50);
}

function closePopup() {
  overlay.classList.remove('open');
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;

  if (e.key === '0') {
    e.preventDefault();
    overlay.classList.contains('open') ? closePopup() : openPopup();
    return;
  }

  if (!e.altKey || !e.shiftKey) return;
  if (e.key === 'R') { e.preventDefault(); triggerPlay(); }
  if (e.key === 'P') { e.preventDefault(); isPaused ? resumeReading() : pauseReading(); }
  if (e.key === 'S') { e.preventDefault(); triggerStop(); }
});

overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });
btnClose.addEventListener('click', closePopup);

// ── API KEYS ──────────────────────────────────────────────────────────────────
function getKeys() {
  return {
    geminiKey:     localStorage.getItem('geminiKey')     || '',
    elevenLabsKey: localStorage.getItem('elevenLabsKey') || '50a51b094f45518d4defeb03a996638b3efff7bb3350b0aec9ffcc87f9e20456',
  };
}

linkOptions.addEventListener('click', () => {
  const open = optionsPanel.style.display === 'block';
  optionsPanel.style.display = open ? 'none' : 'block';
  linkOptions.setAttribute('aria-expanded', String(!open));
  if (!open) {
    const { geminiKey, elevenLabsKey } = getKeys();
    geminiInput.value = geminiKey;
    elevenInput.value = elevenLabsKey;
  }
});

btnSaveKeys.addEventListener('click', () => {
  localStorage.setItem('geminiKey',     geminiInput.value.trim());
  localStorage.setItem('elevenLabsKey', elevenInput.value.trim());
  saveMsg.textContent = 'Opgeslagen!';
  setTimeout(() => { saveMsg.textContent = ''; }, 2000);
});

// ── TEXT EXTRACTION ───────────────────────────────────────────────────────────
function extractPageBlocks() {
  const skip = new Set(['nav','header','footer','aside','script','style','noscript']);
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    { acceptNode(n) {
      return skip.has(n.tagName.toLowerCase())
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    }}
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

function getPageExcerpt() {
  return extractPageBlocks().slice(0, 6).map(b => b.text).join(' ').slice(0, 800);
}

// ── GENRE ANALYSIS ────────────────────────────────────────────────────────────
async function listGeminiModels() {
  const { geminiKey } = getKeys();
  if (!geminiKey) { alert('Stel eerst een Gemini API-sleutel in.'); return; }
  const [r1, r2] = await Promise.all([
    fetch(`https://generativelanguage.googleapis.com/v1/models?key=${geminiKey}`).then(r => r.json()),
    fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`).then(r => r.json()),
  ]);
  const v1names    = (r1.models || []).map(m => m.name);
  const v1betanames = (r2.models || []).map(m => m.name);
  console.log('v1 modellen:', v1names);
  console.log('v1beta modellen:', v1betanames);
  alert('v1:\n' + (v1names.join('\n') || '(geen)') + '\n\nv1beta:\n' + (v1betanames.join('\n') || '(geen)'));
}

let geminiModel = null;

async function discoverGeminiModel(geminiKey) {
  const res  = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
  const data = await res.json();
  const models = (data.models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name.replace('models/', ''));
  const preferred = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
  return preferred.find(p => models.includes(p)) || models[0] || null;
}

async function geminiFetch(geminiKey, systemPrompt, userMessage, maxTokens = 200) {
  if (!geminiModel) {
    geminiModel = await discoverGeminiModel(geminiKey);
    if (!geminiModel) throw new Error('Geen Gemini model gevonden voor deze API-sleutel');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok) {
    geminiModel = null;
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini fout: ${res.status}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function analyzeAndShow() {
  badge.textContent = 'Analyseren…';
  reden.textContent = '';

  const title   = document.title;
  const excerpt = getPageExcerpt();
  pageData = { title, excerpt };

  const { geminiKey } = getKeys();
  if (!geminiKey) {
    detectedGenre     = 'default';
    badge.textContent = GENRE_LABELS.default;
    reden.textContent = 'Geen Gemini API-sleutel ingesteld';
    return;
  }

  try {
    const raw = await geminiFetch(
      geminiKey,
      `Je bent een content-classifier voor een screenreader.
Analyseer de paginatekst en geef ALLEEN een JSON-object terug, niets anders.
Kies genre uit: horror, nieuws, tech, fictie, poëzie, default.
Format: {"genre":"tech","reden":"korte uitleg max 10 woorden"}`,
      `Titel: ${title}\nTekst:\n${excerpt}`,
      120
    );
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
    detectedGenre     = result.genre || 'default';
    badge.textContent = GENRE_LABELS[detectedGenre] || detectedGenre;
    reden.textContent = result.reden || '';
  } catch (e) {
    detectedGenre     = 'default';
    badge.textContent = GENRE_LABELS.default;
    reden.textContent = e.message || 'Analyse mislukt';
    console.error('Claude fout:', e);
  }
}

async function generateSummary() {
  const { geminiKey } = getKeys();
  const blocks   = extractPageBlocks();
  const fullText = blocks.map(b => b.text).join('\n');

  if (!geminiKey) {
    const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 2).join(' ').trim() || pageData.title;
  }

  const text = await geminiFetch(
    geminiKey,
    `Je bent een assistent die samenvattingen schrijft voor een voorlees-app.
Schrijf een vloeiende gesproken samenvatting van 2 tot 3 zinnen in het Nederlands.
Gebruik geen opsommingen, geen markdown, geen aanhalingstekens, geen kopjes.
Begin direct met de kern, niet met "Dit artikel gaat over" of "In dit artikel".`,
    `Titel: ${pageData.title}\n\n${fullText}`,
    220
  );
  return text.trim() || pageData.title;
}

function getActiveProfile() {
  const val = select.value;
  return val === 'auto' ? detectedGenre : val;
}

// ── TTS ───────────────────────────────────────────────────────────────────────
async function fetchTTSAudio(text, genre) {
  const { elevenLabsKey } = getKeys();
  if (!elevenLabsKey) throw new Error('Geen ElevenLabs API-sleutel ingesteld');

  const stijl    = stemStijlSelect.value;
  const useStyle = stijl !== 'normaal' && VOICE_STYLE_IDS[stijl];
  const voiceId  = useStyle ? VOICE_STYLE_IDS[stijl] : (VOICE_IDS[genre]   || VOICE_IDS.default);
  const settings = useStyle ? VOICE_STYLE_SETTINGS[stijl] : (VOICE_SETTINGS[genre] || VOICE_SETTINGS.default);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key':   elevenLabsKey,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability:         settings.stability,
        similarity_boost:  settings.similarity_boost,
        style:             settings.style,
        use_speaker_boost: true
      },
      speed: settings.speed
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail?.message || `ElevenLabs fout: ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary  = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

async function playBase64Audio(base64) {
  if (!audioContext) audioContext = new AudioContext();
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
  return new Promise((resolve) => {
    currentSource = audioContext.createBufferSource();
    currentSource.buffer          = audioBuffer;
    currentSource.playbackRate.value = playbackRate;
    currentSource.connect(audioContext.destination);
    currentSource.onended = resolve;
    currentSource.start();
  });
}

async function speakSentence(text, genre) {
  const gen = readingGeneration;
  try {
    statusEl.textContent = 'Audio ophalen…';
    const base64 = await fetchTTSAudio(text, genre);
    if (gen !== readingGeneration) return;
    statusEl.textContent = '';
    await playBase64Audio(base64);
  } catch (e) {
    if (gen !== readingGeneration) return;
    console.warn('Spreekfout:', e.message);
    statusEl.textContent = e.message;
  }
}

function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+/g) || [text];
}

// ── READING ENGINE ────────────────────────────────────────────────────────────
async function startReading(genre, fromBlock = 0, fromSentence = 0) {
  stopReading();
  isReading = true;
  isPaused  = false;
  setReadingState('playing');

  const blocks = extractPageBlocks();
  totalBlocks  = blocks.length;
  const pause  = PAUSES[genre] || PAUSES.default;

  for (let bi = fromBlock; bi < blocks.length; bi++) {
    if (!isReading) break;
    const block = blocks[bi];
    setActiveBlock(block.el);
    updateProgress(bi, totalBlocks);

    if (block.isHeading) {
      await speakSentence(`Sectie: ${block.text}`, genre);
      if (!isReading) { pausedBlockIndex = bi; pausedSentenceIndex = 0; return; }
      await new Promise(r => setTimeout(r, 600));
      continue;
    }

    const sentences = splitSentences(block.text);
    const startSent = (bi === fromBlock) ? fromSentence : 0;

    for (let si = startSent; si < sentences.length; si++) {
      if (!isReading) { pausedBlockIndex = bi; pausedSentenceIndex = si; return; }
      const trimmed = sentences[si].trim();
      if (!trimmed) continue;
      pausedBlockIndex    = bi;
      pausedSentenceIndex = si;
      await speakSentence(trimmed, genre);
      if (!isReading) return;
      await new Promise(r => setTimeout(r, pause));
    }
  }

  isReading = false;
  clearActiveBlock();
  resetProgress();
  setReadingState('idle');
  statusEl.textContent = 'Klaar met voorlezen.';
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
}

function stopReading() {
  readingGeneration++;
  isReading = false;
  if (currentSource) { try { currentSource.stop(); } catch (_) {} currentSource = null; }
}

function pauseReading() {
  isPaused  = true;
  isReading = false;
  if (currentSource) { try { currentSource.stop(); } catch (_) {} currentSource = null; }
  setReadingState('paused');
}

function resumeReading() {
  isPaused = false;
  setReadingState('playing');
  startReading(getActiveProfile(), pausedBlockIndex, pausedSentenceIndex);
}

// ── BUTTON HANDLERS ───────────────────────────────────────────────────────────
function triggerPlay() {
  isPaused            = false;
  pausedBlockIndex    = 0;
  pausedSentenceIndex = 0;
  statusEl.textContent = '';
  startReading(getActiveProfile());
}

function triggerStop() {
  stopReading();
  isPaused = false;
  clearActiveBlock();
  resetProgress();
  setReadingState('idle');
  statusEl.textContent = '';
}

speedSelect.addEventListener('change', () => {
  playbackRate = parseFloat(speedSelect.value);
});

btnPlay.addEventListener('click', triggerPlay);

btnPause.addEventListener('click', () => {
  if (!isPaused) pauseReading();
  else resumeReading();
});

btnStop.addEventListener('click', triggerStop);

btnSummary.addEventListener('click', async () => {
  if (!pageData) { statusEl.textContent = 'Pagina nog niet geladen.'; return; }

  btnSummary.disabled  = true;
  statusEl.textContent = 'Samenvatting genereren…';

  let summary;
  try {
    summary = await generateSummary();
  } catch (e) {
    statusEl.textContent = `Claude fout: ${e.message}`;
    btnSummary.disabled  = false;
    return;
  }

  stopReading();
  setReadingState('playing');
  isReading = true;
  await speakSentence(summary, getActiveProfile());
  isReading = false;
  setReadingState('idle');
  statusEl.textContent = '';
  btnSummary.disabled  = false;
});
