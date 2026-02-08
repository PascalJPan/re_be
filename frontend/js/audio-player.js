export function createPlayer(audioUrl, container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'audio-player';

  const audio = document.createElement('audio');
  audio.src = audioUrl;
  audio.controls = true;
  audio.preload = 'auto';

  wrapper.appendChild(audio);
  container.appendChild(wrapper);

  return audio;
}

export function clearPlayers(container) {
  container.innerHTML = '';
}
