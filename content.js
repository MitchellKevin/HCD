let isReading   = false;
let currentGenre = 'default';
let audioContext = null;
let currentSource = null;

// Pauze in ms per profiel (na elke zin)
const PAUSES = {
  horror:  900,
  nieuws:  250,
  tech:    320,
  fictie:  500,
  poëzie:  1100,
  default: 380
};

// Haal leesbare tekst op, skip navigatie
function extractPageText() {
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
      if (text && text.length > 20) blocks.push(text);
    }
  }
  return blocks;
}

// Splits in zinnen
function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+/g) || [text];
}

// Zet base64 MP3 om naar AudioBuffer en speel af
async function playBase64Audio(base64) {
  if (!audioContext) audioContext = new AudioContext();

  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);

  return new Promise((resolve) => {
    currentSource = audioContext.createBufferSource();
    currentSource.buffer = audioBuffer;
    currentSource.connect(audioContext.destination);
    currentSource.onended = resolve;
    currentSource.start();
  });
}

// Vraag audio op via background en speel af
async function speakSentence(text, genre) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_AUDIO', text, genre },
      async (response) => {
        if (response?.error || !response?.base64) {
          console.warn('Audio mislukt, overslaan:', response?.error);
          resolve();
          return;
        }
        try {
          await playBase64Audio(response.base64);
        } catch (e) {
          console.warn('Afspelen mislukt:', e);
        }
        resolve();
      }
    );
  });
}

// Spreek een heel blok voor, zin voor zin met pauzes
async function speakBlock(text, genre) {
  const sentences = splitSentences(text);
  const pause     = PAUSES[genre] || PAUSES.default;

  for (const sentence of sentences) {
    if (!isReading) return;
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    await speakSentence(trimmed, genre);
    if (!isReading) return;

    // Pauze na de zin
    await new Promise(r => setTimeout(r, pause));
  }
}

// Start het voorlezen
async function startReading(genre) {
  stopReading();
  isReading    = true;
  currentGenre = genre;

  const blocks = extractPageText();
  for (const block of blocks) {
    if (!isReading) break;
    await speakBlock(block, genre);
  }

  isReading = false;
  chrome.runtime.sendMessage({ type: 'READING_DONE' });
}

function stopReading() {
  isReading = false;
  if (currentSource) {
    try { currentSource.stop(); } catch (_) {}
    currentSource = null;
  }
}

// Luister naar berichten van de popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START') startReading(msg.profile);
  if (msg.type === 'STOP')  stopReading();
  // Pauze/resume werkt anders met AudioContext — stop gewoon voor nu
  if (msg.type === 'PAUSE')  stopReading();
  if (msg.type === 'RESUME') startReading(currentGenre);
});

window.addEventListener('beforeunload', stopReading);