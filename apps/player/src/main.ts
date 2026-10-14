import { SyntheticTestProvider, type TangibleObject } from '@itch/core';
import { starterPack } from '@itch/packs';
import { registerScratchExtension, type ItchScratchExtension } from '@itch/scratch';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing application root');
app.innerHTML = `
  <header><p class="eyebrow">ITCH · Phase 0</p><h1>Scratch contract harness</h1>
    <p>A synthetic scene drives the ITCH reporters and a mock Scratch event handler.</p></header>
  <p class="notice">The Scratch VM and .sb3 playback are planned. This page verifies the adapter contract locally.</p>
  <section aria-label="Synthetic scene controls">
    <h2>Place a synthetic word</h2>
    <div class="buttons"><button id="cat" data-testid="cat">CAT</button>
      <button id="dog" data-testid="dog">DOG</button><button id="clear">Clear</button></div>
  </section>
  <section aria-label="Scratch reporters"><h2>ITCH reporters</h2>
    <dl><div><dt>Version</dt><dd id="version"></dd></div><div><dt>Ready</dt><dd id="ready"></dd></div>
      <div><dt>Current word</dt><dd id="word" data-testid="word">—</dd></div>
      <div><dt>Pieces</dt><dd id="count">0</dd></div></dl>
    <p id="response" role="status">Choose a word to execute the mock handler.</p>
  </section>
  <section><h2>Event log</h2><pre id="events">No events yet.</pre></section>
  <details><summary>Scene JSON</summary><pre id="scene"></pre></details>
  <footer><a id="vision-link">Open Vision Demo</a> · Local processing; no camera access on this page.</footer>
`;

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}

const provider = new SyntheticTestProvider({ pack: starterPack });
const eventLog: string[] = [];
const extensionRef: { current?: ItchScratchExtension } = {};
const connection = registerScratchExtension(
  {
    runtime: {
      startHats(opcode) {
        eventLog.push(opcode);
        if (eventLog.length > 20) eventLog.shift();
        element('events').textContent = eventLog.join('\n');
        if (opcode === 'itch_whenWordChanges') {
          const word = extensionRef.current?.currentWord() ?? '';
          element('response').textContent =
            word === 'CAT' ? 'Meow!' : word === 'DOG' ? 'Woof!' : 'No word.';
        }
      },
    },
    extensionManager: {
      _registerInternalExtension(extension) {
        return `mock_extension_${extension.getInfo().id}`;
      },
    },
  },
  provider,
);
extensionRef.current = connection.extension;

function render(): void {
  element('version').textContent = connection.extension.itchVersion();
  element('ready').textContent = String(connection.extension.itchReady());
  element('word').textContent = connection.extension.currentWord() || '—';
  element('count').textContent = String(connection.extension.pieceCount());
  element('scene').textContent = JSON.stringify(provider.getScene(), null, 2);
}

function setWord(word: string): void {
  const objects: TangibleObject[] = [...word].map((letter, index) => ({
    trackId: `synthetic-${index}-${letter}`,
    pieceId: `letter:${letter}`,
    packId: starterPack.packId,
    x: 0.25 + index * 0.2,
    y: 0.5,
    rotationDeg: 0,
    confidence: 1,
  }));
  provider.setObjects(objects, performance.now());
}

const unsubscribe = provider.onSceneChanged(render);
element('cat').addEventListener('click', () => setWord('CAT'));
element('dog').addEventListener('click', () => setWord('DOG'));
element('clear').addEventListener('click', () => setWord(''));
const visionLink = element('vision-link') as HTMLAnchorElement;
const visionUrl = new URL(window.location.href);
visionUrl.port = '5173';
visionUrl.pathname = '/';
visionUrl.search = '';
visionUrl.hash = '';
visionLink.href = visionUrl.toString();
await provider.start();
render();
window.addEventListener('beforeunload', () => {
  unsubscribe();
  connection.dispose();
  void provider.stop();
});
