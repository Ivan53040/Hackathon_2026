const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
const scoreNear = (value, target, tolerance) => clamp(1 - Math.abs(value - target) / tolerance);

function pathLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index++) total += distance(points[index - 1], points[index]);
  return total;
}

function deduplicate(points) {
  const result = [];
  for (const point of points) if (!result.length || distance(result.at(-1), point) >= 0.0015) result.push(point);
  return result;
}

function resample(points, count) {
  const total = pathLength(points);
  if (points.length < 2 || total <= 0) return points;
  const interval = total / (count - 1);
  const result = [{ ...points[0] }];
  let travelled = 0;
  let previous = { ...points[0] };
  let index = 1;
  while (index < points.length && result.length < count - 1) {
    const current = points[index];
    const segment = distance(previous, current);
    if (segment <= 0.000001) { previous = current; index++; continue; }
    if (travelled + segment >= interval) {
      const amount = (interval - travelled) / segment;
      previous = { x: previous.x + (current.x - previous.x) * amount, y: previous.y + (current.y - previous.y) * amount };
      result.push(previous);
      travelled = 0;
    } else {
      travelled += segment;
      previous = current;
      index++;
    }
  }
  while (result.length < count) result.push({ ...points.at(-1) });
  return result;
}

function pointLineDistance(point, start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared <= 0.000001) return distance(point, start);
  const amount = clamp(((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared);
  return distance(point, { x: start.x + deltaX * amount, y: start.y + deltaY * amount });
}

function simplify(points, epsilon) {
  if (points.length <= 2) return points;
  let maximum = 0;
  let split = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const error = pointLineDistance(points[index], points[0], points.at(-1));
    if (error > maximum) { maximum = error; split = index; }
  }
  if (maximum <= epsilon) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, split + 1), epsilon).slice(0, -1), ...simplify(points.slice(split), epsilon)];
}

function turnAt(points, index, step = 4) {
  const count = points.length;
  const previous = points[(index - step + count) % count];
  const current = points[index];
  const next = points[(index + step) % count];
  const first = { x: previous.x - current.x, y: previous.y - current.y };
  const second = { x: next.x - current.x, y: next.y - current.y };
  const denominator = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
  if (denominator <= 0.000001) return 0;
  const interior = Math.acos(clamp((first.x * second.x + first.y * second.y) / denominator, -1, 1));
  return Math.PI - interior;
}

function shapeVertices(points, diagonal) {
  let strongest = 0;
  let strongestTurn = -1;
  for (let index = 0; index < points.length; index++) {
    const turn = turnAt(points, index);
    if (turn > strongestTurn) { strongestTurn = turn; strongest = index; }
  }
  const rotated = [...points.slice(strongest), ...points.slice(0, strongest), points[strongest]];
  const vertices = simplify(rotated, diagonal * 0.045).slice(0, -1);
  return vertices.filter((point, index) => index === 0 || distance(point, vertices[index - 1]) > diagonal * 0.03);
}

function polygonArea(points) {
  let doubled = 0;
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    doubled += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(doubled) * 0.5;
}

function polygonPerimeter(points) {
  let total = 0;
  for (let index = 0; index < points.length; index++) total += distance(points[index], points[(index + 1) % points.length]);
  return total;
}

function normalizeGesture(points) {
  const sampled = resample(points, 64);
  const minimumX = Math.min(...sampled.map((point) => point.x));
  const maximumX = Math.max(...sampled.map((point) => point.x));
  const minimumY = Math.min(...sampled.map((point) => point.y));
  const maximumY = Math.max(...sampled.map((point) => point.y));
  const centreX = (minimumX + maximumX) / 2;
  const centreY = (minimumY + maximumY) / 2;
  const scale = Math.max(maximumX - minimumX, maximumY - minimumY, 0.0001);
  return sampled.map((point) => ({ x: (point.x - centreX) / scale, y: (point.y - centreY) / scale }));
}

function rotateGesture(points, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return points.map((point) => ({ x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine }));
}

