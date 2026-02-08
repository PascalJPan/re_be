const MAX_DIMENSION = 1024;

let currentFile = null;

export function init(fileInputId, canvasId) {
  const fileInput = document.getElementById(fileInputId);
  const canvas = document.getElementById(canvasId);

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loadImage(file, canvas);
  });
}

function loadImage(file, canvas) {
  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = () => {
    URL.revokeObjectURL(url);

    // Resize if needed
    let w = img.width;
    let h = img.height;
    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    canvas.style.display = 'block';

    // Convert to blob for upload
    canvas.toBlob((blob) => {
      currentFile = new File([blob], file.name, { type: 'image/jpeg' });
    }, 'image/jpeg', 0.85);
  };

  img.src = url;
}

export function loadFromFile(file) {
  const canvas = document.getElementById('image-canvas');
  loadImage(file, canvas);
}

export function getFile() {
  return currentFile;
}

export function getCanvas() {
  return document.getElementById('image-canvas');
}

export function clear() {
  currentFile = null;
  const canvas = document.getElementById('image-canvas');
  canvas.style.display = 'none';
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('image-input').value = '';
}
