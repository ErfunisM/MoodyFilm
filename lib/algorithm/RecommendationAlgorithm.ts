import type { RecommendRequest, AiMovie } from "../types.ts";
import { NaraRouterError } from "../nararouter.ts";

const NARAROUTER_URL = "https://router.bynara.id/v1/chat/completions";

/** حداقل تعداد کاراکتر معنادار در متن آخر تا «درخواست خاص» تلقی شود */
const SPECIFIC_REQUEST_MIN_LENGTH = 3;

/**
 * Extract JSON from AI response
 */
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

/**
 * Normalize AI response to AiMovie format
 */
function normalizeMovies(payload: unknown): AiMovie[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid NaraRouter payload");
  }

  const movies = (payload as { movies?: unknown }).movies;
  if (!Array.isArray(movies)) {
    throw new Error("NaraRouter response missing movies array");
  }

  const currentYear = new Date().getFullYear();
  const seen = new Set<string>();

  const normalized = movies
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const movie = item as Record<string, unknown>;
      const title = String(movie.title ?? "").trim();
      const year = Number(movie.year);
      const imdbRating = Number(movie.imdbRating ?? movie.imdb_rating);
      const reason = String(movie.reason ?? "").trim();

      if (!title || !Number.isFinite(year) || !Number.isFinite(imdbRating)) {
        return null;
      }

      // سال باید در بازه واقعی سینما باشد؛ سال‌های ساختگی رد می‌شوند
      const roundedYear = Math.round(year);
      if (roundedYear < 1900 || roundedYear > currentYear + 1) {
        return null;
      }

      // ریتینگ خارج از بازه IMDb یعنی مدل عدد را از خودش ساخته
      if (imdbRating < 0 || imdbRating > 10) {
        return null;
      }

      return {
        title,
        year: roundedYear,
        imdbRating,
        reason: reason || "A strong match for your mood.",
      } satisfies AiMovie;
    })
    .filter((movie): movie is AiMovie => movie !== null)
    .filter((movie) => movie.imdbRating >= 6.5)
    // حذف تکراری‌ها بر اساس عنوان
    .filter((movie) => {
      const key = movie.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);

  if (normalized.length < 1) {
    throw new Error("NaraRouter returned no valid movies");
  }

  return normalized;
}

/**
 * Map HTTP errors to NaraRouterError
 */
function mapHttpError(status: number, errorText: string): NaraRouterError {
  const lower = errorText.toLowerCase();

  let apiMessage = "";
  try {
    const parsed = JSON.parse(errorText) as {
      error?: { message?: string; type?: string };
      message?: string;
    };
    apiMessage =
      parsed.error?.message || parsed.message || errorText.slice(0, 300);
  } catch {
    apiMessage = errorText.slice(0, 300);
  }

  if (lower.includes("telegram_required") || lower.includes("bind your telegram")) {
    return new NaraRouterError(
      "NaraRouter requires linking Telegram. Open router.bynara.id/settings, bind Telegram, then try again.",
      403,
    );
  }

  if (
    status === 402 ||
    lower.includes("insufficient") ||
    lower.includes("quota") ||
    lower.includes("credits")
  ) {
    return new NaraRouterError(
      "NaraRouter credits/quota exhausted. Check your plan at router.naraya.ai.",
      402,
    );
  }

  if (status === 401) {
    return new NaraRouterError(
      "NaraRouter API key is invalid. Check NARAROUTER_API_KEY in .env.local.",
      401,
    );
  }

  if (status === 403) {
    return new NaraRouterError(
      apiMessage || "NaraRouter denied this request (403).",
      403,
    );
  }

  if (status === 429) {
    return new NaraRouterError(
      "NaraRouter rate limit hit. Wait a moment and try again.",
      429,
    );
  }

  return new NaraRouterError(
    apiMessage || `NaraRouter request failed (${status}).`,
    status >= 400 && status < 600 ? status : 502,
  );
}

/**
 * Weight configuration for different factors in recommendation algorithm
 * These weights determine how much each factor influences the final recommendation
 */
interface AlgorithmWeights {
  mood: number;
  age: number;
  company: number;
  watchTime: number;
  weather: number;
  location: number;
  story: number;
}

/**
 * Contextual rules that connect different factors together.
 * Every rule carries its own insight text, so the sentence handed to the AI
 * is always the actual reason the weight changed — never a guess.
 */