function gestureDistance(first, second) {
  let total = 0;
  for (let index = 0; index < Math.min(first.length, second.length); index++) total += distance(first[index], second[index]);
  return total / Math.min(first.length, second.length);
}

const GESTURE_TEMPLATES = {
  arc: [{ x: 0.04, y: 0.84 }, { x: 0.14, y: 0.57 }, { x: 0.3, y: 0.32 }, { x: 0.5, y: 0.2 }, { x: 0.7, y: 0.32 }, { x: 0.86, y: 0.57 }, { x: 0.96, y: 0.84 }],
  doubleArc: [{ x: 0.03, y: 0.8 }, { x: 0.13, y: 0.48 }, { x: 0.27, y: 0.25 }, { x: 0.4, y: 0.39 }, { x: 0.5, y: 0.72 }, { x: 0.6, y: 0.39 }, { x: 0.73, y: 0.25 }, { x: 0.87, y: 0.48 }, { x: 0.97, y: 0.8 }],
};

const NORMALIZED_GESTURES = Object.fromEntries(Object.entries(GESTURE_TEMPLATES).map(([name, points]) => [name, normalizeGesture(points)]));

function gestureTemplateScores(points) {
  const normalized = normalizeGesture(points);
  const reversed = [...normalized].reverse();
  const scores = {};
  for (const [name, template] of Object.entries(NORMALIZED_GESTURES)) {
    let bestDistance = Infinity;
    for (const angle of [-0.22, -0.11, 0, 0.11, 0.22]) {
      const variant = rotateGesture(template, angle);
      bestDistance = Math.min(bestDistance, gestureDistance(normalized, variant), gestureDistance(reversed, variant));
    }
    scores[name] = clamp(1 - bestDistance / 0.34);
  }
  return scores;
}

