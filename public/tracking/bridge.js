(() => {
  const CHANNEL = 'runespire-tracking';
  let tracker = null;
  let unsubscribe = null;
  let drawing = false;
  let stroke = [];
  let lastTip = null;
  let parentArmed = false;
  let lastPhase = '';

  window.__wandTestGate = { armed: false };

  const send = (type, payload = {}) => {
    window.parent.postMessage({ source: CHANNEL, type, ...payload }, location.origin);
  };
  const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function shapeTestActive() {
    const overlay = document.querySelector('#shape-test');
    return Boolean(overlay && !overlay.classList.contains('hidden'));
  }

  function publishPhase() {
    const phase = !parentArmed ? 'align' : shapeTestActive() ? 'runes' : 'positioning';
    if (phase === lastPhase) return;
    lastPhase = phase;
    send('phase', { phase });
  }

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
    if (!parentArmed || !shapeTestActive() || (event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') || event.repeat || drawing) return;
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

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.source !== CHANNEL) return;
    if (event.data.type === 'arm') {
      parentArmed = true;
      window.__wandTestGate.armed = true;
      drawing = false;
      stroke = [];
      publishPhase();
    } else if (event.data.type === 'reset') {
      parentArmed = false;
      window.__wandTestGate.armed = false;
      drawing = false;
      stroke = [];
      publishPhase();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat) return;
    event.preventDefault();
    send('space');
  }, true);

  // Install before the compiled test UI so its capture listener cannot hide the event from us.
  window.addEventListener('keydown', begin, true);
  window.addEventListener('keyup', finish, true);
  window.addEventListener('blur', () => finish(), true);
  const poll = () => { attachTracker(); publishPhase(); requestAnimationFrame(poll); };
  poll();
  window.addEventListener('pagehide', () => unsubscribe?.(), { once: true });
})();
