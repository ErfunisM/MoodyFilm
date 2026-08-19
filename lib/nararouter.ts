import type { CandidateWatchedMovie, RecommendRequest } from "./types.ts";

const NARAROUTER_URL = "https://router.bynara.id/v1/chat/completions";

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in NaraRouter response");
    return JSON.parse(match[0]);
  }
}

export class NaraRouterError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NaraRouterError";
    this.status = status;
  }
}

function buildFilterPrompt(
  data: RecommendRequest,
  candidates: CandidateWatchedMovie[],
): string {
  const location =
    data.locationLabel ||
    [data.city, data.country].filter(Boolean).join(", ") ||
    "unspecified";

  const formattedCandidates = candidates
    .map((c, i) => {
      const yearStr = c.year ? ` (${c.year})` : "";
      const genreStr =
        c.genres && c.genres.length > 0
          ? `\n   TMDB Genres: ${c.genres.join(", ")}`
          : "";
      const desc = c.overview || c.overviewFa || c.reason || "";
      const descStr = desc ? `\n   Description: ${desc.slice(0, 200)}` : "";
      return `${i + 1}. Title: "${c.title}"${yearStr}${genreStr}${descStr}`;
    })
    .join("\n\n");

  const storyText = data.story?.trim();
  const hasRequest = (storyText?.length ?? 0) >= 3;

  // همان قاعده اولویت الگوریتم اصلی: متن نوشته‌شده بر mood مقدم است
  const priorityRule = hasRequest
    ? `PRIORITY: The written request is the strongest signal. A candidate must satisfy the written request. The selected mood (${data.mood}) is only a tone hint and must not override the written request.`
    : `PRIORITY: No written request was given, so the selected mood (${data.mood}) is the deciding signal.`;

  return `You are a strict movie content filter.

User Request & Profile:
- Gender: ${data.gender}
- Age: ${data.age} years old
- Location: ${location}
- Selected Mood: ${data.mood}
- Written request: ${storyText || "(none)"}
- Watch Time: ${data.watchTime}
- Company: ${data.company}

${priorityRule}

Your Task:
From the candidates below (films the user already watched), return ONLY those that genuinely match the profile right now. Each candidate lists its REAL TMDB genres — use them as the primary signal.

MOOD / GENRE COMPATIBILITY (based on TMDB Genres):
- 'thrill': INCLUDE Horror, Thriller, Mystery, Crime. EXCLUDE Animation, Family, Music.
- 'happy': INCLUDE Comedy, Family, Animation, Adventure. EXCLUDE Horror, Thriller, heavy Drama.
- 'romantic': INCLUDE Romance, or Drama with a central love story. EXCLUDE Horror, pure Action.
- 'sad': INCLUDE emotional/tragic Drama. EXCLUDE Comedy, upbeat Family films.
- 'chill': INCLUDE Comedy, light Drama, Family, Music, Documentary. EXCLUDE Horror, intense Thriller.
If the written request names a genre (sci-fi, anime, war, historical...), the candidate MUST have a matching TMDB genre.

AGE LIMITS (mandatory, cannot be overridden):
- Age < 6: ONLY G-rated family animation.
- Age 6-11: ONLY G/PG family-friendly films.
- Age 12-15: PG, mild PG-13 at most. No horror, no graphic violence.
- Age 16-17: PG-13 at most. No R-rated content.
- Age >= 18: any rating, but exclude preschool cartoons unless explicitly requested.
- Company 'family': content must be safe for mixed ages regardless of the viewer's own age.

BE SELECTIVE:
For each candidate ask: "Would this user genuinely want to RE-WATCH this film right now?" If doubtful, EXCLUDE it. If none match, return an empty array.

Candidate Movies:
${formattedCandidates}

Return ONLY valid JSON, no markdown, no commentary:
{ "titles": ["Matching Title 1"] }`;
}

const TRANSLATE_SYSTEM_PROMPT =
  "You are a professional translator. Translate the movie plot into fluent, natural Persian (Farsi). Return only the translated plot text. No quotes, labels, titles, or commentary.";

function hasPersianScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F]/.test(text);
}

/** Translate an English TMDB overview to Persian. Never returns Latin-only text. */
export async function translateOverviewToFa(
  english: string,
): Promise<string | null> {
  const source = english.trim();
  if (!source) return null;

  const apiKey = process.env.NARAROUTER_API_KEY;
  const model = process.env.NARAROUTER_MODEL || "tencent-hy3";
  if (!apiKey) return null;

  try {
    const response = await fetch(NARAROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
          { role: "user", content: source },
        ],
      }),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const translated = raw.replace(/^["'«»]+|["'«»]+$/g, "").trim();
    if (!translated || !hasPersianScript(translated)) return null;
    if (translated === source) return null;

    return translated;
  } catch {
    return null;
  }
}

export async function filterRelevantWatched(
  data: RecommendRequest,
  candidates: CandidateWatchedMovie[],
): Promise<string[]> {
  if (candidates.length === 0) return [];

  const apiKey = process.env.NARAROUTER_API_KEY;
  const model = process.env.NARAROUTER_MODEL || "tencent-hy3";
  if (!apiKey) return [];

  try {
    const response = await fetch(NARAROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are a movie expert. Always respond with valid JSON only.",
          },
          { role: "user", content: buildFilterPrompt(data, candidates) },
        ],
      }),
    });

    if (!response.ok) return [];

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = extractJson(content) as { titles?: unknown };
    if (!Array.isArray(parsed.titles)) return [];

    return parsed.titles
      .filter((t): t is string => typeof t === "string")
      .filter((t) =>
        candidates.some((c) => c.title.toLowerCase() === t.toLowerCase()),
      );
  } catch {
    return [];
  }
}
