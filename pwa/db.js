/*
 * Remote data layer — Supabase (Postgres + Storage + Auth).
 * Entry rows map to app objects:
 *   { id, timestamp(ms), meal, tags[], note, imagePath, thumbPath, analysis }
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

const BUCKET = 'meals';

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

function assertOk(error) {
  if (error) throw new Error(error.message || String(error));
}

export const FoodAPI = {
  isConfigured,

  /* ---------- auth ---------- */

  onAuthChange(cb) {
    sb.auth.onAuthStateChange((_event, session) => cb(session));
  },

  async getSession() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },

  async sendLoginEmail(email) {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    assertOk(error);
  },

  async verifyCode(email, token) {
    const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
    assertOk(error);
  },

  async signOut() {
    await sb.auth.signOut();
  },

  /* ---------- entries ---------- */

  async listEntries() {
    const { data, error } = await sb
      .from('entries')
      .select('*')
      .order('eaten_at', { ascending: false });
    assertOk(error);
    return data.map(rowToEntry);
  },

  async createEntry(entry, imageBlob, thumbBlob) {
    const session = await this.getSession();
    if (!session) throw new Error('Not signed in');
    const uid = session.user.id;
    const imagePath = `${uid}/${entry.id}.jpg`;
    const thumbPath = `${uid}/${entry.id}-thumb.jpg`;

    const opts = { contentType: 'image/jpeg', upsert: true };
    const [up1, up2] = await Promise.all([
      sb.storage.from(BUCKET).upload(imagePath, imageBlob, opts),
      sb.storage.from(BUCKET).upload(thumbPath, thumbBlob, opts),
    ]);
    assertOk(up1.error);
    assertOk(up2.error);

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
      sb.storage.from(BUCKET).remove([imagePath, thumbPath]).catch(() => {});
      throw new Error(error.message);
    }
    return rowToEntry(data);
  },

  async updateEntry(entry) {
    const { data, error } = await sb.from('entries').update({
      eaten_at: new Date(entry.timestamp).toISOString(),
      meal: entry.meal,
      tags: entry.tags,
      note: entry.note,
    }).eq('id', entry.id).select().single();
    assertOk(error);
    return rowToEntry(data);
  },

  async deleteEntry(entry) {
    const paths = [entry.imagePath, entry.thumbPath].filter(Boolean);
    if (paths.length) {
      const { error } = await sb.storage.from(BUCKET).remove(paths);
      assertOk(error);
    }
    const { error } = await sb.from('entries').delete().eq('id', entry.id);
    assertOk(error);
  },

  /* ---------- images ---------- */

  // Map of path -> signed URL (1h).
  async signUrls(paths) {
    const map = new Map();
    if (!paths.length) return map;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
    assertOk(error);
    for (const item of data) {
      if (item.signedUrl) map.set(item.path, item.signedUrl);
    }
    return map;
  },

  async downloadImage(path) {
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    assertOk(error);
    return data; // Blob
  },

  /* ---------- tags ---------- */

  async getTopTags(limit = 14) {
    const { data, error } = await sb.from('entries').select('tags');
    assertOk(error);
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
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ entryId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Analysis failed (${res.status})`);
    return body; // analysis object
  },
};
