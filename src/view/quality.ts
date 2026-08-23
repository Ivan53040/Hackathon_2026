export type GraphicsQuality = 'high' | 'low';

const STORAGE_KEY = 'runespire.graphicsQuality';
let selected: GraphicsQuality = readStoredQuality();

function readStoredQuality(): GraphicsQuality {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'low' ? 'low' : 'high';
  } catch {
    return 'high';
  }
}

export function getGraphicsQuality(): GraphicsQuality {
  return selected;
}

export function setGraphicsQuality(quality: GraphicsQuality): void {
  selected = quality;
  document.documentElement.dataset.graphicsQuality = quality;
  try {
    localStorage.setItem(STORAGE_KEY, quality);
  } catch {
    // Storage can be unavailable in private/embed contexts; the session value still works.
  }
}

document.documentElement.dataset.graphicsQuality = selected;
