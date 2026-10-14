import './style.css';
import {
  RecordedSessionProvider,
  SyntheticTestProvider,
  type RecordedSession,
  type TangiblesProvider,
  type Unsubscribe,
} from '@itch/core';
import type { TangibleObject, TangibleScene } from '@itch/protocol';
import {
  CameraFrameSource,
  LocalVisionProvider,
  VisionPipeline,
  type VisionDiagnostics,
} from '@itch/vision';
import { starterPack } from '@itch/packs';
import { ScratchBridge, ITCH_VERSION } from '@itch/scratch';
import { SceneRecorder, downloadBlob, downloadJson, probeCapabilities } from '@itch/devtools';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application root is missing');
app.innerHTML = `
  <header><h1>ITCH <span style="font-weight:400">/ Vision Demo</span></h1><p>Interactive Tangibles for Creative Hands · Phase 0 development workbench</p></header>
  <main>
    <div class="intro">Camera frames stay on this device. Synthetic scenes prove the scene API; physical calibration and recognition are the next phases.</div>
    <div id="notice" class="notice" role="status" hidden></div>
    <div class="grid">
      <section aria-labelledby="camera-heading">
        <h2 id="camera-heading">Camera preview</h2>
        <div class="camera-view"><video id="camera" autoplay muted playsinline></video><span id="camera-label" class="camera-label">Camera idle</span></div>
        <div class="toolbar"><button id="start-camera" class="primary">Start camera</button><button id="stop-camera" disabled>Stop camera</button></div>
        <div class="toolbar"><label>Choose camera <select id="device"><option value="">Front camera (preferred)</option><option value="environment">Rear camera</option></select></label><button id="refresh-devices">Refresh devices</button></div>
        <div class="toolbar"><label><input id="mirror" type="checkbox" /> Mirror preview</label><label><input id="overlay" type="checkbox" checked /> Debug overlay</label></div>
        <p id="camera-status" class="muted" aria-live="polite">Camera: idle</p>
        <p class="muted">Preview mirroring is visual only. Physical mirror compensation is pending calibration; camera scenes remain uncalibrated.</p>
      </section>
      <section aria-labelledby="scene-heading">
        <h2 id="scene-heading">Normalized scene</h2>
        <div class="toolbar"><label>Scene source <select id="source"><option value="synthetic">Synthetic provider</option><option value="camera">Local camera pipeline</option><option value="replay" disabled>Recorded session</option></select></label></div>
        <div id="workspace" class="workspace" aria-label="Normalized workspace"></div>
        <div class="summary"><span>Word <strong id="word" class="word" data-testid="word">CAT</strong></span><span>Pieces <strong id="piece-count" data-testid="piece-count">3</strong></span></div>
        <p id="workspace-status" class="muted"></p>
        <div id="synthetic-controls">
          <div class="toolbar"><button id="cat">CAT</button><button id="dog">DOG</button><button id="clear">Clear scene</button><button id="remove-a">Remove A</button><button id="restore-a">Restore A</button></div>
          <div class="toolbar"><label>Move A horizontally <input id="move-a" type="range" min="0.05" max="0.95" step="0.01" value="0.5" /></label></div>
          <p class="muted">These controls change synthetic objects. They do not interpret the camera image.</p>
        </div>
        <p id="scratch-response">Scratch bridge: Meow!</p>
        <p class="muted">Bridge harness · ITCH <span id="version"></span> · Full Scratch VM playback is pending.</p>
      </section>
      <section class="wide" aria-labelledby="diagnostics-heading">
        <h2 id="diagnostics-heading">Capture & processing diagnostics</h2>
        <div class="metrics">
          <div class="metric"><span>Camera resolution</span><strong id="resolution">—</strong></div>
          <div class="metric"><span>Preview FPS (measured)</span><strong id="preview-fps">0.0</strong></div>
          <div class="metric"><span>Acquisition FPS</span><strong id="capture-fps">0.0</strong></div>
          <div class="metric"><span>Processing FPS</span><strong id="processing-fps">0.0</strong></div>
          <div class="metric"><span>Median / p95 latency</span><strong id="latency">0 / 0 ms</strong></div>
          <div class="metric"><span>Processed / skipped</span><strong id="frames">0 / 0</strong></div>
        </div>
        <p id="camera-info" class="muted">Camera device information will appear after permission is granted.</p>
        <p class="muted">Latency measures the current pipeline stub, which performs no recognition. Acquisition is throttled to 15 Hz with at most one frame in flight.</p>
        <div class="toolbar"><button id="capabilities">Export capability report</button><button id="camera-still" disabled>Save camera still</button></div>
      </section>
      <section aria-labelledby="objects-heading">
        <h2 id="objects-heading">Scene objects</h2>
        <div class="table-wrap"><table><thead><tr><th>Piece</th><th>Track ID</th><th>x</th><th>y</th><th>Confidence</th></tr></thead><tbody id="objects"></tbody></table></div>
        <h3>Scene JSON · protocol 0.1</h3><pre id="scene-json" data-testid="scene-json"></pre>
      </section>
      <section aria-labelledby="fixtures-heading">
        <h2 id="fixtures-heading">Fixture recording & replay</h2>
        <p class="muted">Record scene changes, then export or replay them locally. Camera stills are saved only with the separate button above.</p>
        <div class="toolbar"><button id="record">Record scene</button><button id="end-recording" disabled>Stop recording</button><button id="export-session" disabled>Export session</button></div>
        <p id="recording-status" class="muted">No recording in progress.</p>
        <label class="file">Load recorded session <input id="load-session" type="file" accept=".json,application/json" /></label>
        <div class="toolbar"><button id="replay" disabled>Replay recorded session</button><button id="step" disabled>Next scene</button><button id="rewind" disabled>Rewind</button></div>
        <p id="replay-status" class="muted">Replay is deterministic and advances one scene at a time.</p>
      </section>
    </div>
    <footer>ITCH-ROADMAP-001 v0.1 · Local B2 architecture · Phase 0 device and real Scratch integration gates remain pending.</footer>
  </main>`;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

