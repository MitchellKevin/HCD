# VoiceReader — Procesverslag

## Concept

Een Chrome extension die een screenreader meer diepte geeft door de stem dynamisch aan te passen aan de sfeer en context van een webpagina. In plaats van één neutrale voorleesstem krijgt de gebruiker een stem die past bij de inhoud — een spannende toon bij horror, een zakelijke toon bij nieuws, of een expressieve toon bij fictie. De genre-detectie verloopt automatisch via AI, maar de gebruiker kan altijd zelf kiezen.

---

## Week 1

### Dag 1

**Wat heb ik gedaan?**  
Concept bedacht en de basisstructuur van de Chrome extension gebouwd: manifest, popup, content script en background worker. ElevenLabs geïntegreerd voor realistische stemmen. De gebruiker kan handmatig een genre kiezen (horror, nieuws, tech, fictie, poëzie, neutraal) en de extension leest de pagina voor in de bijpassende stem en stijl.

**Problemen & oplossingen**

| Probleem | Oplossing |
|---|---|
| Extension laadde content script niet op bestaande tabbladen | `chrome.scripting.executeScript` aanroepen bij elke klik op Play, zodat het altijd aanwezig is |
| ElevenLabs `speed` parameter werkte niet in `voice_settings` | `speed` staat los van `voice_settings` in de request body — apart meegegeven |

**Content script injecteren bij elke play**

```js
// popup.js
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, files: ['content.js'] }
  );
});
```

**ElevenLabs — `speed` buiten `voice_settings`**

```js
// background.js
body: JSON.stringify({
  text,
  model_id: 'eleven_multilingual_v2',
  voice_settings: {
    stability:        settings.stability,
    similarity_boost: settings.similarity_boost,
    style:            settings.style,
    use_speaker_boost: true
  },
  speed: settings.speed  // ← los van voice_settings, anders wordt het genegeerd
})
```
---

### Dag 2

**Wat heb ik gedaan?**  
Eerste user test afgenomen met Ihab (gebruiker met visuele beperking) — hij heeft het concept bekeken en feedback gegeven. Op basis van zijn feedback de Claude API toegevoegd voor automatische genre-detectie, pauze/hervat functionaliteit en snelheidsregeling.

**Problemen & oplossingen**

| Probleem | Oplossing |
|---|---|
| Claude API blokkeerde directe browser-aanroepen (CORS) | Header `anthropic-dangerous-direct-browser-access: true` meegeven |
| Genre-detectie was traag en blokkeerde de UI | Detectie asynchroon uitvoeren en resultaat cachen op URL |
| Pauze sloeg de positie niet op | `pausedBlockIndex` en `pausedSentenceIndex` bijhouden en doorgeven aan `startReading()` |

**CORS-header voor directe Anthropic API aanroep**

```js
// background.js
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': claudeKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'  // ← verplicht in browser
  },
  body: JSON.stringify({ ... })
});
```

**Positie opslaan voor pauze/hervat**

```js
// content.js
let pausedBlockIndex    = 0;
let pausedSentenceIndex = 0;

function pauseReading() {
  isPaused  = true;
  isReading = false;
  if (currentSource) { currentSource.stop(); currentSource = null; }
}

// Bij hervat: verder waar gestopt
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'RESUME') {
    startReading(currentGenre, pausedBlockIndex, pausedSentenceIndex);
  }
});
```

**Caching van genre-analyse per URL**

```js
// background.js
const cacheKey = 'cache_' + msg.url;
const cached   = await chrome.storage.local.get(cacheKey);
if (cached[cacheKey]) { sendResponse(cached[cacheKey]); return; }

const result = await analyzeContext(summary, claudeKey);
chrome.storage.local.set({ [cacheKey]: result });
sendResponse(result);
```

**Weeklijkse feedback**

Idee was weinig op aan te merken en klonk als een interessante oplossing voor het probleem met de standaard stemmen van de screen reader, jammer dat de ai functie nog niet werkte.

