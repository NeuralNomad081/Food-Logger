/*
 * POST /api/analyze  { entryId }
 * Auth: Supabase user JWT in Authorization: Bearer <token>.
 *
 * Verifies the user, loads their entry + image server-side, asks a Groq
 * vision model for a nutrition estimate, stores it in entries.analysis
 * and returns it.
 *
 * Required Vercel env vars:
 *   SUPABASE_URL                — https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   — service role (server only, bypasses RLS)
 *   GROQ_API_KEY
 * Optional:
 *   GROQ_MODEL                  — default meta-llama/llama-4-scout-17b-16e-instruct
 */
import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GROQ_API_KEY) {
    return res.status(500).json({ error: 'Server not configured (missing env vars)' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
  const userId = userData.user.id;

  const entryId = req.body?.entryId;
  if (!entryId) return res.status(400).json({ error: 'entryId required' });

  const { data: entry, error: entryErr } = await supabase
    .from('entries')
    .select('id, user_id, meal, tags, note, image_path')
    .eq('id', entryId)
    .eq('user_id', userId)
    .single();
  if (entryErr || !entry) return res.status(404).json({ error: 'Entry not found' });
  if (!entry.image_path) return res.status(400).json({ error: 'Entry has no image' });

  const { data: imgBlob, error: imgErr } = await supabase.storage
    .from('meals')
    .download(entry.image_path);
  if (imgErr || !imgBlob) return res.status(500).json({ error: 'Could not load image' });
  const b64 = Buffer.from(await imgBlob.arrayBuffer()).toString('base64');

  const context = [
    `Meal type: ${entry.meal}`,
    entry.tags?.length ? `User tags: ${entry.tags.join(', ')}` : null,
    entry.note ? `User note: ${entry.note}` : null,
  ].filter(Boolean).join('\n');

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  let analysis;
  try {
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
      console.error('Groq error:', groqRes.status, errBody.slice(0, 500));
      throw new Error(`Groq API error (${groqRes.status})`);
    }

    const completion = await groqRes.json();
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
    console.error('Analysis failed:', err);
    await supabase.from('entries')
      .update({ analysis: { status: 'error', error: 'AI analysis failed' } })
      .eq('id', entryId);
    return res.status(502).json({ error: 'AI analysis failed, try again' });
  }

  const { error: saveErr } = await supabase.from('entries')
    .update({ analysis })
    .eq('id', entryId);
  if (saveErr) {
    console.error('Save failed:', saveErr);
    return res.status(500).json({ error: 'Could not save analysis' });
  }

  return res.status(200).json(analysis);
}