function recognizeShape(input, xScale = 1) {
  const points = deduplicate(input.map((point) => ({ x: point.x * xScale, y: point.y })));
  if (points.length < 3) return null;
  const length = pathLength(points);
  const minimumX = Math.min(...points.map((point) => point.x));
  const maximumX = Math.max(...points.map((point) => point.x));
  const minimumY = Math.min(...points.map((point) => point.y));
  const maximumY = Math.max(...points.map((point) => point.y));
  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  const diagonal = Math.hypot(width, height);
  if (diagonal < 0.075 || length < 0.09) return null;

  const sampled = resample(points, 96);
  const closedGap = distance(sampled[0], sampled.at(-1)) / diagonal;
  const closeScore = clamp(1 - closedGap / 0.42);
  const starCloseScore = clamp(1 - closedGap / 0.58);
  const triangleCloseScore = clamp(1 - closedGap / 0.65);
  const aspect = Math.min(width, height) / Math.max(width, height, 0.0001);
  const centre = sampled.reduce((total, point) => ({ x: total.x + point.x / sampled.length, y: total.y + point.y / sampled.length }), { x: 0, y: 0 });
  const radii = sampled.map((point) => distance(point, centre));
  const meanRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  const radialDeviation = Math.sqrt(radii.reduce((sum, radius) => sum + (radius - meanRadius) ** 2, 0) / radii.length) / Math.max(meanRadius, 0.0001);

  const chord = distance(sampled[0], sampled.at(-1));
  const straightness = chord / Math.max(length, 0.0001);
  const meanLineError = sampled.reduce((sum, point) => sum + pointLineDistance(point, sampled[0], sampled.at(-1)), 0) / sampled.length / diagonal;
  const chordDeltaX = sampled.at(-1).x - sampled[0].x;
  const chordDeltaY = sampled.at(-1).y - sampled[0].y;
  const horizontalAlignment = Math.abs(chordDeltaX) / Math.max(Math.hypot(chordDeltaX, chordDeltaY), 0.0001);
  const horizontalGate = clamp((horizontalAlignment - 0.65) / 0.35);
  const lineScore = closedGap > 0.55 ? (straightness * 0.58 + clamp(1 - meanLineError / 0.075) * 0.42) * horizontalGate : 0;

  const vertices = closedGap < 0.72 ? shapeVertices(sampled, diagonal) : [];
  const cornerCount = vertices.length;
  const areaRatio = vertices.length >= 3 ? polygonArea(vertices) / Math.max(width * height, 0.0001) : 0;
  const edgeFit = vertices.length >= 3 ? clamp(polygonPerimeter(vertices) / Math.max(length, 0.0001)) : 0;
  const triangleCornerScore = cornerCount === 3 ? 1 : cornerCount === 2 ? 0.64 : cornerCount === 4 ? 0.7 : cornerCount === 5 ? 0.28 : 0;
  const triangleScore = triangleCloseScore * 0.2 + triangleCornerScore * 0.4 + scoreNear(areaRatio, 0.5, 0.4) * 0.14 + edgeFit * 0.16 + aspect * 0.1;

  const ellipsePerimeter = Math.PI * Math.sqrt(2 * ((width / 2) ** 2 + (height / 2) ** 2));
  const perimeterScore = scoreNear(length / Math.max(ellipsePerimeter, 0.0001), 1, 0.48);
  const smoothCornerScore = clamp((cornerCount - 4) / 4);
  const circleScore = closeScore * 0.24 + aspect * 0.19 + clamp(1 - radialDeviation / 0.3) * 0.3 + perimeterScore * 0.15 + smoothCornerScore * 0.12;

  let radialRatio = 1;
  let transitionScore = 0;
  if (vertices.length >= 6) {
    const vertexCentre = vertices.reduce((total, point) => ({ x: total.x + point.x / vertices.length, y: total.y + point.y / vertices.length }), { x: 0, y: 0 });
    const vertexRadii = vertices.map((point) => distance(point, vertexCentre));
    const sortedRadii = [...vertexRadii].sort((first, second) => first - second);
    const half = Math.max(1, Math.floor(sortedRadii.length / 2));
    const inner = sortedRadii.slice(0, half).reduce((sum, value) => sum + value, 0) / half;
    const outerValues = sortedRadii.slice(-half);
    const outer = outerValues.reduce((sum, value) => sum + value, 0) / outerValues.length;
    radialRatio = outer / Math.max(inner, 0.0001);
    const median = sortedRadii[Math.floor(sortedRadii.length / 2)];
    let transitions = 0;
    for (let index = 0; index < vertexRadii.length; index++) {
      if ((vertexRadii[index] >= median) !== (vertexRadii[(index + 1) % vertexRadii.length] >= median)) transitions++;
    }
    transitionScore = transitions / vertexRadii.length;
  }
  const starCornerScore = clamp(1 - Math.abs(cornerCount - 10) / 5);
  const starGeometryReady = closedGap < 0.62 && cornerCount >= 7 && cornerCount <= 13 && radialRatio >= 1.18 && transitionScore >= 0.5;
  const starScore = starGeometryReady ? starCloseScore * 0.16 + starCornerScore * 0.34 + clamp((radialRatio - 1.12) / 0.58) * 0.28 + transitionScore * 0.18 + clamp((length / diagonal - 2.3) / 1.3) * 0.04 : 0;

  const z0 = sampled[0];
  const z1 = sampled[31];
  const z2 = sampled[63];
  const z3 = sampled[95];
  const first = { x: z1.x - z0.x, y: z1.y - z0.y };
  const middle = { x: z2.x - z1.x, y: z2.y - z1.y };
  const last = { x: z3.x - z2.x, y: z3.y - z2.y };
  const horizontalScore = (Math.abs(first.x) / Math.max(Math.hypot(first.x, first.y), 0.0001) + Math.abs(last.x) / Math.max(Math.hypot(last.x, last.y), 0.0001)) / 2;
  const diagonalScore = Math.min(Math.abs(middle.x), Math.abs(middle.y)) / Math.max(Math.abs(middle.x), Math.abs(middle.y), 0.0001);
  const directionScore = first.x * last.x > 0 && first.x * middle.x < 0 ? 1 : 0;
  const openScore = clamp((closedGap - 0.45) / 0.45);
  const zScore = openScore * 0.2 + horizontalScore * 0.28 + diagonalScore * 0.16 + directionScore * 0.25 + aspect * 0.06 + scoreNear(length / diagonal, 2.4, 0.8) * 0.05;

  const templateScores = gestureTemplateScores(points);
  const scores = { z: zScore, line: lineScore, doubleArc: templateScores.doubleArc, arc: templateScores.arc, star: starScore };
  const ranked = Object.entries(scores).sort((firstScore, secondScore) => secondScore[1] - firstScore[1]);
  const [shape, confidence] = ranked[0];
  const margin = confidence - ranked[1][1];
  const isTemplateGesture = Object.hasOwn(NORMALIZED_GESTURES, shape);
  const minimumConfidence = shape === 'line' ? 0.72 : shape === 'star' ? 0.58 : shape === 'z' ? 0.62 : isTemplateGesture ? 0.7 : 0.64;
  const minimumMargin = shape === 'star' ? 0.035 : isTemplateGesture ? 0.045 : 0.035;
  if (confidence < minimumConfidence || margin < minimumMargin) return null;
  return { shape, confidence: clamp(confidence), corners: cornerCount, scores };
}