const video = element<HTMLVideoElement>('camera');
const synthetic = new SyntheticTestProvider({ pack: starterPack });
let cameraSource: CameraFrameSource;
let local: LocalVisionProvider;
let activeProvider: TangiblesProvider = synthetic;
let sceneUnsubscribe: Unsubscribe | undefined;
let bridge: ScratchBridge;
let sourceMode = 'synthetic';
let cameraGeneration = 0;
let cameraBusy = false;
let replayProvider: RecordedSessionProvider | undefined;
let recordedSession: RecordedSession | undefined;
let recorder = new SceneRecorder({ packId: starterPack.packId, source: 'synthetic' });

function notice(message: string, error = false): void {
  const output = element('notice');
  output.textContent = message;
  output.dataset.error = String(error);
  output.hidden = false;
}

function run(action: () => void | Promise<void>): void {
  try {
    void Promise.resolve(action()).catch((error: unknown) => notice(String(error), true));
  } catch (error) {
    notice(String(error), true);
  }
}

function cameraButtons(): void {
  const sourceStatus = cameraSource.getStatus();
  // Provider cleanup stops tracks after failure; retain its error in the visible state.
  const providerStatus = local?.getStatus();
  const status =
    providerStatus?.state === 'error'
      ? { ...sourceStatus, state: 'error', message: providerStatus.message }
      : sourceStatus;
  const running = status.state === 'running';
  element<HTMLButtonElement>('start-camera').disabled = cameraBusy || running;
  element<HTMLButtonElement>('stop-camera').disabled = !cameraBusy && !running;
  element<HTMLButtonElement>('camera-still').disabled = !running;
  element('camera-status').textContent =
    `Camera: ${status.state}${status.message ? ` · ${status.message}` : ''}`;
  element('camera-label').textContent = `Camera ${status.state}`;
}

function renderDiagnostics(diagnostics: VisionDiagnostics): void {
  element('capture-fps').textContent = diagnostics.captureFps.toFixed(1);
  element('processing-fps').textContent = diagnostics.processingFps.toFixed(1);
  element('latency').textContent =
    `${diagnostics.medianLatencyMs.toFixed(1)} / ${diagnostics.p95LatencyMs.toFixed(1)} ms`;
  element('frames').textContent = `${diagnostics.processedFrames} / ${diagnostics.droppedFrames}`;
  const info = cameraSource.getCameraInfo();
  element('resolution').textContent =
    info.width && info.height ? `${info.width} × ${info.height}` : '—';
  element('camera-info').textContent = info.label
    ? `${info.label} · ${info.facingMode ?? 'selected camera'} · ${info.frameRate ?? '?'} FPS requested/reported by device`
    : 'No active camera.';
  if (diagnostics.lastError) notice(`Pipeline: ${diagnostics.lastError}`, true);
  cameraButtons();
}

