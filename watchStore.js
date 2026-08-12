const fs = require('fs');
const path = require('path');

function readState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function mediaIdentity(payload) {
  const media = payload.movie || payload.episode || payload.show || {};
  const ids = media.ids || payload.ids || {};
  const imdb = ids.imdb || media.imdb || payload.imdb;
  const tmdb = ids.tmdb || media.tmdb || payload.tmdb;
  const stremio = payload.stremioId || media.stremioId;
  const season = Number.isInteger(media.season) ? media.season : undefined;
  const number = Number.isInteger(media.number) ? media.number : undefined;
  const base = stremio || imdb || (tmdb ? `tmdb:${tmdb}` : null);
  if (!base) return null;
  return {
    key: payload.episode && season !== undefined && number !== undefined ? `${base}:${season}:${number}` : base,
    type: payload.episode ? 'episode' : payload.show ? 'show' : 'movie',
    ids: { ...(imdb ? { imdb } : {}), ...(tmdb ? { tmdb } : {}) },
    title: media.title || payload.title || '',
    ...(season !== undefined ? { season } : {}),
    ...(number !== undefined ? { number } : {})
  };
}

function upsertEvent(file, payload, source = 'nuvio') {
  const identity = mediaIdentity(payload);
  if (!identity) throw new Error('ID media obbligatorio (IMDb, TMDB o stremioId)');
  const progress = Number(payload.progress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new Error('progress non valido');
  const action = String(payload.action || (progress >= 90 ? 'stop' : 'pause')).toLowerCase();
  if (!['start', 'pause', 'stop', 'watched'].includes(action)) throw new Error('action non valida');
  const state = readState(file);
  const previous = state[identity.key] || {};
  const updatedAt = payload.updatedAt || new Date().toISOString();
  state[identity.key] = {
    ...previous,
    ...identity,
    progress,
    action,
    watched: action === 'watched' || (action === 'stop' && progress >= 90) || progress >= 95,
    source,
    updatedAt
  };
  writeState(file, state);
  return state[identity.key];
}

function listState(file, since) {
  const items = Object.values(readState(file));
  const after = since ? Date.parse(since) : 0;
  return items
    .filter(item => !after || Date.parse(item.updatedAt) > after)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

module.exports = { readState, writeState, mediaIdentity, upsertEvent, listState };