const SHAPE_CATALOG = [
  ['z', 'Z', 'Z'],
  ['arc', '⌒', 'Arc'],
];
const icons = Object.fromEntries(SHAPE_CATALOG.map(([name, icon]) => [name, icon]));
const labels = Object.fromEntries(SHAPE_CATALOG.map(([name, , label]) => [name, label.toUpperCase()]));
const completed = new Set();
let drawing = false;
let stroke = [];
let latestTip;
let previousFrameText = '';
let drawLayer;
let drawContext;
let finishedStroke = [];
let finishedStrokeUntil = 0;

function shapeTestActive() {
  const overlay = document.querySelector('#shape-test');
  return Boolean(overlay && !overlay.classList.contains('hidden'));
}

function cameraScale() {
  const match = document.querySelector('#hud-camera')?.textContent?.match(/(\d+)\s*[x×]\s*(\d+)/i);
  return match ? Number(match[1]) / Math.max(Number(match[2]), 1) : 4 / 3;
}

function setDrawState(text, state) {
  const element = document.querySelector('#shape-draw-state');
  if (!element) return;
  element.textContent = text;
  element.dataset.state = state;
}

function drawMirroredVideo(context, video, rect) {
  context.save();
  context.translate(rect.x + rect.width, rect.y);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, rect.width, rect.height);
  context.restore();
}

function stageCameraRect(width, height, video) {
  const videoWidth = video?.videoWidth || 4;
  const videoHeight = video?.videoHeight || 3;
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const contentWidth = videoWidth * scale;
  const contentHeight = videoHeight * scale;
  return { x: (width - contentWidth) / 2, y: (height - contentHeight) / 2, width: contentWidth, height: contentHeight };
}

function renderShiftGatedStage() {
  if (!drawLayer || !drawContext) return;
  if (!shapeTestActive()) { drawLayer.hidden = true; return; }
  drawLayer.hidden = false;
  const width = drawLayer.clientWidth;
  const height = drawLayer.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (drawLayer.width !== pixelWidth || drawLayer.height !== pixelHeight) {
    drawLayer.width = pixelWidth;
    drawLayer.height = pixelHeight;
  }
  drawContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawContext.clearRect(0, 0, width, height);
  const video = window.__wandTracker?.getVideoElement?.();
  const rect = stageCameraRect(width, height, video);
  if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) drawMirroredVideo(drawContext, video, rect);
  else {
    drawContext.fillStyle = '#101411';
    drawContext.fillRect(0, 0, width, height);
  }

  const visibleStroke = drawing ? stroke : performance.now() < finishedStrokeUntil ? finishedStroke : [];
  if (visibleStroke.length > 1) {
    drawContext.beginPath();
    visibleStroke.forEach((point, index) => {
      const x = rect.x + point.x * rect.width;
      const y = rect.y + point.y * rect.height;
      if (index) drawContext.lineTo(x, y); else drawContext.moveTo(x, y);
    });
    drawContext.strokeStyle = '#8bffba';
    drawContext.lineWidth = 3;
    drawContext.lineJoin = 'round';
    drawContext.lineCap = 'round';
    drawContext.stroke();
  }

  if (latestTip) {
    const x = rect.x + latestTip.x * rect.width;
    const y = rect.y + latestTip.y * rect.height;
    drawContext.beginPath();
    drawContext.arc(x, y, 9, 0, Math.PI * 2);
    drawContext.fillStyle = '#fff';
    drawContext.fill();
    drawContext.strokeStyle = '#8bffba';
    drawContext.lineWidth = 3;
    drawContext.stroke();
  }
}