---

## Week 2

### Dag 1

**Wat heb ik gedaan?**  
De Chrome extension getest met Ihab, maar dan op mijn eigen computer omdat het niet lukte de extension extern te versturen. Ihab kon zo direct met de extension interacteren terwijl ik ernaast zat.

**Problemen & oplossingen**

| Probleem | Oplossing |
|---|---|
| Extension kon niet gedeeld worden voor remote testing | Test uitgevoerd op mijn eigen laptop met Ihab fysiek aanwezig |
| Pauzes tussen zinnen waren te lang | Pauze-waarden per genre verlaagd in de configuratie |
| Sneltoetsen werkten niet altijd | Event listeners opnieuw geregistreerd bij elke content script injectie |

---

### Dag 2

**Wat heb ik gedaan?**  
Feedback van de test verwerkt. Samenvattingsfunctie toegevoegd en snelheidsregeling uitgebreid. Claude API nog niet werkend helaas.

**Problemen & oplossingen**

| Probleem | Oplossing |
|---|---|
| Samenvatting pakte gewoon de eerste alinea | Eerste twee zinnen extraheren als tijdelijke oplossing, later vervangen door echte AI |
| Audio speelde door als je snel meerdere keren op Play klikte | `stopReading()` aanroepen aan het begin van elke nieuwe sessie |

**Lokale samenvatting (tijdelijke oplossing)**

```js
// Eerste 2 zinnen uit de paginatekst als fallback
const sentences = excerpt.match(/[^.!?]+[.!?]+/g) || [];
const summary   = sentences.slice(0, 2).join(' ').trim() || title;
```

**Weeklijkse feedback**

De docent vond de het prima, weinig nog op aan te merken en de samenvatting was wel een beetje saai zonder AI en de test moest beter gezien, doordat Ihab op mijn laptop werkte niet correct kan testen, docent suggereerde om een webpagina te maken zodat Ihab dit zelf kon testen.

---

## Week 3

### Dag 1

**Wat heb ik gedaan?**  
Deze week was ik op de Smashing Conference en daardoor niet aanwezig bij de user test. Geen codeerwerk deze week.

---

### Dag 2

**Wat heb ik gedaan?**  
Teruggekomen van de conferentie en de testnotities doorgenomen. Voorbereidingen getroffen voor week 4: besloten om een standalone HTML-prototype te bouwen zodat Ihab zelfstandig kan testen zonder dat ik erbij hoef te zijn.

**Weeklijkste feedback**
Ging niet door wegens 'de web u want'

---

## Week 4

### Dag 1

**Wat heb ik gedaan?**  
HTML-prototype gebouwd als losse pagina (buiten de extension) zodat Ihab het gewoon op zijn eigen laptop kon openen en testen. Volledige UI herontworpen als professioneel toegankelijkheidsproduct: design tokens, progress bar, waveform-animatie, ARIA-labels, WCAG 2.1 AA focus-stijlen en zinmarkering op de pagina terwijl er wordt voorgelezen. Stemstijlen toegevoegd (Anime, Sport verslaggever). Anthropic API-credits uitgeput — overgestapt op Google Gemini als gratis alternatief.

**Problemen & oplossingen**

| Probleem | Oplossing |
|---|---|
| Geen visuele feedback welke zin er wordt voorgelezen | `.hvsr-active` CSS-klasse op het actieve blok zetten en de pagina automatisch scrollen |
| Knoppen hadden geen duidelijke uitgeschakelde staat | `disabled` attribuut beheren via `setReadingState('playing' \| 'paused' \| 'idle')` |
| Geen voortgangsindicatie | Progress bar toegevoegd die bijhoudt hoeveel paragrafen al zijn voorgelezen |
| Audio van oude sessie speelde door als je snel op Play klikte | `readingGeneration` teller toegevoegd |
| Anthropic API: credit balance te laag | Overgestapt op Google Gemini API (gratis tier, geen creditcard nodig) |
| Gemini model-naam niet gevonden (`gemini-1.5-flash` op `v1`, `v1beta`) | `discoverGeminiModel()` gebouwd die automatisch de beschikbare modellen ophaalt en het beste kiest |
| `system_instruction` veld gaf JSON-fout | Veld heet `systemInstruction` (camelCase) in de Gemini REST API |

