/*
 * Remote data layer — Supabase (Postgres + Storage + Auth).
 * Entry rows map to app objects:
 *   { id, timestamp(ms), meal, tags[], note, imagePath, thumbPath, analysis }
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';
import { createLogger } from './logger.js';

const BUCKET = 'meals';
const log = createLogger('data');

const sb = isConfigured() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function rowToEntry(row) {
  return {
    id: row.id,
    timestamp: Date.parse(row.eaten_at),
    meal: row.meal,
    tags: row.tags || [],
    note: row.note || '',
    imagePath: row.image_path,
    thumbPath: row.thumb_path,
    analysis: row.analysis || { status: 'pending' },
  };
}

function assertOk(error, context) {
  if (!error) return;
  // supabase-js 5xx errors arrive as AuthRetryableFetchError with message "{}".
  let msg = error.message;
  if (!msg || msg === '{}') {
    msg = error.code || (error.status ? `Server error (${error.status})` : 'Unknown error');
  }
  log.error(context || 'supabase error:', msg, error.status ? `status=${error.status}` : '');
  const err = new Error(msg);
  err.status = error.status;
  err.code = error.code;
  throw err;
}

export const FoodAPI = {
  isConfigured,

  /* ---------- auth ---------- */

  onAuthChange(cb) {
    sb.auth.onAuthStateChange((event, session) => {
      log.info('auth event:', event, session ? `user=${session.user.id.slice(0, 8)}…` : 'no session');
      cb(session);
    });
  },

  async getSession() {
    const { data } = await sb.auth.getSession();
    log.debug('getSession:', data.session ? 'signed in' : 'signed out');
    return data.session;
  },

  async sendLoginEmail(email) {
    return log.time('sendLoginEmail', async () => {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + location.pathname },
      });
      assertOk(error, 'sendLoginEmail:');
    });
  },

  async verifyCode(email, token) {
    return log.time('verifyCode', async () => {
      const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      assertOk(error, 'verifyCode:');
    });
  },

  async signOut() {
    log.info('signing out');
    await sb.auth.signOut();
  },

  /* ---------- entries ---------- */

  async listEntries() {
    return log.time('listEntries', async () => {
      const { data, error } = await sb
        .from('entries')
        .select('*')
        .order('eaten_at', { ascending: false });
      assertOk(error, 'listEntries:');
      log.debug(`loaded ${data.length} entries`);
      return data.map(rowToEntry);
    });
  },

  async createEntry(entry, imageBlob, thumbBlob) {
    const session = await this.getSession();
    if (!session) throw new Error('Not signed in');
    const uid = session.user.id;
    const imagePath = `${uid}/${entry.id}.jpg`;
    const thumbPath = `${uid}/${entry.id}-thumb.jpg`;
    log.info(`createEntry ${entry.id.slice(0, 8)}… image=${Math.round(imageBlob.size / 1024)}KB thumb=${Math.round(thumbBlob.size / 1024)}KB`);

    await log.time('upload images', async () => {
      const opts = { contentType: 'image/jpeg', upsert: true };
      const [up1, up2] = await Promise.all([
        sb.storage.from(BUCKET).upload(imagePath, imageBlob, opts),
        sb.storage.from(BUCKET).upload(thumbPath, thumbBlob, opts),
      ]);
      assertOk(up1.error, 'upload image:');
      assertOk(up2.error, 'upload thumb:');
    });

    return log.time('insert entry row', async () => {
      const { data, error } = await sb.from('entries').insert({
        id: entry.id,
        eaten_at: new Date(entry.timestamp).toISOString(),
        meal: entry.meal,
        tags: entry.tags,
        note: entry.note,
        image_path: imagePath,
        thumb_path: thumbPath,
      }).select().single();
      if (error) {
        // Best-effort cleanup of orphaned uploads.
        log.warn('insert failed, removing uploaded images');
        sb.storage.from(BUCKET).remove([imagePath, thumbPath]).catch(() => {});
        assertOk(error, 'insert entry:');
      }
      return rowToEntry(data);
    });
  },

  async updateEntry(entry) {
    return log.time(`updateEntry ${entry.id.slice(0, 8)}…`, async () => {
      const { data, error } = await sb.from('entries').update({
        eaten_at: new Date(entry.timestamp).toISOString(),
        meal: entry.meal,
        tags: entry.tags,
        note: entry.note,
      }).eq('id', entry.id).select().single();
      assertOk(error, 'updateEntry:');
      return rowToEntry(data);
    });
  },

  async deleteEntry(entry) {
    return log.time(`deleteEntry ${entry.id.slice(0, 8)}…`, async () => {
      const paths = [entry.imagePath, entry.thumbPath].filter(Boolean);
      if (paths.length) {
        const { error } = await sb.storage.from(BUCKET).remove(paths);
        assertOk(error, 'delete images:');
      }
      const { error } = await sb.from('entries').delete().eq('id', entry.id);
      assertOk(error, 'delete row:');
    });
  },

  /* ---------- images ---------- */

  // Map of path -> signed URL (1h).
  async signUrls(paths) {
    const map = new Map();
    if (!paths.length) return map;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
    assertOk(error, 'signUrls:');
    for (const item of data) {
      if (item.signedUrl) map.set(item.path, item.signedUrl);
      else log.warn('no signed url for', item.path, item.error || '');
    }
    log.debug(`signed ${map.size}/${paths.length} urls`);
    return map;
  },

  async downloadImage(path) {
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    assertOk(error, `downloadImage ${path}:`);
    return data; // Blob
  },

  /* ---------- tags ---------- */

  async getTopTags(limit = 14) {
    const { data, error } = await sb.from('entries').select('tags');
    assertOk(error, 'getTopTags:');
    const counts = new Map();
    for (const row of data) {
      for (const t of row.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name]) => name);
  },

  /* ---------- AI analysis (Groq via Vercel function) ---------- */

  async analyze(entryId) {
    const session = await this.getSession();
    if (!session) throw new Error('Not signed in');
    return log.time(`analyze ${entryId.slice(0, 8)}…`, async () => {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ entryId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        log.error(`analyze HTTP ${res.status}:`, body.error || '(no body)', body.requestId ? `requestId=${body.requestId}` : '');
        throw new Error(body.error || `Analysis failed (${res.status})`);
      }
      log.info(`analysis done: ${body.calories} kcal, confidence=${body.confidence}`);
      return body; // analysis object
    });
  },
};