function showResult(result) {
  const panel = document.querySelector('#shape-result');
  if (!panel) return;
  panel.classList.remove('recognized', 'uncertain', 'complete');
  if (!result) {
    panel.classList.add('uncertain');
    document.querySelector('#shape-result-icon').textContent = '?';
    document.querySelector('#shape-result-name').textContent = 'NOT SURE';
    document.querySelector('#shape-result-detail').textContent = 'Draw it larger and complete it in one continuous stroke.';
    document.querySelector('#shape-confidence-bar').style.width = '0%';
    setDrawState('NOT RECOGNIZED · HOLD SHIFT TO TRY AGAIN', 'result');
    return;
  }
  panel.classList.add('recognized');
  document.querySelector('#shape-result-icon').textContent = icons[result.shape];
  document.querySelector('#shape-result-name').textContent = `${labels[result.shape]} DETECTED`;
  document.querySelector('#shape-result-detail').textContent = `${Math.round(result.confidence * 100)}% confidence · ${result.corners} corners`;
  document.querySelector('#shape-confidence-bar').style.width = `${Math.round(result.confidence * 100)}%`;
  completed.add(result.shape);
  const item = document.querySelector(`.shape-catalog [data-shape="${result.shape}"]`);
  if (item) {
    item.classList.add('passed');
    item.querySelector('i').textContent = 'PASS ✓';
  }
  document.querySelector('#shape-progress').textContent = `${completed.size} / ${SHAPE_CATALOG.length} passed`;
  if (completed.size === SHAPE_CATALOG.length) {
    panel.classList.add('complete');
    document.querySelector('#shape-result-detail').textContent = 'All gesture tests passed ✓';
  }
  setDrawState(`${labels[result.shape]} SAVED · HOLD SHIFT TO DRAW AGAIN`, 'result');
}

function readLatestTip() {
  const text = document.querySelector('#last-frame')?.textContent ?? '';
  if (!text || text === previousFrameText || text === '—') return;
  previousFrameText = text;
  try {
    const frame = JSON.parse(text);
    latestTip = frame.tip ?? undefined;
    if (!drawing || !latestTip) return;
    const previous = stroke.at(-1);
    if (!previous || distance(previous, latestTip) >= 0.0035) stroke.push({ ...latestTip });
  } catch { /* HUD can be between frame writes; try again next frame. */ }
}

