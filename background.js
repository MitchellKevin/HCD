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
  anime: '21m00Tcm4TlvDq8ikWAM',
  sport: 'VR6AewLTigWG4xSOukaG',
};
const VOICE_STYLE_SETTINGS = {
  anime: { stability: 0.38, similarity_boost: 0.75, style: 0.85, speed: 1.05 },
  sport: { stability: 0.88, similarity_boost: 0.82, style: 0.92, speed: 1.25 },
};

// ── GEMINI ────────────────────────────────────────────────────────────────────
let geminiModel = null;

async function discoverGeminiModel(geminiKey) {
  const res  = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
  const data = await res.json();
  const models = (data.models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name.replace('models/', ''));
  const preferred = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'gemini-2.0-flash'];
  return preferred.find(p => models.includes(p)) || models[0] || null;
}

async function geminiFetch(geminiKey, systemPrompt, userMessage, maxTokens = 200) {
  if (!geminiModel) {
    geminiModel = await discoverGeminiModel(geminiKey);
    if (!geminiModel) throw new Error('Geen Gemini model beschikbaar voor deze API-sleutel');
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

// ── ELEVENLABS TTS ────────────────────────────────────────────────────────────
async function fetchTTSAudio(text, genre, stemStijl, apiKey) {
  const useStyle = stemStijl && stemStijl !== 'normaal' && VOICE_STYLE_IDS[stemStijl];
  const voiceId  = useStyle ? VOICE_STYLE_IDS[stemStijl] : (VOICE_IDS[genre] || VOICE_IDS.default);
  const settings = useStyle ? VOICE_STYLE_SETTINGS[stemStijl] : (VOICE_SETTINGS[genre] || VOICE_SETTINGS.default);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key':   apiKey,
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

// ── MESSAGE HANDLERS ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'ANALYZE_PAGE') {
    chrome.storage.sync.get(['geminiKey'], async ({ geminiKey }) => {
      if (!geminiKey) {
        sendResponse({ genre: 'default', reden: 'Geen Gemini API-sleutel ingesteld' });
        return;
      }
      const cacheKey = 'cache_' + msg.url;
      const cached   = await chrome.storage.local.get(cacheKey);
      if (cached[cacheKey]) { sendResponse(cached[cacheKey]); return; }

      try {
        const raw = await geminiFetch(
          geminiKey,
          `Je bent een content-classifier voor een screenreader.
Analyseer de paginatekst en geef ALLEEN een JSON-object terug, niets anders.
Kies genre uit: horror, nieuws, tech, fictie, poëzie, default.
Format: {"genre":"tech","reden":"korte uitleg max 10 woorden"}`,
          `Titel: ${msg.title}\nMeta: ${msg.meta}\nTekst:\n${msg.excerpt}`,
          120
        );
        const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
        chrome.storage.local.set({ [cacheKey]: result });
        sendResponse(result);
      } catch (e) {
        console.error('Gemini fout:', e);
        sendResponse({ genre: 'default', reden: e.message });
      }
    });
    return true;
  }

  if (msg.type === 'SUMMARIZE_PAGE') {
    chrome.storage.sync.get(['geminiKey'], async ({ geminiKey }) => {
      if (!geminiKey) {
        const sentences = (msg.fullText || '').match(/[^.!?]+[.!?]+/g) || [];
        sendResponse({ summary: sentences.slice(0, 2).join(' ').trim() || msg.title });
        return;
      }
      try {
        const summary = await geminiFetch(
          geminiKey,
          `Je bent een assistent die samenvattingen schrijft voor een voorlees-app.
Schrijf een vloeiende gesproken samenvatting van 2 tot 3 zinnen in het Nederlands.
Gebruik geen opsommingen, geen markdown, geen aanhalingstekens, geen kopjes.
Begin direct met de kern, niet met "Dit artikel gaat over" of "In dit artikel".`,
          `Titel: ${msg.title}\n\n${msg.fullText}`,
          220
        );
        sendResponse({ summary: summary.trim() || msg.title });
      } catch (e) {
        console.error('Gemini samenvatting fout:', e);
        const sentences = (msg.fullText || '').match(/[^.!?]+[.!?]+/g) || [];
        sendResponse({ summary: sentences.slice(0, 2).join(' ').trim() || msg.title, error: e.message });
      }
    });
    return true;
  }

  if (msg.type === 'FETCH_AUDIO') {
    chrome.storage.sync.get(['elevenLabsKey'], async ({ elevenLabsKey }) => {
      if (!elevenLabsKey) {
        sendResponse({ error: 'Geen ElevenLabs API-sleutel ingesteld' });
        return;
      }
      try {
        const base64 = await fetchTTSAudio(msg.text, msg.genre, msg.stemStijl, elevenLabsKey);
        sendResponse({ base64 });
      } catch (e) {
        console.error('ElevenLabs fout:', e);
        sendResponse({ error: e.message });
      }
    });
    return true;
  }

});
