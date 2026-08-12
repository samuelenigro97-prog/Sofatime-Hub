// Test puro (senza rete) della logica di diff usata dal demone di sync YouTube.
const assert = require('assert');
process.env.YT_CLIENT_ID = process.env.YT_CLIENT_ID || 'test-client-id';
process.env.YT_CLIENT_SECRET = process.env.YT_CLIENT_SECRET || 'test-client-secret';

const { computeSyncActions } = require('../youtube-sync/api');

let passed = 0;
const ok = (name) => { console.log('  ok -', name); passed++; };

// Una nuova iscrizione su account1 va propagata su account2.
{
  const actual1 = new Map([['C1', 'Canale Uno'], ['C2', 'Canale Due']]);
  const actual2 = new Map([['C1', 'Canale Uno']]);
  const known1 = new Set(['C1']);
  const known2 = new Set(['C1']);
  const { toAdd1, toAdd2 } = computeSyncActions({ actual1, actual2, known1, known2 });
  assert.deepStrictEqual(toAdd2, ['C2']);
  assert.deepStrictEqual(toAdd1, []);
  ok('propaga una nuova iscrizione da account1 ad account2');
}

// Nessuna azione se il canale è già presente su entrambi: niente doppioni, niente loop.
{
  const actual1 = new Map([['C1', 'x'], ['C3', 'y']]);
  const actual2 = new Map([['C1', 'x'], ['C3', 'y']]);
  const known1 = new Set(['C1']);
  const known2 = new Set(['C1']);
  const { toAdd1, toAdd2 } = computeSyncActions({ actual1, actual2, known1, known2 });
  assert.deepStrictEqual(toAdd1, []);
  assert.deepStrictEqual(toAdd2, []);
  ok('nessuna azione se entrambi gli account hanno già il canale (evita il loop)');
}

// Sync bidirezionale: nuove iscrizioni diverse su entrambi gli account nello stesso giro.
{
  const actual1 = new Map([['C1', 'x'], ['C4', 'nuovo su 1']]);
  const actual2 = new Map([['C1', 'x'], ['C5', 'nuovo su 2']]);
  const known1 = new Set(['C1']);
  const known2 = new Set(['C1']);
  const { toAdd1, toAdd2 } = computeSyncActions({ actual1, actual2, known1, known2 });
  assert.deepStrictEqual(toAdd2, ['C4']);
  assert.deepStrictEqual(toAdd1, ['C5']);
  ok('sincronizza in entrambe le direzioni nello stesso ciclo');
}

// Una disiscrizione (canale sparito da actual) non genera azioni: è additivo, non rimuove.
{
  const actual1 = new Map();
  const actual2 = new Map([['C1', 'x']]);
  const known1 = new Set(['C1']);
  const known2 = new Set(['C1']);
  const { toAdd1, toAdd2 } = computeSyncActions({ actual1, actual2, known1, known2 });
  assert.deepStrictEqual(toAdd1, []);
  assert.deepStrictEqual(toAdd2, []);
  ok('una disiscrizione non genera azioni (sync solo additiva)');
}

console.log('\nTutti i test superati (' + passed + ').');
