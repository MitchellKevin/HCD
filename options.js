chrome.storage.sync.get(['claudeKey', 'elevenLabsKey'], (data) => {
  if (data.claudeKey)      document.getElementById('claude-key').value      = data.claudeKey;
  if (data.elevenLabsKey)  document.getElementById('elevenlabs-key').value  = data.elevenLabsKey;
});

document.getElementById('opslaan').addEventListener('click', () => {
  const claudeKey     = document.getElementById('claude-key').value.trim();
  const elevenLabsKey = document.getElementById('elevenlabs-key').value.trim();

  chrome.storage.sync.set({ claudeKey, elevenLabsKey }, () => {
    const msg = document.getElementById('msg');
    msg.textContent = 'Opgeslagen!';
    setTimeout(() => msg.textContent = '', 2000);
  });
});