interface ContextualRule {
  id: string;
  condition: (data: RecommendRequest) => boolean;
  factor: keyof AlgorithmWeights;
  multiplier: number;
  insight: (data: RecommendRequest) => string;
}

/** سطح محدودیت محتوایی بر اساس سن مخاطب */
type ContentTier = "toddler" | "kids" | "preteen" | "teen" | "adult";

/**
 * Recommendation Algorithm
 *
 * Processes the 8 wizard answers as one interconnected system and turns them
 * into a single, self-consistent prompt:
 *
 * 1. Contextual rules adjust factor weights (each rule owns its insight text)
 * 2. The strongest factors are ranked and handed to the AI as an explicit priority order
 * 3. Age + company determine a hard content tier that cannot be overridden
 * 4. The free-text story wins over the selected mood when the two conflict
 */
export class RecommendationAlgorithm {
  private static readonly DEFAULT_WEIGHTS: AlgorithmWeights = {
    mood: 1.5,          // Primary driver - highest weight
    age: 1.2,           // Content appropriateness
    company: 1.1,       // Social context
    watchTime: 1.0,     // Energy level
    weather: 0.8,       // Atmospheric influence
    location: 0.7,      // Cultural context
    story: 2.0,         // Specific requests - highest override
  };

  private static readonly CONTEXTUAL_RULES: ContextualRule[] = [
    // آب‌وهوا حال‌وهوا را تقویت می‌کند
    {
      id: "weather-rainy-sad",
      condition: (d) => d.weather === "rainy" && d.mood === "sad",
      factor: "mood",
      multiplier: 1.3,
      insight: () =>
        "Rainy weather deepens the melancholic mood — lean into reflective, emotionally honest films",
    },
    {
      id: "weather-sunny-happy",
      condition: (d) => d.weather === "sunny" && d.mood === "happy",
      factor: "mood",
      multiplier: 1.2,
      insight: () =>
        "Sunny weather reinforces the upbeat mood — favor bright, energetic films",
    },
    {
      id: "weather-snowy-cozy",
      condition: (d) =>
        d.weather === "snowy" && (d.mood === "romantic" || d.mood === "chill"),
      factor: "mood",
      multiplier: 1.25,
      insight: (d) =>
        `Snowy weather creates a cozy atmosphere that amplifies the ${d.mood} mood`,
    },

    // همراه، ژانر مناسب را تعیین می‌کند
    {
      id: "company-partner-romantic",
      condition: (d) => d.company === "partner" && d.mood === "romantic",
      factor: "mood",
      multiplier: 1.4,
      insight: () =>
        "Watching with a partner in a romantic mood — prioritize films that work as a shared intimate experience",
    },
    {
      id: "company-alone-thrill",
      condition: (d) => d.company === "alone" && d.mood === "thrill",
      factor: "mood",
      multiplier: 1.3,
      insight: () =>
        "Watching alone in a thrill mood allows fully immersive, high-tension films",
    },
    {
      id: "company-friends-social",
      condition: (d) =>
        d.company === "friends" && (d.mood === "happy" || d.mood === "thrill"),
      factor: "company",
      multiplier: 1.3,
      insight: () =>
        "Group viewing with friends — favor crowd-pleasing films that spark reactions and conversation",
    },

    // زمان تماشا سطح انرژی را تعیین می‌کند
    {
      id: "time-night-thrill",
      condition: (d) => d.watchTime === "night" && d.mood === "thrill",
      factor: "mood",
      multiplier: 1.2,
      insight: () =>
        "Late-night viewing suits dark, atmospheric, tension-driven films",
    },
    {
      id: "time-morning-happy",
      condition: (d) => d.watchTime === "morning" && d.mood === "happy",
      factor: "mood",
      multiplier: 1.15,
      insight: () =>
        "Morning viewing calls for light, uplifting films rather than heavy or draining ones",
    },
    {
      id: "time-morning-heavy-mood",
      condition: (d) =>
        d.watchTime === "morning" && (d.mood === "thrill" || d.mood === "sad"),
      factor: "watchTime",
      multiplier: 1.3,
      insight: (d) =>
        `Morning viewing tempers the ${d.mood} mood — avoid the most extreme or draining titles`,
    },

    // سن سطح محتوا را محدود می‌کند
    {
      id: "age-minor-intense-mood",
      condition: (d) => d.age < 13 && (d.mood === "thrill" || d.mood === "romantic"),
      factor: "age",
      multiplier: 2.0,
      insight: (d) =>
        `Viewer is ${d.age} years old with a ${d.mood} mood — deliver the feeling through age-appropriate adventure or family films, never mature content`,
    },
    {
      id: "age-family-viewing",
      condition: (d) => d.company === "family",
      factor: "age",
      multiplier: 1.5,
      insight: () =>
        "Family group viewing — content must be safe for mixed ages, with no graphic violence, sexual content, or heavy profanity",
    },
  ];