**Actief blok markeren en scrollen**

```js
// content.js
function setActiveBlock(el) {
  document.querySelectorAll('.hvsr-active')
    .forEach(e => e.classList.remove('hvsr-active'));
  if (el) {
    el.classList.add('hvsr-active');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
```

```css
/* Geïnjecteerde stijl via content.js */
.hvsr-active {
  background: rgba(79, 70, 229, 0.07) !important;
  border-radius: 6px !important;
  outline: 2px solid rgba(79, 70, 229, 0.25) !important;
  outline-offset: 5px !important;
  transition: background 0.25s ease !important;
}
```

**Button states via centrale functie**

```js
// popup.js
function setReadingState(state) {
  if (state === 'playing') {
    btnPlay.disabled  = true;
    btnPause.disabled = false;
    btnStop.disabled  = false;
    waveform.classList.add('active');
  } else if (state === 'paused') {
    btnPlay.disabled  = true;
    waveform.classList.remove('active');
    btnPause.innerHTML = '<span>▶</span> Verder';
  } else {
    btnPlay.disabled  = false;
    btnPause.disabled = true;
    btnStop.disabled  = true;
    waveform.classList.remove('active');
  }
}
```

**Fix: overlappende audio via generatie-teller**

```js
// content.js
let readingGeneration = 0;

function stopReading() {
  readingGeneration++;  // ← alle lopende fetches worden hiermee ongeldig
  isReading = false;
  if (currentSource) { currentSource.stop(); currentSource = null; }
}

async function speakSentence(text, genre) {
  const gen = readingGeneration;  // vastleggen vóór de fetch
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'FETCH_AUDIO', text, genre }, async (response) => {
      if (gen !== readingGeneration) { resolve(); return; }  // ← verouderde sessie, negeren
      await playBase64Audio(response.base64);
      resolve();
    });
  });
}
```

**Gemini model automatisch ontdekken**

```js
// background.js
let geminiModel = null;

async function discoverGeminiModel(geminiKey) {
  const res  = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`
  );
  const data = await res.json();
  const models = (data.models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name.replace('models/', ''));

  const preferred = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
  return preferred.find(p => models.includes(p)) || models[0] || null;
}
```

**`systemInstruction` in camelCase — niet snake_case**

```js
// werkte niet
body: JSON.stringify({
  system_instruction: { parts: [{ text: systemPrompt }] },
})

// correct
body: JSON.stringify({
  systemInstruction: { parts: [{ text: systemPrompt }] },
  contents: [{ parts: [{ text: userMessage }] }],
  generationConfig: { maxOutputTokens: maxTokens },
})
```

**AI-samenvatting via Gemini**

```js
// background.js
const summary = await geminiFetch(
  geminiKey,
  `Je bent een assistent die samenvattingen schrijft voor een voorlees-app.
Schrijf een vloeiende gesproken samenvatting van 2 tot 3 zinnen in het Nederlands.
Gebruik geen opsommingen, geen markdown, geen aanhalingstekens.
Begin direct met de kern.`,
  `Titel: ${msg.title}\n\n${msg.fullText}`,
  220
);
```

**Schermafbeeldingen**

![Oude versie](image.png)
![Nieuwe versie](image-2.png)

---

### Dag 2

**Wat heb ik gedaan?**  
Alles van het HTML-prototype teruggebracht naar de Chrome extension: nieuwe popup-UI, content script met highlighting en voortgang, background worker met Gemini en volledige stemstijl-ondersteuning. Options-pagina bijgewerkt naar Gemini sleutel.

**Problemen & oplossingen**

| Probleem | Oplossing |
|---|---|
| Popup-stijlen pasten niet bij de extension-breedte | Popup vaste breedte van 316px, geen overlay nodig (popup is zelf de UI) |
| Content script ontving geen voortgangsberichten | `chrome.runtime.sendMessage({ type: 'READING_PROGRESS' })` vanuit content script naar popup |
| Stemstijl (anime/sport) werd niet doorgegeven vanuit popup | `stemStijl` meegeven in het `START` bericht en opslaan als `currentStemStijl` in content script |

**Voortgang vanuit content script naar popup sturen**

```js
// content.js — in de leeslus
chrome.runtime.sendMessage({
  type: 'READING_PROGRESS',
  blockIndex:  bi,
  totalBlocks
});

