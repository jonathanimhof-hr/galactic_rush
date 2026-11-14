// GALACTIC RUSH V12 server — the account database. Two stores with one small interface:
//   get(path)                -> { exists, data, version }   (version: the document's update time, null if missing)
//   commit([write, ...])     -> applies every write or none; each write is
//                               { set: path, data, ifVersion }  ifVersion: null = must not exist yet, a version = must
//                                                               still be that version, undefined = no condition
//                               { remove: path, ifVersion }
//                               a failed condition throws DbConflict (the caller reads again and retries)
//   list(collectionPath)     -> [{ id, data, version }]
// FirestoreDb talks to Cloud Firestore's REST API with the service account's access token (google.mjs); MemoryDb
// keeps everything in this process (local development and tests only: it forgets everything on restart).
// Values are plain JSON: strings, numbers, booleans, null, arrays and objects.
export class DbConflict extends Error { constructor(m) { super(m || 'the document changed meanwhile'); this.code = 'conflict'; } }
export class DbError extends Error { constructor(m, status) { super(m); this.code = 'db'; this.status = status; } }

// ---------- Firestore's typed values <-> plain JSON ----------
export function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v) } };
  throw new Error('cannot store a ' + typeof v);
}
export const encodeFields = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)]));
export function decode(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}
export const decodeFields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, decode(v)]));

const SEG = /^[^/]{1,1500}$/;
function checkPath(path, docPath = true) {
  const segs = String(path).split('/');
  if (segs.some(s => !SEG.test(s) || s === '.' || s === '..' || /^__.*__$/.test(s)) || (segs.length % 2 === 0) !== docPath) throw new Error('bad database path ' + path);
  return segs;
}

export class FirestoreDb {
  // accessToken: async () => token (google.mjs createServiceAuth), or emulator: 'host:port' (local testing only)
  constructor({ projectId, accessToken, baseUrl = 'https://firestore.googleapis.com/v1', emulator = null, fetch = globalThis.fetch, database = '(default)' }) {
    this.projectId = projectId; this.fetch = fetch;
    this.base = emulator ? `http://${emulator}/v1` : baseUrl;
    this.token = emulator ? async () => 'owner' : accessToken;
    this.name = `projects/${projectId}/databases/${database}/documents`;
  }
  async req(method, url, body) {
    const res = await this.fetch(url, { method, headers: { authorization: 'Bearer ' + await this.token(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    let j = null; try { j = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, j };
  }
  url(path) { return `${this.base}/${this.name}/${checkPath(path).map(encodeURIComponent).join('/')}`; }
  async get(path) {
    const { status, j } = await this.req('GET', this.url(path));
    if (status === 404) return { exists: false, data: null, version: null };
    if (status !== 200 || !j) throw new DbError(`database read failed (HTTP ${status}${j && j.error ? ', ' + j.error.status : ''})`, status);
    return { exists: true, data: decodeFields(j.fields), version: j.updateTime };
  }
  async commit(writes) {
    const body = { writes: writes.map(w => {
      const name = `${this.name}/${checkPath(w.set || w.remove).join('/')}`, pre = w.ifVersion === null ? { exists: false } : w.ifVersion ? { updateTime: w.ifVersion } : undefined;
      return w.set ? { update: { name, fields: encodeFields(w.data) }, ...(pre ? { currentDocument: pre } : {}) } : { delete: name, ...(pre ? { currentDocument: pre } : {}) };
    }) };
    const { status, j } = await this.req('POST', `${this.base}/projects/${this.projectId}/databases/${this.name.split('/')[3]}/documents:commit`, body);
    if (status === 200) return { ok: true, versions: (j && j.writeResults || []).map(r => r.updateTime) };
    const st = j && j.error && j.error.status;
    if (status === 409 || st === 'FAILED_PRECONDITION' || st === 'ALREADY_EXISTS' || st === 'ABORTED' || (st === 'NOT_FOUND' && writes.some(w => w.ifVersion))) throw new DbConflict();
    throw new DbError(`database write failed (HTTP ${status}${st ? ', ' + st : ''})`, status);
  }
  async list(collection) {
    checkPath(collection, false); const out = []; let page = '';
    for (let n = 0; n < 20; n++) {
      const { status, j } = await this.req('GET', `${this.base}/${this.name}/${collection.split('/').map(encodeURIComponent).join('/')}?pageSize=300${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
      if (status !== 200) throw new DbError(`database list failed (HTTP ${status})`, status);
      for (const d of (j && j.documents) || []) out.push({ id: d.name.split('/').pop(), data: decodeFields(d.fields), version: d.updateTime });
      if (!j || !j.nextPageToken) break; page = j.nextPageToken;
    }
    return out;
  }
}

export class MemoryDb {
  constructor() { this.docs = new Map(); this.n = 0; this.failNext = null; }
  async get(path) { checkPath(path); if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; } const d = this.docs.get(path); return d ? { exists: true, data: structuredClone(d.data), version: d.version } : { exists: false, data: null, version: null }; }
  async commit(writes) {
    if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; }
    for (const w of writes) { const p = w.set || w.remove; checkPath(p); const d = this.docs.get(p);
      if (w.ifVersion === null && d) throw new DbConflict(); if (w.ifVersion && (!d || d.version !== w.ifVersion)) throw new DbConflict(); }
    const versions = [];
    for (const w of writes) { if (w.set) { const v = `v${++this.n}`; this.docs.set(w.set, { data: structuredClone(w.data), version: v }); versions.push(v); } else { this.docs.delete(w.remove); versions.push(null); } }
    return { ok: true, versions };
  }
  async list(collection) { checkPath(collection, false); const pre = collection + '/', out = [];
    for (const [p, d] of this.docs) if (p.startsWith(pre) && !p.slice(pre.length).includes('/')) out.push({ id: p.slice(pre.length), data: structuredClone(d.data), version: d.version });
    return out; }
}