function makeCamera(): void {
  const choice = element<HTMLSelectElement>('device').value;
  cameraSource = new CameraFrameSource(video, {
    ...(choice && choice !== 'environment' ? { deviceId: choice } : {}),
    facingMode: choice === 'environment' ? 'environment' : 'user',
    onStatusChanged: () => {
      if (cameraSource) cameraButtons();
    },
  });
  local = new LocalVisionProvider(cameraSource, new VisionPipeline(), {
    onDiagnostics: renderDiagnostics,
  });
}

function displaySymbol(object: TangibleObject): string {
  return (
    starterPack.pieces.find((piece) => piece.pieceId === object.pieceId)?.display ?? object.pieceId
  );
}

function renderScene(scene: TangibleScene): void {
  const word = bridge.currentWord();
  element('word').textContent = word || '—';
  element('piece-count').textContent = String(scene.objects.length);
  element('workspace-status').textContent =
    `${sourceMode === 'synthetic' ? 'Synthetic workspace' : 'Workspace'}: ${scene.workspaceStatus} · revision ${scene.revision}`;
  element('scene-json').textContent = JSON.stringify(scene, null, 2);
  element('scratch-response').textContent =
    `Scratch bridge: ${word === 'CAT' ? 'Meow!' : word === 'DOG' ? 'Woof!' : word ? `Current word ${word}` : 'Waiting for pieces.'}`;
  const workspace = element('workspace');
  workspace.replaceChildren();
  const label = document.createElement('span');
  label.className = 'workspace-label';
  label.textContent =
    sourceMode === 'synthetic'
      ? 'SYNTHETIC · 210 × 148 mm · origin top left'
      : sourceMode === 'replay'
        ? 'RECORDED SCENE · normalized coordinates'
        : 'UNCALIBRATED · physical detection pending';
  workspace.append(label);
  for (const object of scene.objects) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.style.left = `${object.x * 100}%`;
    tile.style.top = `${object.y * 100}%`;
    const symbol = document.createElement('b');
    symbol.textContent = displaySymbol(object);
    const confidence = document.createElement('small');
    confidence.textContent = `${Math.round(object.confidence * 100)}%`;
    confidence.hidden = !element<HTMLInputElement>('overlay').checked;
    tile.append(symbol, confidence);
    workspace.append(tile);
  }
  if (!scene.objects.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent =
      sourceMode === 'camera'
        ? 'Camera connected to scene API. Calibration and recognition pending.'
        : 'No scene objects.';
    workspace.append(empty);
  }
  const body = element('objects');
  body.replaceChildren();
  for (const object of scene.objects) {
    const row = document.createElement('tr');
    for (const text of [
      displaySymbol(object),
      object.trackId,
      object.x.toFixed(3),
      object.y.toFixed(3),
      `${Math.round(object.confidence * 100)}%`,
    ]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    body.append(row);
  }
  if (replayProvider && sourceMode === 'replay')
    element('replay-status').textContent =
      `Scene ${replayProvider.position + 1} of ${replayProvider.length}`;
}

function recordScene(scene: TangibleScene): void {
  if (!recorder.isRecording) return;
  recorder.record(scene);
  element('recording-status').textContent =
    `Recording · ${recorder.length} scene snapshots · camera imagery excluded`;
}

function connect(provider: TangiblesProvider, mode: string): void {
  sceneUnsubscribe?.();
  bridge?.dispose();
  if (recorder.isRecording) stopRecording();
  activeProvider = provider;
  sourceMode = mode;
  bridge = new ScratchBridge(provider);
  sceneUnsubscribe = provider.subscribe((scene) => {
    renderScene(scene);
    recordScene(scene);
  });
  element<HTMLSelectElement>('source').value = mode;
  element('synthetic-controls').hidden = mode !== 'synthetic';
  element<HTMLButtonElement>('record').disabled = mode === 'replay';
  element<HTMLButtonElement>('step').disabled = mode !== 'replay';
  element<HTMLButtonElement>('rewind').disabled = mode !== 'replay';
  renderScene(provider.getScene());
}

