import type { CandidateWatchedMovie, RecommendRequest } from "./types.ts";
import { looksLikeGibberish } from "./storyText.ts";

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

export interface ProfileSummaryResult {
  summary: string;
  storyMeaningful: boolean;
}

const LABEL_FA = {
  gender: { female: "زن", male: "مرد" } as const,
  mood: {
    happy: "شاد",
    sad: "غمگین",
    romantic: "رمانتیک",
    thrill: "هیجان",
    chill: "آروم",
  } as const,
  weather: {
    sunny: "آفتابی",
    cloudy: "ابری",
    rainy: "بارانی",
    snowy: "برفی",
  } as const,
  watchTime: {
    morning: "صبح",
    afternoon: "بعدازظهر",
    night: "شب",
  } as const,
  company: {
    alone: "به‌تنهایی",
    family: "با خانواده",
    friends: "با دوستان",
    partner: "با پارتنر",
  } as const,
};

const LABEL_EN = {
  gender: { female: "a woman", male: "a man" } as const,
  mood: {
    happy: "happy",
    sad: "sad",
    romantic: "romantic",
    thrill: "thrilling",
    chill: "chill",
  } as const,
  weather: {
    sunny: "sunny",
    cloudy: "cloudy",
    rainy: "rainy",
    snowy: "snowy",
  } as const,
  watchTime: {
    morning: "morning",
    afternoon: "afternoon",
    night: "night",
  } as const,
  company: {
    alone: "on your own",
    family: "with family",
    friends: "with friends",
    partner: "with your partner",
  } as const,
};

function buildSummaryFallback(
  data: RecommendRequest,
  storyMeaningful: boolean,
): ProfileSummaryResult {
  const locale = data.locale === "en" ? "en" : "fa";
  const location =
    data.locationLabel ||
    [data.city, data.country].filter(Boolean).join(locale === "fa" ? "، " : ", ") ||
    (locale === "fa" ? "مکان انتخاب‌شده" : "the place you selected");
  const note = (data.story ?? "").trim();

  if (locale === "fa") {
    const mood = LABEL_FA.mood[data.mood];
    const weather = LABEL_FA.weather[data.weather];
    const when = LABEL_FA.watchTime[data.watchTime];
    const company = LABEL_FA.company[data.company];

    if (!storyMeaningful) {
      return {
        storyMeaningful: false,
        summary: `بر اساس انتخاب‌های شما، زمان تماشا ${when} است، همراهی‌تان ${company} است، حال‌وهوایتان ${mood} است و هوا ${weather} گزارش شده است؛ مکان نیز ${location} است. اما توضیحی که نوشته‌اید مفهوم روشنی ندارد. به همین دلیل ممکن است فیلم‌های پیشنهادی چندان مناسب شما نباشند.`,
      };
    }

    return {
      storyMeaningful: true,
      summary: `بر اساس انتخاب‌های شما، زمان تماشا ${when} است، همراهی‌تان ${company} است، حال‌وهوایتان ${mood} است و هوا ${weather} است؛ مکان نیز ${location} است. شما همچنین نوشته‌اید که ${note.slice(0, 180)}. به این دلایل، فیلم‌های زیر برای شما مناسب تشخیص داده شده‌اند تا با حال‌وهوا و توضیح شما هماهنگ باشند.`,
    };
  }

  const mood = LABEL_EN.mood[data.mood];
  const weather = LABEL_EN.weather[data.weather];
  const when = LABEL_EN.watchTime[data.watchTime];
  const company = LABEL_EN.company[data.company];

  if (!storyMeaningful) {
    return {
      storyMeaningful: false,
      summary: `Based on your choices, you plan to watch in the ${when}, ${company}, in a ${mood} mood, with ${weather} weather in ${location}. However, the note you wrote is not clear. For that reason, the suggested films may not be suitable for you.`,
    };
  }

  return {
    storyMeaningful: true,
    summary: `Based on your choices, you plan to watch in the ${when}, ${company}, in a ${mood} mood, with ${weather} weather in ${location}. You also wrote that ${note.slice(0, 180)}. For these reasons, the films below were selected as suitable for you and aligned with your mood and note.`,
  };
}

