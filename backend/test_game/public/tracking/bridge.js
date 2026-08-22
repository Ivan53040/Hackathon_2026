(() => {
  const CHANNEL = 'runespire-tracking';
  let tracker = null;
  let unsubscribe = null;
  let drawing = false;
  let stroke = [];
  let lastTip = null;

  const send = (type, payload = {}) => {
    window.parent.postMessage({ source: CHANNEL, type, ...payload }, location.origin);
  };
  const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function attachTracker() {
    const next = window.__wandTracker;
    if (!next || next === tracker) return;
    if (unsubscribe) unsubscribe();
    tracker = next;
    unsubscribe = tracker.subscribe((frame) => {
      const normalized = {
        timestamp: frame.timestamp ?? frame.t ?? performance.now(),
        tip: frame.tip ?? null,
        confidence: frame.confidence ?? frame.tipConfidence ?? (frame.tip ? 1 : 0),
      };
      lastTip = normalized.tip;
      if (drawing && lastTip && (!stroke.length || gap(stroke.at(-1), lastTip) >= 0.0035)) {
        stroke.push({ ...lastTip });
      }
      send('frame', { frame: normalized });
    });
    send('ready');
  }

  function begin(event) {
    if ((event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') || event.repeat || drawing) return;
    drawing = true;
    stroke = lastTip ? [{ ...lastTip }] : [];
  }

  function finish(event) {
    if (event && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
    if (!drawing) return;
    drawing = false;
    const points = stroke;
    stroke = [];
    const recognizer = window.__shapeRecognizer;
    const result = recognizer && points.length >= 3 ? recognizer(points, 1) : null;
    if (result && (result.shape === 'z' || result.shape === 'arc')) {
      send('gesture', { shape: result.shape, confidence: result.confidence });
    }
  }

  // Install before the compiled test UI so its capture listener cannot hide the event from us.
  window.addEventListener('keydown', begin, true);
  window.addEventListener('keyup', finish, true);
  window.addEventListener('blur', () => finish(), true);
  const poll = () => { attachTracker(); requestAnimationFrame(poll); };
  poll();
  window.addEventListener('pagehide', () => unsubscribe?.(), { once: true });
})();