function preset(word: string): void {
  synthetic.setObjects(
    [...word].map((symbol, index) => ({
      trackId: `synthetic-${symbol}`,
      pieceId: `letter:${symbol}`,
      packId: starterPack.packId,
      x: 0.375 + index * 0.125,
      y: 0.5,
      rotationDeg: 0,
      confidence: 1,
    })),
  );
  element<HTMLInputElement>('move-a').value = '0.5';
}

async function refreshDevices(): Promise<void> {
  const source = cameraSource;
  const devices = await source.enumerateCameras();
  if (source !== cameraSource) return;
  const select = element<HTMLSelectElement>('device');
  const selected = select.value;
  while (select.options.length > 2) select.remove(2);
  devices.forEach((device, index) =>
    select.add(new Option(device.label || `Camera ${index + 1}`, device.deviceId)),
  );
  select.value = [...select.options].some((option) => option.value === selected) ? selected : '';
}

async function startCamera(): Promise<void> {
  const generation = ++cameraGeneration;
  cameraBusy = true;
  cameraButtons();
  try {
    await local.start();
    if (generation !== cameraGeneration) return;
    await refreshDevices();
    if (generation !== cameraGeneration) return;
    notice('Camera started. The local pipeline has no physical recognizer yet.');
  } finally {
    if (generation === cameraGeneration) cameraBusy = false;
    cameraButtons();
  }
}

async function stopCamera(): Promise<void> {
  ++cameraGeneration;
  cameraBusy = false;
  await local.stop();
  element('preview-fps').textContent = '0.0';
  cameraButtons();
}

function stopRecording(): void {
  recordedSession = recorder.stop();
  element<HTMLButtonElement>('record').disabled = false;
  element<HTMLButtonElement>('end-recording').disabled = true;
  element<HTMLButtonElement>('export-session').disabled = !recordedSession.scenes.length;
  element<HTMLButtonElement>('replay').disabled = !recordedSession.scenes.length;
  element('recording-status').textContent =
    `Recording stopped · ${recordedSession.scenes.length} scene snapshots.`;
}

async function replaySession(): Promise<void> {
  if (recorder.isRecording) stopRecording();
  if (!recordedSession?.scenes.length) throw new Error('Load or record a nonempty session first.');
  await replayProvider?.stop();
  replayProvider = new RecordedSessionProvider(recordedSession);
  await replayProvider.start();
  element<HTMLSelectElement>('source').options[2]!.disabled = false;
  connect(replayProvider, 'replay');
}

element('start-camera').onclick = () => run(startCamera);
element('stop-camera').onclick = () => run(stopCamera);
element('refresh-devices').onclick = () => run(refreshDevices);
element<HTMLSelectElement>('device').onchange = () =>
  run(async () => {
    await stopCamera();
    makeCamera();
    if (sourceMode === 'camera') connect(local, 'camera');
    notice('Camera selection changed. Press Start camera to request this device.');
  });
element<HTMLInputElement>('mirror').onchange = (event) =>
  video.classList.toggle('mirrored', (event.target as HTMLInputElement).checked);
element<HTMLInputElement>('overlay').onchange = () => renderScene(activeProvider.getScene());
element<HTMLSelectElement>('source').onchange = () =>
  run(async () => {
    const source = element<HTMLSelectElement>('source').value;
    if (source === 'replay') await replaySession();
    else connect(source === 'camera' ? local : synthetic, source);
  });
element('cat').onclick = () => preset('CAT');
element('dog').onclick = () => preset('DOG');
element('clear').onclick = () => synthetic.setObjects([]);
element('remove-a').onclick = () =>
  synthetic.setObjects(
    synthetic.getScene().objects.filter((object) => object.pieceId !== 'letter:A'),
  );
