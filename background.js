// Voice IDs van ElevenLabs — kies er één of maak het instelbaar
// Meer stemmen: https://api.elevenlabs.io/v1/voices
const VOICE_IDS = {
  default: 'EXAVITQu4vr4xnSDxMaL', // Sarah — helder, neutraal
  horror:  'TX3LPaxmHKxFdv7VOQHJ', // Liam — laag, donker
  nieuws:  'EXAVITQu4vr4xnSDxMaL', // Sarah — zakelijk
  tech:    'CwhRBWXzGAHq8TQ4Fs17', // Roger — helder, precies
  fictie:  'onwK4e9ZLuTAKqWW03F9', // Daniel — warm, verhalend
  poëzie:  'XB0fDUnXU5powFXDhCwa', // Charlotte — zacht, expressief
};

// ElevenLabs stem-instellingen per profiel
const VOICE_SETTINGS = {
  horror:  { stability: 0.85, similarity_boost: 0.75, style: 0.6,  speed: 0.78 },
  nieuws:  { stability: 0.90, similarity_boost: 0.80, style: 0.1,  speed: 1.10 },
  tech:    { stability: 0.88, similarity_boost: 0.78, style: 0.15, speed: 0.97 },
  fictie:  { stability: 0.70, similarity_boost: 0.75, style: 0.45, speed: 0.88 },
  poëzie:  { stability: 0.65, similarity_boost: 0.70, style: 0.55, speed: 0.72 },
  default: { stability: 0.80, similarity_boost: 0.75, style: 0.2,  speed: 1.00 },
};

// Vraag audio op bij ElevenLabs, geef base64 terug
async function fetchTTSAudio(text, genre, apiKey) {
  const voiceId   = VOICE_IDS[genre]   || VOICE_IDS.default;
  const settings  = VOICE_SETTINGS[genre] || VOICE_SETTINGS.default;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2', // ondersteunt Nederlands
        voice_settings: {
          stability:        settings.stability,
          similarity_boost: settings.similarity_boost,
          style:            settings.style,
          use_speaker_boost: true
        },
        // speed zit in de request body, niet in voice_settings
        speed: settings.speed
      })
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail?.message || `ElevenLabs fout: ${response.status}`);
  }

  // Converteer MP3-bytes naar base64 zodat we het door kunnen sturen
  const buffer = await response.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  let binary   = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

// ── Page summary (Claude) ───────────────────────────────────────────────────

function summarizePage(title, excerpt) {
  const sentences = excerpt.match(/[^.!?]+[.!?]+/g) || [];
  const first = sentences.slice(0, 2).join(' ').trim();
  return first
    ? `${title}. ${first}`
    : title || 'Geen samenvatting beschikbaar.';
}

// ── Context-analyse (Claude) ────────────────────────────────────────────────

async function analyzeContext(summary, claudeKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: `Je bent een content-classifier voor een screenreader.
Analyseer de paginatekst en geef ALLEEN een JSON-object terug, niets anders.
Kies genre uit: horror, nieuws, tech, fictie, poëzie, default.
Format: {"genre":"horror","reden":"korte uitleg"}`,
      messages: [{ role: 'user', content: summary }]
    })
  });
  const data  = await response.json();
  const text  = data.content?.[0]?.text || '{"genre":"default","reden":""}';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ── Message handlers ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Pagina-analyse via Claude
  if (msg.type === 'ANALYZE_PAGE') {
    chrome.storage.sync.get(['claudeKey'], async ({ claudeKey }) => {
      if (!claudeKey) {
        sendResponse({ genre: 'default', reden: 'Geen Claude API-sleutel ingesteld' });
        return;
      }
      const cacheKey = 'cache_' + msg.url;
      const cached   = await chrome.storage.local.get(cacheKey);
      if (cached[cacheKey]) { sendResponse(cached[cacheKey]); return; }

      try {
        const summary = `Titel: ${msg.title}\nMeta: ${msg.meta}\nTekst:\n${msg.excerpt}`;
        const result  = await analyzeContext(summary, claudeKey);
        chrome.storage.local.set({ [cacheKey]: result });
        sendResponse(result);
      } catch (e) {
        console.error('Claude fout:', e);
        sendResponse({ genre: 'default', reden: 'API-fout' });
      }
    });
    return true;
  }

  // Paginasamenvatting (lokaal)
  if (msg.type === 'SUMMARIZE_PAGE') {
    const summary = summarizePage(msg.title, msg.excerpt);
    sendResponse({ summary });
    return true;
  }

  // Audio ophalen bij ElevenLabs
  if (msg.type === 'FETCH_AUDIO') {
    chrome.storage.sync.get(['elevenLabsKey'], async ({ elevenLabsKey }) => {
      if (!elevenLabsKey) {
        sendResponse({ error: 'Geen ElevenLabs API-sleutel ingesteld' });
        return;
      }
      try {
        const base64 = await fetchTTSAudio(msg.text, msg.genre, elevenLabsKey);
        sendResponse({ base64 });
      } catch (e) {
        console.error('ElevenLabs fout:', e);
        sendResponse({ error: e.message });
      }
    });
    return true;
  }

});