// popup.js — ontvangen en progress bar updaten
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'READING_PROGRESS') {
    const pct = Math.round(((msg.blockIndex + 1) / msg.totalBlocks) * 100);
    progressFill.style.width = pct + '%';
    progressLabel.textContent = `${msg.blockIndex + 1} van ${msg.totalBlocks}`;
  }
});
```

**Stemstijl meegeven via berichten**

```js
// popup.js
chrome.tabs.sendMessage(tab.id, {
  type:      'START',
  profile:   getActiveProfile(),
  stemStijl: stemStijlSelect.value,  // 'normaal' | 'anime' | 'sport'
  rate:      playbackRate
});

// content.js
let currentStemStijl = 'normaal';

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START') {
    currentStemStijl = msg.stemStijl || 'normaal';
    startReading(msg.profile);
  }
});

// background.js — juiste stem kiezen op basis van stijl
const useStyle = stemStijl !== 'normaal' && VOICE_STYLE_IDS[stemStijl];
const voiceId  = useStyle ? VOICE_STYLE_IDS[stemStijl] : VOICE_IDS[genre];
const settings = useStyle ? VOICE_STYLE_SETTINGS[stemStijl] : VOICE_SETTINGS[genre];
```

**Weeklijkse feedback**
Fijn dat de prototype echt goed getest kan worden op de laptop zelf van Ihab, verder had ik moeite met nonsense toevoegen, ik had als idee om mogelijk de stemmen kon vormen naar intresses van Ihab; sport, reizen en anime. Dit vond de docent een goed idee gezien de stemmen nu niet zoveel zeggen.

Eindversie:
![alt text](image-2.png)
---

## User Tests

### User Test 1 — Ihab (visuele beperking)

**Datum:** Week 1, Dag 2

**Vragen & antwoorden**

| Vraag | Antwoord |
|---|---|
| Op welke websites loop je het vaakst vast? | Bash |
| Wanneer raak je de draad kwijt tijdens het luisteren? | Slecht gelabelde elementen zijn de grootste frustratie |
| Wat is het meest frustrerende dat recent is gebeurd? | Een studentenvereniging stapte over op een ontoegankelijke app, terwijl ze juist toegankelijkheid prediken |
| Mis je soms toon of context in hoe iets wordt voorgelezen? | Ja |
| Op welke snelheid luister je meestal? | Rond de 2.5× |
| Zou je expressie het waard vinden als dat iets trager is? | Kan wel sneller |
| Wat maakt een site "goed gestructureerd" voor jou? | Juist gelabeld |
| Wat doen websites verkeerd? | Het minimale doen |

**Belangrijkste inzichten**
- Knoppen **moeten** gelabeld zijn — dit is de grootste pijnpunt
- Sneltoetsen zijn essentieel, visuele interfaces zijn onbruikbaar
- Korte samenvatting van een pagina is erg gewenst
- Sfeerdetectie moet snel zijn (minder dan 30 seconden)
- De gebruiker moet zelf kunnen bepalen hoe gedetailleerd de sfeer is
- Dubbel voorgelezen content (bv. via extension én native reader) is verwarrend
- Taal van de stem moet overeenkomen met de taal van de pagina

**Designbeslissingen op basis van deze test**
- Sneltoetsen toegevoegd: `Alt+Shift+R` (lezen), `Alt+Shift+P` (pauze), `Alt+Shift+S` (stop)
- AI-samenvatting toegevoegd als aparte knop
- Automatische genre-detectie zodat de gebruiker niet zelf hoeft te kiezen
- Handmatige override behouden voor controle

---

### User Test 2

**Datum:** Week 2, Dag 1

**Bevindingen**
- Chrome extension moet volledig met toetsenbord te bedienen zijn
- Snelheid moet dynamisch instelbaar zijn
- Suggestie: afbeeldingen scannen en omschrijven (sociale media use case)
- Omschrijving van afbeeldingen: lengte hangt af van de foto
- AI-samenvatting van tekst is gewenst
- `'Het werkt goed!'`

**Actiepunten na deze test**
- HTML-prototype maken om dieper te kunnen testen vóór extension
- Pitch bij versnelling afvlakken
- Extension zelf toegankelijk maken (ARIA)

---

### User Test 3 — Project Manager (Philips Health)

**Datum:** Week 3

**Testpersoon**  
Project Manager bij een gezondheidsdivisie van Philips, met dagelijkse betrokkenheid bij producten voor mensen met (visuele) beperkingen. Geen screenreader-gebruiker zelf, maar werkt structureel samen met eindgebruikers die dat wel zijn.

**Bevindingen**

| Observatie | Toelichting |
|---|---|
| API-kosten kunnen een drempel zijn | Claude heeft een betaald model — voor een gratis prototype beter een gratis alternatief zoeken |
| Visuele uitstraling schiet tekort | De interface ziet er te technisch/kaal uit; mensen zonder beperking haken af voordat ze het proberen |
| Toegankelijkheid en esthetiek sluiten elkaar niet uit | Goede toegankelijkheidstools zien er ook goed uit — anders past het niet bij de kwaliteitsstandaard van professionele producten |
| Doelgroepbereik verbreden | Als de tool alleen aantrekkelijk is voor gebruikers met een beperking, wordt de adoptie beperkt; een aantrekkelijke UI nodigt ook anderen uit |

**Belangrijkste inzichten**
- Gemini als gratis alternatief voor Claude — vergelijkbare kwaliteit, geen creditcard of betaaltegoed nodig
- De UI moet er professioneel uitzien zodat ook gebruikers zonder beperking de tool serieus nemen
- Kwaliteit van de interface weerspiegelt de kwaliteit van het product — een slechte UI ondermijnt het vertrouwen, ook bij de primaire doelgroep
- Inclusief ontwerpen betekent ook: niet afschrikken door een interface die er "gehandicapt" uitziet

**Designbeslissingen op basis van deze test**
- Overgestapt van Anthropic Claude naar Google Gemini (gratis tier, 1.500 verzoeken/dag)
- Volledige UI herontworpen: design tokens, waveform-animatie, progress bar, consistente typografie, professioneel genoeg voor elke gebruiker
- Kleurenpalet en spacing afgestemd op de kwaliteitsstandaard van bestaande enterprise-toegankelijkheidstools

---

### User Test 4

**Datum:** Week 4

**Bevindingen**
- Pauzes tussen zinnen zijn te lang
- Genre- en snelheidsmenu's werden gevonden en begrepen
- Samenvatting is fijn, maar pakt nu de inleiding — kan beter met echte AI
- Bug: als je meerdere keren afspeelt, speelt audio door elkaar
- Sneltoetsen werkten niet
- Samenvatting kon niet gestopt worden
- Vraag: kan ik zelf een stem inspreken?
- Idee: achtergrondmuziek per genre

**Designbeslissingen op basis van deze test**
- `readingGeneration` teller geïmplementeerd (fix overlappende audio)
- AI-samenvatting via Gemini (geen lokale extractie meer)
- Sneltoetsen gefixed in content script
- Stop-knop werkt nu ook tijdens samenvatting