element('restore-a').onclick = () => {
  const objects = synthetic.getScene().objects;
  if (!objects.some((object) => object.pieceId === 'letter:A'))
    synthetic.setObjects([
      ...objects,
      {
        trackId: 'synthetic-A',
        pieceId: 'letter:A',
        packId: starterPack.packId,
        x: Number(element<HTMLInputElement>('move-a').value),
        y: 0.5,
        rotationDeg: 0,
        confidence: 1,
      },
    ]);
};
element<HTMLInputElement>('move-a').oninput = () =>
  synthetic.setObjects(
    synthetic
      .getScene()
      .objects.map((object) =>
        object.pieceId === 'letter:A'
          ? { ...object, x: Number(element<HTMLInputElement>('move-a').value) }
          : object,
      ),
  );
element('capabilities').onclick = () =>
  run(() =>
    downloadJson('itch-capabilities.json', {
      ...probeCapabilities({ ...cameraSource.getCameraInfo() }),
      diagnostics: local.getDiagnostics(),
    }),
  );
element('camera-still').onclick = () =>
  run(async () => {
    const frame = await cameraSource.readFrame();
    if (!frame?.image) throw new Error('No camera frame is available.');
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas capture is unavailable.');
    if (frame.image instanceof ImageData) context.putImageData(frame.image, 0, 0);
    else context.drawImage(frame.image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the camera still.');
    downloadBlob('itch-camera-still.png', blob);
    downloadJson('itch-camera-still-metadata.json', {
      ...probeCapabilities({ ...cameraSource.getCameraInfo() }),
      frame: {
        id: frame.id,
        timestampMs: frame.timestampMs,
        width: frame.width,
        height: frame.height,
      },
      scene: activeProvider.getScene(),
      previewMirrored: video.classList.contains('mirrored'),
      pixelMirrorCompensated: false,
    });
    notice('Camera still and metadata saved explicitly to your browser downloads.');
  });
element('record').onclick = () => {
  recorder = new SceneRecorder({ packId: starterPack.packId, source: sourceMode });
  recorder.start();
  element<HTMLButtonElement>('record').disabled = true;
  element<HTMLButtonElement>('end-recording').disabled = false;
  recordScene(activeProvider.getScene());
  renderScene(activeProvider.getScene());
};
element('end-recording').onclick = stopRecording;
element('export-session').onclick = () => {
  if (recordedSession) downloadJson('itch-session.json', recordedSession);
};
element<HTMLButtonElement>('replay').onclick = () => run(replaySession);
element('step').onclick = () => {
  replayProvider?.step();
  if (replayProvider) renderScene(replayProvider.getScene());
};
element('rewind').onclick = () => {
  replayProvider?.seek(0);
  if (replayProvider) renderScene(replayProvider.getScene());
};
element<HTMLInputElement>('load-session').onchange = () =>
  run(async () => {
    const file = element<HTMLInputElement>('load-session').files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) throw new Error('Scene session is too large (limit 5 MB).');
    const parsed = JSON.parse(await file.text()) as RecordedSession;
    const validated = new RecordedSessionProvider(parsed);
    if (!validated.length) throw new Error('Session contains no scenes.');
    if (recorder.isRecording) stopRecording();
    recordedSession = parsed;
    element<HTMLButtonElement>('replay').disabled = false;
    element<HTMLButtonElement>('export-session').disabled = false;
    notice(`Loaded ${validated.length} recorded scenes locally.`);
  });

let previewTimes: number[] = [];
let lastVideoTime = -1;
function countPreviewFrame(now: number): void {
  if (cameraSource.getStatus().state === 'running' && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    previewTimes.push(now);
    previewTimes = previewTimes.filter((time) => now - time < 1000);
    element('preview-fps').textContent = String(previewTimes.length);
  } else if (cameraSource.getStatus().state !== 'running') {
    previewTimes = [];
  }
  requestAnimationFrame(countPreviewFrame);
}

makeCamera();
await synthetic.start();
bridge = new ScratchBridge(synthetic);
connect(synthetic, 'synthetic');
preset('CAT');
element('version').textContent = ITCH_VERSION;
requestAnimationFrame(countPreviewFrame);
window.addEventListener('pagehide', (event) => {
  void stopCamera();
  // Back/forward cache retains this document; synthetic controls must still work on return.
  if (!event.persisted) {
    sceneUnsubscribe?.();
    bridge.dispose();
    void synthetic.stop();
    void replayProvider?.stop();
  }
});
