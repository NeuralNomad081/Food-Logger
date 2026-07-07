/*
 * POST /api/analyze  { entryId }
 * Auth: Supabase user JWT in Authorization: Bearer <token>.
 *
 * Verifies the user, loads their entry + image server-side, asks a Groq
 * vision model for a nutrition estimate, stores it in entries.analysis
 * and returns it.
 *
 * Logs one JSON line per stage (visible in Vercel → Deployment → Functions
 * logs), all tied together by a per-request `rid`.
 *
 * Required Vercel env vars:
 *   SUPABASE_URL                — https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   — service role (server only, bypasses RLS)
 *   GROQ_API_KEY
 * Optional:
 *   GROQ_MODEL                  — default meta-llama/llama-4-scout-17b-16e-instruct
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const PROMPT = `You are a nutritionist estimating a meal from a photo.
The user may provide their own tags and note about the meal — trust them for identifying foods, use the photo for portion size.
Respond with ONLY a JSON object, no other text, in exactly this shape:
{
  "foods": [{"name": "string", "quantity": "string", "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}],
  "total": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number},
  "confidence": "low" | "medium" | "high"
}
Numbers are estimates for the visible portion. If the image clearly contains no food, return {"foods": [], "total": {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}, "confidence": "low"}.`;

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 10) / 10) : 0;
}

function makeLogger(rid) {
  const t0 = Date.now();
  const emit = (level, msg, meta = {}) => {
    const line = JSON.stringify({ level, msg, rid, elapsed_ms: Date.now() - t0, ...meta });
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
  };
  return {
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
  };
}

export default async function handler(req, res) {
  const rid = randomUUID().slice(0, 8);
  const log = makeLogger(rid);
  const fail = (status, error, meta) => {
    log.error('request failed', { status, error, ...meta });
    return res.status(status).json({ error, requestId: rid });
  };

  if (req.method !== 'POST') return fail(405, 'Method not allowed');

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GROQ_API_KEY) {
    const missing = [
      !SUPABASE_URL && 'SUPABASE_URL',
      !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
      !GROQ_API_KEY && 'GROQ_API_KEY',
    ].filter(Boolean);
    return fail(500, 'Server not configured (missing env vars)', { missing });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Missing auth token');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return fail(401, 'Invalid auth token', { detail: userErr?.message });
  }
  const userId = userData.user.id;

  const entryId = req.body?.entryId;
  if (!entryId) return fail(400, 'entryId required');
  log.info('request', { user: userId.slice(0, 8), entryId });

  const { data: entry, error: entryErr } = await supabase
    .from('entries')
    .select('id, user_id, meal, tags, note, image_path')
    .eq('id', entryId)
    .eq('user_id', userId)
    .single();
  if (entryErr || !entry) return fail(404, 'Entry not found', { detail: entryErr?.message });
  if (!entry.image_path) return fail(400, 'Entry has no image');

  const tDownload = Date.now();
  const { data: imgBlob, error: imgErr } = await supabase.storage
    .from('meals')
    .download(entry.image_path);
  if (imgErr || !imgBlob) return fail(500, 'Could not load image', { detail: imgErr?.message, path: entry.image_path });
  const b64 = Buffer.from(await imgBlob.arrayBuffer()).toString('base64');
  log.info('image loaded', { kb: Math.round(imgBlob.size / 1024), download_ms: Date.now() - tDownload });

  const context = [
    `Meal type: ${entry.meal}`,
    entry.tags?.length ? `User tags: ${entry.tags.join(', ')}` : null,
    entry.note ? `User note: ${entry.note}` : null,
  ].filter(Boolean).join('\n');

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  let analysis;
  try {
    const tGroq = Date.now();
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `${PROMPT}\n\n${context}` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        }],
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      log.error('groq error', { status: groqRes.status, body: errBody.slice(0, 500) });
      throw new Error(`Groq API error (${groqRes.status})`);
    }

    const completion = await groqRes.json();
    log.info('groq ok', {
      model,
      groq_ms: Date.now() - tGroq,
      prompt_tokens: completion.usage?.prompt_tokens,
      completion_tokens: completion.usage?.completion_tokens,
    });
    const parsed = JSON.parse(completion.choices[0].message.content);

    const foods = Array.isArray(parsed.foods) ? parsed.foods.slice(0, 20).map(f => ({
      name: String(f.name || 'unknown').slice(0, 80),
      quantity: String(f.quantity || '').slice(0, 60),
      calories: num(f.calories),
      protein_g: num(f.protein_g),
      carbs_g: num(f.carbs_g),
      fat_g: num(f.fat_g),
    })) : [];

    analysis = {
      status: 'done',
      calories: num(parsed.total?.calories),
      protein_g: num(parsed.total?.protein_g),
      carbs_g: num(parsed.total?.carbs_g),
      fat_g: num(parsed.total?.fat_g),
      foods,
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
      model,
      analyzed_at: new Date().toISOString(),
    };
  } catch (err) {
    log.error('analysis failed', { detail: err.message });
    await supabase.from('entries')
      .update({ analysis: { status: 'error', error: 'AI analysis failed' } })
      .eq('id', entryId);
    return res.status(502).json({ error: 'AI analysis failed, try again', requestId: rid });
  }

  const { error: saveErr } = await supabase.from('entries')
    .update({ analysis })
    .eq('id', entryId);
  if (saveErr) return fail(500, 'Could not save analysis', { detail: saveErr.message });

  log.info('done', { entryId, calories: analysis.calories, confidence: analysis.confidence });
  return res.status(200).json(analysis);
}
