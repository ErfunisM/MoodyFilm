"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useLocale } from "@/components/LocaleProvider";
import { formatMessage } from "@/lib/i18n/dictionaries";
import { addWatchedMovie, isWatched } from "@/lib/watchedMovies";
import type { SuggestedMovie } from "@/lib/types";

interface MovieCardProps {
  movie: SuggestedMovie;
  index: number;
  total: number;
  onNext: () => void;
  onRestart: () => void;
  onMarkedWatched?: (movie: SuggestedMovie) => void;
}

export function MovieCard({
  movie,
  index,
  total,
  onNext,
  onRestart,
  onMarkedWatched,
}: MovieCardProps) {
  const { t, locale } = useLocale();
  const isLast = index >= total - 1;
  const [watched, setWatched] = useState(() => isWatched(movie.title));
  const [showDirectorName, setShowDirectorName] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);

  // Sync watched state when movie changes
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setWatched(isWatched(movie.title));
      setShowDirectorName(false);
      setShowTrailer(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [movie.director, movie.title]);

  // بستن پاپ‌آپ تریلر با کلید Escape و قفل اسکرول صفحه هنگام باز بودن
  useEffect(() => {
    if (!showTrailer) {
      return;
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowTrailer(false);
      }
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [showTrailer]);

  const overview =
    locale === "fa" ? (movie.overviewFa || movie.overview) : movie.overview;
  const runtimeText = movie.runtime
    ? formatMessage(t.runtimeValue, { minutes: movie.runtime })
    : t.unknownValue;
  const genres = movie.genres.slice(0, 2);
  const directorText = movie.director || t.unknownValue;

  function handleMarkWatched() {
    addWatchedMovie(movie);
    setWatched(true);
    onMarkedWatched?.(movie);
  }

  return (
    <section className="movie-reveal">
      <div className="movie-poster-wrap">
        {movie.posterUrl ? (
          <Image
            src={movie.posterUrl}
            alt={formatMessage(t.moviePosterAlt, { title: movie.title })}
            fill
            className="movie-poster"
            sizes="(max-width: 768px) 100vw, 480px"
            priority
          />
        ) : (
          <div className="poster-fallback">
            <span>{movie.title}</span>
          </div>
        )}
        {movie.imdbRating ? (
          <div
            className="imdb-badge"
            dir="ltr"
            aria-label={`IMDb ${movie.imdbRating.toFixed(1)}`}
          >
            <span className="imdb-badge__score">★ {movie.imdbRating.toFixed(1)}</span>
            <span className="imdb-badge__label">IMDb</span>
          </div>
        ) : null}
        <button
          type="button"
          className={`watched-btn watched-btn--poster ${watched ? "watched-btn--done" : ""}`}
          onClick={handleMarkWatched}
          disabled={watched}
        >
          {watched ? t.alreadyWatched : t.markWatched}
        </button>
        <div className="poster-veil" />
        <button
          type="button"
          className="poster-play"
          onClick={() => setShowTrailer(true)}
          aria-label={t.playTrailer}
          title={t.playTrailer}
        >
          <span className="poster-play__icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      </div>

      <div className="movie-copy">
        <p className="movie-count">
          {formatMessage(t.suggestionOf, {
            current: index + 1,
            total,
          })}
        </p>
        <div className="movie-title-row">
          <h2 className="movie-title" dir="ltr">
            {movie.title}
          </h2>
        </div>
        <p className="movie-meta movie-meta--mobile-hide" dir="ltr">
          {movie.imdbRating ? <span>IMDb {movie.imdbRating.toFixed(1)}</span> : null}
          <span>{movie.imdbRating ? " · " : ""}{movie.year}</span>
          {movie.runtime ? <span> · {movie.runtime} min</span> : null}
          {genres.length > 0 ? <span> · {genres.join(", ")}</span> : null}
        </p>
        {overview ? (
          <p className="movie-overview">{overview}</p>
        ) : null}

        <div className="movie-info-grid">
          <div className="movie-info-item movie-info-item--director">
            <span className="movie-info-icon" aria-hidden>▱</span>
            <span className="movie-info-label">{t.director}</span>
            <button
              type="button"
              className="movie-info-value movie-director-toggle"
              dir="ltr"
              aria-expanded={showDirectorName}
              onClick={() => setShowDirectorName((visible) => !visible)}
            >
              {directorText}
            </button>
            {showDirectorName ? (
              <button
                type="button"
                className="director-name-popover"
                dir="ltr"
                onClick={() => setShowDirectorName(false)}
              >
                {directorText}
              </button>
            ) : null}
          </div>
          <div className="movie-info-item">
            <span className="movie-info-icon" aria-hidden>◷</span>
            <span className="movie-info-label">{t.runtime}</span>
            <strong>{runtimeText}</strong>
          </div>
          <div className="movie-info-item">
            <span className="movie-info-icon" aria-hidden>▦</span>
            <span className="movie-info-label">{t.releaseYear}</span>
            <strong dir="ltr">{movie.year}</strong>
          </div>
        </div>

        {genres.length > 0 ? (
          <div className="movie-genre-list">
            {genres.map((genre) => (
              <span className="movie-genre-chip" key={genre}>{genre}</span>
            ))}
          </div>
        ) : null}

        <div className="step-actions">
          <button type="button" className="ghost-btn" onClick={onRestart}>
            {t.startOver}
          </button>
          {!isLast ? (
            <button type="button" className="primary-btn" onClick={onNext}>
              {t.nextMovie}
            </button>
          ) : (
            <button type="button" className="primary-btn" onClick={onRestart}>
              {t.findNewPicks}
            </button>
          )}
        </div>
      </div>

      {showTrailer ? (
        <div
          className="trailer-overlay"
          onClick={() => setShowTrailer(false)}
        >
          <div
            className="trailer-modal"
            role="dialog"
            aria-modal="true"
            aria-label={movie.title}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="trailer-close"
              onClick={() => setShowTrailer(false)}
              aria-label={t.closeTrailer}
              title={t.closeTrailer}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="trailer-frame">
              <iframe
                title={movie.title}
                src={movie.tmdbId ? `https://player.videasy.to/movie/${movie.tmdbId}` : ""}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