function buildSummaryPrompt(data: RecommendRequest): string {
  const locale = data.locale === "en" ? "en" : "fa";
  const location =
    data.locationLabel ||
    [data.city, data.country].filter(Boolean).join(", ") ||
    "unspecified";
  const note = (data.story ?? "").trim();

  if (locale === "fa") {
    return `یک متن کوتاه و ساده برای کاربر بنویس. لحن رسمی اما روان باشد؛ نه محاوره‌ای شکسته و نه رباتی عجیب.

پروفایل:
- جنسیت: ${data.gender}
- سن: ${data.age}
- مکان: ${location}
- هوا: ${data.weather}
- حال‌وهوا: ${data.mood}
- زمان تماشا: ${data.watchTime}
- همراه: ${data.company}
- توضیح کاربر: """${note}"""

storyMeaningful:
- true = توضیح جمله واقعی و مفهوم‌دار است
- false = حروف بی‌معنی یا متن نامفهوم است

متن summary باید یک پاراگراف ساده باشد (۳ تا ۵ جمله) با این ساختار:
1) اول انتخاب‌های کاربر را به زبان ساده و رسمی بیان کن (زمان، همراه، حال‌وهوا، هوا، مکان).
2) اگر storyMeaningful=true، اشاره کوتاه و طبیعی به توضیح او بکن؛ سپس صریح بگو به این دلایل این فیلم‌ها برای او مناسب‌اند.
3) اگر storyMeaningful=false، بگو توضیحش مفهوم نبود و ممکن است نتیجه مناسب نباشد.

قواعد لحن:
- فعل‌ها رسمی باشند (مثلاً می‌خواهید، نوشته‌اید، است) — از شکل‌های شکسته مثل می‌خوای، نوشتی، هستی، ه، چی تو سرته استفاده نکن.
- بیان ساده و روشن؛ بدون استعاره عجیب، بدون لحن دوستانهٔ خیلی خودمانی، بدون عبارات کلیشه‌ای هوش مصنوعی.
- بدون اسم فیلم، بدون بولت، بدون مارک‌داون.

فقط JSON:
{"storyMeaningful":true,"summary":"..."}`;
  }

  return `Write a short, plain summary for the user. Tone: formal but simple — not slangy, not oddly robotic.

Profile:
- Gender: ${data.gender}
- Age: ${data.age}
- Location: ${location}
- Weather: ${data.weather}
- Mood: ${data.mood}
- Watch time: ${data.watchTime}
- Company: ${data.company}
- User note: """${note}"""

storyMeaningful:
- true = real meaningful note
- false = gibberish / nonsense

summary = one plain paragraph (3–5 sentences):
1) First state their choices simply (when, company, mood, weather, place).
2) If meaningful, briefly reflect their note, then clearly say: for these reasons, these films are suitable for them.
3) If not meaningful, say the note was unclear and results may not fit.

Tone rules: simple wording, formal verbs, no slang, no weird metaphors, no AI clichés, no movie titles, no markdown.

Return ONLY JSON:
{"storyMeaningful":true,"summary":"..."}`;
}

/** یک پاراگراف شرح حال شخصی + تشخیص معنادار بودن یادداشت کاربر */
export async function generateProfileSummary(
  data: RecommendRequest,
): Promise<ProfileSummaryResult> {
  // اگر هیوریستیک صریحاً نافهوم دید، به مدل اعتماد نکن که «معنادار» بگوید
  const heuristicGibberish = looksLikeGibberish(data.story ?? "");
  const apiKey = process.env.NARAROUTER_API_KEY;
  const model = process.env.NARAROUTER_MODEL || "tencent-hy3";

  if (!apiKey || heuristicGibberish) {
    return buildSummaryFallback(data, !heuristicGibberish);
  }

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
            content:
              "You write short plain summaries in formal but simple language. No slang, no broken colloquial verbs, no weird metaphors. Always respond with valid JSON only.",
          },
          { role: "user", content: buildSummaryPrompt(data) },
        ],
      }),
    });

    if (!response.ok) {
      return buildSummaryFallback(data, true);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return buildSummaryFallback(data, true);
    }

    const parsed = extractJson(content) as {
      storyMeaningful?: unknown;
      summary?: unknown;
    };

    let storyMeaningful =
      typeof parsed.storyMeaningful === "boolean"
        ? parsed.storyMeaningful
        : true;

    const summary =
      typeof parsed.summary === "string" ? parsed.summary.trim() : "";

    // برای نافهوم همیشه متن ثابت و واضح خودمان را نشان بده
    if (!storyMeaningful) {
      return buildSummaryFallback(data, false);
    }

    if (!summary) {
      return buildSummaryFallback(data, true);
    }

    return { summary, storyMeaningful: true };
  } catch {
    return buildSummaryFallback(data, !heuristicGibberish);
  }
}