  /**
   * Calculate dynamic weights and collect the insight of every rule that fired.
   * Returning both together guarantees the insights always match the weights.
   */
  private static evaluate(data: RecommendRequest): {
    weights: AlgorithmWeights;
    insights: string[];
  } {
    const weights = { ...this.DEFAULT_WEIGHTS };
    const insights: string[] = [];

    for (const rule of this.CONTEXTUAL_RULES) {
      if (!rule.condition(data)) continue;
      weights[rule.factor] *= rule.multiplier;
      insights.push(rule.insight(data));
    }

    // متن آزاد مرحله آخر، مهم‌ترین سیگنال است
    if (this.hasSpecificRequest(data)) {
      weights.story *= 1.5;
    }

    return { weights, insights };
  }

  /** آیا کاربر در مرحله آخر درخواست معناداری نوشته است؟ */
  private static hasSpecificRequest(data: RecommendRequest): boolean {
    return (data.story?.trim().length ?? 0) >= SPECIFIC_REQUEST_MIN_LENGTH;
  }

  /** سطح محدودیت محتوا: سن کاربر و حضور خانواده هر دو سخت‌گیری می‌آورند */
  private static resolveContentTier(data: RecommendRequest): ContentTier {
    if (data.age < 6) return "toddler";
    if (data.age < 12) return "kids";
    if (data.age < 16) return "preteen";
    if (data.age < 18) return "teen";
    // بزرگسالی که با خانواده تماشا می‌کند هم باید محتوای گروهی بگیرد
    if (data.company === "family") return "teen";
    return "adult";
  }

  /** قید سنی سخت که مدل اجازه عبور از آن را ندارد */
  private static buildContentConstraint(data: RecommendRequest): string {
    const tier = this.resolveContentTier(data);
    const familyNote =
      data.company === "family" && data.age >= 18
        ? " The viewer is an adult but is watching with family, so children may be present."
        : "";

    switch (tier) {
      case "toddler":
        return `HARD CONTENT LIMIT — viewer is ${data.age}: ONLY G-rated animation and preschool-friendly films. Absolutely no horror, violence, romance, death themes, or frightening imagery.`;
      case "kids":
        return `HARD CONTENT LIMIT — viewer is ${data.age}: ONLY G/PG family films and animation. No horror, no gore, no sexual content, no strong profanity, no disturbing themes.${familyNote}`;
      case "preteen":
        return `HARD CONTENT LIMIT — viewer is ${data.age}: PG films only, mild PG-13 adventure at most. No horror, no graphic violence, no sexual content, no drug use.${familyNote}`;
      case "teen":
        return `HARD CONTENT LIMIT — viewer is ${data.age}: PG-13 at most. No R-rated films, no explicit sexual content, no graphic gore, no extreme violence.${familyNote}`;
      case "adult":
        return `Content rating: viewer is ${data.age} — any rating is acceptable, but avoid preschool/toddler cartoons unless explicitly requested.`;
    }
  }

  /**
   * Rank factors by weight so the AI receives an explicit priority order
   * instead of a flat list it has to guess between.
   */
  private static buildPriorityOrder(
    data: RecommendRequest,
    weights: AlgorithmWeights,
  ): string {
    const labels: Record<keyof AlgorithmWeights, string> = {
      story: "the written request",
      mood: `mood (${data.mood})`,
      age: `age-appropriateness (${data.age})`,
      company: `company (${data.company})`,
      watchTime: `watch time (${data.watchTime})`,
      weather: `weather (${data.weather})`,
      location: "location/culture",
    };

    const active = (Object.keys(weights) as Array<keyof AlgorithmWeights>)
      // وقتی متنی نوشته نشده، story نباید در اولویت‌ها ظاهر شود
      .filter((key) => key !== "story" || this.hasSpecificRequest(data))
      .sort((a, b) => weights[b] - weights[a]);

    return active.map((key, i) => `${i + 1}. ${labels[key]}`).join("\n");
  }

