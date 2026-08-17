import type { AiMovie, SuggestedMovie } from "./types.ts";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w780";

// TMDB genre ID → human-readable name mapping
export const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

interface TmdbSearchResult {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
}

interface TmdbSearchResponse {
  results?: TmdbSearchResult[];
}

interface TmdbMovieDetails {
  runtime?: number | null;
  imdb_id?: string | null;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    crew?: Array<{ job?: string; name?: string }>;
  };
}

/** نرمال‌سازی عنوان برای مقایسه: حذف علائم و حروف اضافه */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** آیا عنوان نتیجه TMDB با عنوان پیشنهادی AI یکی است؟ */
function titleMatches(candidate: TmdbSearchResult, movie: AiMovie): boolean {
  const wanted = normalizeTitle(movie.title);
  if (!wanted) return false;
  return [candidate.title, candidate.original_title]
    .filter((t): t is string => Boolean(t))
    .some((t) => {
      const found = normalizeTitle(t);
      return found === wanted || found.includes(wanted) || wanted.includes(found);
    });
}

function scoreMatch(candidate: TmdbSearchResult, movie: AiMovie): number {
  const candidateYear = candidate.release_date
    ? Number(candidate.release_date.slice(0, 4))
    : null;
  let score = 0;

  // تطبیق عنوان مهم‌ترین سیگنال است
  if (titleMatches(candidate, movie)) score += 20;

  if (candidateYear === movie.year) score += 10;
  else if (candidateYear && Math.abs(candidateYear - movie.year) <= 1) score += 5;
  else if (candidateYear && Math.abs(candidateYear - movie.year) > 5) score -= 5;

  if (candidate.poster_path) score += 2;
  if ((candidate.vote_average ?? 0) > 0) score += 1;
  // فیلم‌های شناخته‌شده بر نتایج بی‌نام‌ونشان مقدم‌اند
  if ((candidate.vote_count ?? 0) >= 100) score += 3;

  return score;
}

async function searchMovie(
  movie: AiMovie,
  apiKey: string,
  language: string,
): Promise<TmdbSearchResult | null> {
  const url = new URL(`${TMDB_BASE}/search/movie`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", movie.title);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("year", String(movie.year));
  url.searchParams.set("language", language);

  const response = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as TmdbSearchResponse;
  const results = data.results ?? [];
  if (results.length === 0) {
    // Retry without year constraint
    const fallbackUrl = new URL(`${TMDB_BASE}/search/movie`);
    fallbackUrl.searchParams.set("api_key", apiKey);
    fallbackUrl.searchParams.set("query", movie.title);
    fallbackUrl.searchParams.set("include_adult", "false");
    fallbackUrl.searchParams.set("language", language);

    const fallbackResponse = await fetch(fallbackUrl.toString(), {
      next: { revalidate: 3600 },
    });
    if (!fallbackResponse.ok) return null;
    const fallbackData = (await fallbackResponse.json()) as TmdbSearchResponse;
    const fallbackResults = fallbackData.results ?? [];
    if (fallbackResults.length === 0) return null;
    return [...fallbackResults].sort(
      (a, b) => scoreMatch(b, movie) - scoreMatch(a, movie),
    )[0];
  }

  return [...results].sort(
    (a, b) => scoreMatch(b, movie) - scoreMatch(a, movie),
  )[0];
}

interface TmdbDetails {
  director: string | null;
  runtime: number | null;
  imdbId: string | null;
  genres: string[];
}

async function fetchDetails(
  tmdbId: number,
  apiKey: string,
): Promise<TmdbDetails> {
  const url = new URL(`${TMDB_BASE}/movie/${tmdbId}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("append_to_response", "credits");

  const response = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!response.ok) return { director: null, runtime: null, imdbId: null, genres: [] };

  const data = (await response.json()) as TmdbMovieDetails;
  const director =
    data.credits?.crew?.find((member) => member.job === "Director")?.name ??
    null;
  const runtime =
    typeof data.runtime === "number" && data.runtime > 0 ? data.runtime : null;
  const imdbId =
    typeof data.imdb_id === "string" && data.imdb_id ? data.imdb_id : null;
  const genres = (data.genres ?? []).map((g) => g.name);
  return { director, runtime, imdbId, genres };
}

export async function enrichMovies(
  movies: AiMovie[],
  locale: "en" | "fa" = "en",
): Promise<SuggestedMovie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  // locale param kept for future use (e.g. reason language via nararouter)
  void locale;

  const enriched = await Promise.all(
    movies.map(async (movie): Promise<SuggestedMovie | null> => {
      try {
        // Always fetch English for poster + base data
        const enMatch = await searchMovie(movie, apiKey, "en-US");

        // فیلمی که در TMDB پیدا نشود یا عنوانش نخواند، توهم مدل است
        if (!enMatch || !titleMatches(enMatch, movie)) {
          return null;
        }

        // Fetch Persian overview, runtime, and genres in parallel
        const [faMatch, details] = await Promise.all([
          searchMovie(movie, apiKey, "fa-IR"),
          fetchDetails(enMatch.id, apiKey),
        ]);
        const overviewFa = faMatch?.overview || null;

        // Prefer genres from detailed endpoint; fall back to search result genre_ids
        const genres =
          details.genres.length > 0
            ? details.genres
            : (enMatch.genre_ids ?? []).map(
                (id) => TMDB_GENRE_MAP[id] ?? String(id),
              );

        const tmdbYear = enMatch.release_date
          ? Number(enMatch.release_date.slice(0, 4))
          : null;
        const tmdbRating =
          typeof enMatch.vote_average === "number" && enMatch.vote_average > 0
            ? enMatch.vote_average
            : null;

        return {
          ...movie,
          // سال و ریتینگ واقعی TMDB بر عدد اعلامی مدل مقدم است
          year: tmdbYear ?? movie.year,
          imdbRating: tmdbRating ?? movie.imdbRating,
          tmdbId: enMatch.id,
          imdbId: details.imdbId,
          posterUrl: enMatch.poster_path
            ? `${TMDB_IMAGE_BASE}${enMatch.poster_path}`
            : null,
          overview: enMatch.overview || null,
          overviewFa,
          director: details.director,
          runtime: details.runtime,
          voteAverage: tmdbRating,
          genres,
        } satisfies SuggestedMovie;
      } catch {
        return null;
      }
    }),
  );

  return enriched.filter((movie): movie is SuggestedMovie => movie !== null);
}
