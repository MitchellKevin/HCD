chrome.storage.sync.get(['geminiKey', 'elevenLabsKey'], (data) => {
  if (data.geminiKey)     document.getElementById('gemini-key').value      = data.geminiKey;
  if (data.elevenLabsKey) document.getElementById('elevenlabs-key').value  = data.elevenLabsKey;
});

document.getElementById('opslaan').addEventListener('click', () => {
  const geminiKey     = document.getElementById('gemini-key').value.trim();
  const elevenLabsKey = document.getElementById('elevenlabs-key').value.trim();

  chrome.storage.sync.set({ geminiKey, elevenLabsKey }, () => {
    const msg = document.getElementById('msg');
    msg.textContent = 'Opgeslagen!';
    setTimeout(() => { msg.textContent = ''; }, 2000);
  });
});