  /**
   * Build the final prompt. Everything the model sees must be consistent:
   * no contradictory instructions, no fabricated context.
   */
  private static buildEnhancedPrompt(
    data: RecommendRequest,
    insights: string[],
    weights: AlgorithmWeights,
  ): string {
    const location =
      data.locationLabel ||
      [data.city, data.country].filter(Boolean).join(", ") ||
      "unspecified";

    const isFarsi = data.locale === "fa";

    const reasonInstruction = isFarsi
      ? "یک جمله کوتاه به زبان فارسی که توضیح می‌دهد چرا این فیلم مناسب است"
      : "One short sentence in English explaining why this fits";

    const seenSection =
      data.seenTitles && data.seenTitles.length > 0
        ? `\n- Already seen (NEVER suggest these): ${data.seenTitles.join(", ")}`
        : "";

    const storyHint = data.story?.trim();
    const hasRequest = this.hasSpecificRequest(data);

    // متن کاربر برنده تضاد است؛ این تنها قاعده حاکم بر تعارض mood/story است
    const conflictRule = hasRequest
      ? `PRIORITY RULE: The viewer's written request is the strongest signal. If it conflicts with the selected mood (${data.mood}), follow the written request and treat the mood only as a tone hint. Never ignore the written request.`
      : `PRIORITY RULE: No written request was given, so the selected mood (${data.mood}) is the primary driver. Do not invent preferences the viewer never expressed.`;

    const insightSection =
      insights.length > 0
        ? insights.map((line) => `- ${line}`).join("\n")
        : "- No special factor interactions detected; treat the profile at face value.";

    return `You are a movie recommendation expert. Suggest between 1 and 5 movies for this viewer.

Viewer profile:
- Gender: ${data.gender}
- Age: ${data.age}
- Location: ${location}
- Selected mood: ${data.mood}
- Weather: ${data.weather}
- Watch time: ${data.watchTime}
- Watching with: ${data.company}
- Written request: ${storyHint || "(none)"}${seenSection}

${this.buildContentConstraint(data)}

${conflictRule}

Decision priority (highest first):
${this.buildPriorityOrder(data, weights)}

Contextual analysis:
${insightSection}

Rules:
- Every movie MUST be a real, released film. Never invent titles, years, or ratings.
- Report the film's true IMDb rating. Only suggest films rated 7.0 or higher, unless the written request is narrow (specific actor, director, or niche genre) — then 6.5 is the floor.
- Match the decision priority above. A film that satisfies a higher priority beats one that only satisfies lower ones.
- Do NOT pad the list. Return 1-4 films if only that many genuinely fit. Quality over quantity.
- Do not repeat the same film twice.
- Return ONLY valid JSON. No markdown, no commentary, no explanation outside the JSON.
- The "reason" field must be: ${reasonInstruction}
- The "reason" must reference the viewer's actual inputs, not generic praise.

Schema:
{
  "movies": [
    {
      "title": "Exact English title",
      "year": 2010,
      "imdbRating": 8.1,
      "reason": "..."
    }
  ]
}`;
  }

  /**
   * Main algorithm execution
   */
  static async execute(data: RecommendRequest): Promise<AiMovie[]> {
    const apiKey = process.env.NARAROUTER_API_KEY;
    const model = process.env.NARAROUTER_MODEL || "tencent-hy3";

    if (!apiKey) {
      throw new NaraRouterError("NARAROUTER_API_KEY is not configured", 500);
    }

    const { weights, insights } = this.evaluate(data);
    const enhancedPrompt = this.buildEnhancedPrompt(data, insights, weights);

    const run = async (): Promise<AiMovie[]> => {
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
                "You recommend real, existing movies. Always respond with valid JSON only. Do not wrap the JSON in markdown. Never invent films or ratings.",
            },
            { role: "user", content: enhancedPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw mapHttpError(response.status, errorText);
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Empty NaraRouter response");
      }

      const movies = normalizeMovies(extractJson(content));

      // فیلم‌های دیده‌شده باید حتی اگر مدل نادیده گرفت، حذف شوند
      const seenSet = new Set(
        (data.seenTitles ?? []).map((t) => t.trim().toLowerCase()),
      );
      const unseen = movies.filter(
        (movie) => !seenSet.has(movie.title.toLowerCase()),
      );

      if (unseen.length === 0) {
        throw new Error("NaraRouter returned only already-seen movies");
      }

      return unseen;
    };

    try {
      return await run();
    } catch (firstError) {
      if (firstError instanceof NaraRouterError && firstError.status < 500) {
        throw firstError;
      }

      try {
        return await run();
      } catch {
        throw firstError;
      }
    }
  }
}