function startDrawing(event) {
  if (event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
  if (!shapeTestActive() || drawing || event.repeat) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  drawing = true;
  stroke = latestTip ? [{ ...latestTip }] : [];
  finishedStroke = [];
  finishedStrokeUntil = 0;
  const panel = document.querySelector('#shape-result');
  panel?.classList.remove('recognized', 'uncertain', 'complete');
  document.querySelector('#shape-result-icon').textContent = '✦';
  document.querySelector('#shape-result-name').textContent = 'RECORDING';
  document.querySelector('#shape-result-detail').textContent = 'Keep holding Shift while you draw.';
  document.querySelector('#shape-confidence-bar').style.width = '0%';
  setDrawState('SHIFT HELD · DRAWING… · RELEASE TO DETECT', 'drawing');
}

function finishDrawing(event) {
  if (event && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
  if (!drawing) return;
  event?.preventDefault();
  event?.stopImmediatePropagation();
  drawing = false;
  finishedStroke = stroke.map((point) => ({ ...point }));
  finishedStrokeUntil = performance.now() + 900;
  showResult(recognizeShape(stroke, cameraScale()));
  stroke = [];
}

function install() {
  const list = document.querySelector('.shape-catalog ul');
  if (list) list.innerHTML = SHAPE_CATALOG.map(([name, icon, label]) => `<li data-shape="${name}"><b>${icon}</b><span>${label}</span><i>WAIT</i></li>`).join('');
  const resetProgress = () => {
    completed.clear();
    stroke = [];
    finishedStroke = [];
    finishedStrokeUntil = 0;
    const progress = document.querySelector('#shape-progress');
    if (progress) progress.textContent = `0 / ${SHAPE_CATALOG.length} passed`;
  };
  resetProgress();
  document.querySelector('#recalibrate')?.addEventListener('click', resetProgress);
  document.querySelector('#start-tracking')?.addEventListener('click', resetProgress);
  const overlay = document.querySelector('#shape-test');
  if (overlay) new MutationObserver(() => { if (!overlay.classList.contains('hidden')) resetProgress(); }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  addEventListener('keydown', startDrawing, true);
  addEventListener('keyup', finishDrawing, true);
  addEventListener('blur', () => finishDrawing());
  const stage = document.querySelector('.stage-wrap');
  if (stage) {
    drawLayer = document.createElement('canvas');
    drawLayer.id = 'shift-draw-layer';
    drawLayer.hidden = true;
    drawLayer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none';
    stage.appendChild(drawLayer);
    drawContext = drawLayer.getContext('2d');
  }
  const loop = () => { readLatestTip(); renderShiftGatedStage(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

function runSelfTest() {
  const edge = (vertices, count = 14) => {
    const output = [];
    for (let index = 0; index < vertices.length - 1; index++) {
      const first = vertices[index];
      const second = vertices[index + 1];
      for (let step = 0; step < count; step++) {
        const amount = step / count;
        output.push({ x: first.x + (second.x - first.x) * amount, y: first.y + (second.y - first.y) * amount });
      }
    }
    output.push(vertices.at(-1));
    return output;
  };
  const transform = (points, angle) => points.map((point, index) => {
    const x = point.x - 0.5;
    const y = point.y - 0.5;
    return {
      x: 0.5 + x * Math.cos(angle) - y * Math.sin(angle) + Math.sin(index * 9.7) * 0.004,
      y: 0.5 + x * Math.sin(angle) + y * Math.cos(angle) + Math.cos(index * 7.3) * 0.004,
    };
  });
  const starVertices = Array.from({ length: 11 }, (_, index) => {
    const turn = index % 10;
    const radius = turn % 2 === 0 ? 0.3 : 0.14;
    const angle = -Math.PI / 2 + turn * Math.PI / 5;
    return { x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle) };
  });
  const openStar = edge(starVertices.slice(0, 10), 10);
  const zShape = edge([{ x: 0.22, y: 0.22 }, { x: 0.78, y: 0.22 }, { x: 0.22, y: 0.78 }, { x: 0.78, y: 0.78 }], 18);
  const horizontalLine = edge([{ x: 0.18, y: 0.5 }, { x: 0.82, y: 0.5 }], 40);
  const verticalLine = edge([{ x: 0.5, y: 0.18 }, { x: 0.5, y: 0.82 }], 40);
  const results = {
    star: [0, 0.2, -0.3].map((angle) => recognizeShape(transform(openStar, angle), 1)?.shape ?? null),
    z: [0, 0.12, -0.1].map((angle) => recognizeShape(transform(zShape, angle), 1)?.shape ?? null),
    line: [0, 0.08, -0.08].map((angle) => recognizeShape(transform(horizontalLine, angle), 1)?.shape ?? null),
    verticalLine: recognizeShape(verticalLine, 1)?.shape ?? null,
    imageGestures: Object.fromEntries(Object.entries(GESTURE_TEMPLATES).map(([name, points]) => [name, [-0.1, 0, 0.1].map((angle) => recognizeShape(transform(points, angle), 1)?.shape ?? null)])),
  };
  document.documentElement.dataset.shapeSelfTest = JSON.stringify(results);
}

window.__shapeRecognizer = recognizeShape;
document.documentElement.dataset.shapePatch = 'five-shapes-v4';
runSelfTest();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
