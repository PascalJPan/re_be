export function show(id) {
  document.getElementById(id).style.display = '';
}

export function hide(id) {
  document.getElementById(id).style.display = 'none';
}

export function showLoading(msg) {
  const el = document.getElementById('loading');
  el.textContent = msg || 'Processing...';
  el.style.display = '';
}

export function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

export function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.style.display = '';
  setTimeout(() => { el.style.display = 'none'; }, 6000);
}

export function renderMetadata(obj, container) {
  container.innerHTML = '';
  const dl = document.createElement('dl');
  dl.className = 'metadata';

  const fields = [
    ['Type', obj.audio_type],
    ['Mood', `${obj.mood.primary} / ${obj.mood.secondary}`],
    ['Energy', (obj.energy * 100).toFixed(0) + '%'],
    ['Tempo', obj.tempo],
    ['Density', obj.density],
    ['Texture', obj.texture.join(', ')],
    ['Sounds', obj.sound_references.join(', ')],
    ['Duration', obj.duration_seconds + 's'],
    ['Relation', obj.relation_to_parent],
  ];

  for (const [label, value] of fields) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  container.appendChild(dl);
}
