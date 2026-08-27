"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LocaleToggler } from "@/components/LocaleToggler";
import { useLocale } from "@/components/LocaleProvider";
import "./managment.css";

/** لینک‌های دانلود را بعداً اینجا بگذارید */
const DOWNLOAD_WINDOWS_URL = "#";
const DOWNLOAD_MAC_URL = "#";

const SLIDES = [
  "/Management/1.png",
  "/Management/2.png",
  "/Management/3.png",
  "/Management/4.png",
  "/Management/5.png",
] as const;

const copy = {
  fa: {
    navIntro: "معرفی",
    navFeatures: "ویژگی‌ها",
    navDetails: "توضیحات",
    download: "دانلود کنید",
    downloadTitle: "انتخاب سیستم‌عامل",
    downloadWindows: "ویندوز",
    downloadMac: "مک",
    close: "بستن",
    heroTitle: "آرشیو فیلم و سریال خود را بسازید",
    heroText:
      "تجربه متمرکز برای عاشقان فیلم و سریال\nفیلم‌ها و سریال‌های محلی خود را سازماندهی، جستجو و تماشا کنید",
    featuresTitle: "ویژگی‌های برنامه",
    features: [
      {
        icon: "auto_awesome",
        tone: "amber",
        title: "متادیتای خودکار",
        text: "دسته بندی فوق العاده فیلم و سریال تنها با یک کلیک",
      },
      {
        icon: "manage_search",
        tone: "cream",
        title: "جستجوی سریع",
        text: "بر اساس عنوان، ژانر و وضعیت تماشا به شکل فیلم و سریال خود را پیدا کنید",
      },
      {
        icon: "high_quality",
        tone: "deep",
        title: "اجرای سریع فیلم",
        text: "اجرا مستقیم فیلم از روی محل فایل",
      },
    ],
    detailsTitle: "رابطه کاربری مدرن و ساده",
    detailsText:
      "رابطه کاربری به نحوی طراحی شده است که به راحتی فیلم و سریال‌های خود را به شکل مرتب دسته‌بندی شده در اختیار داشته باشید",
    checks: [
      "طراحی ساده به دور از تنظیمات پیچیده",
      "سازماندهی هوشمند فیلم و سریال",
      "واچ‌لیست و مرور آرشیو محلی",
    ],
    footer: "ساخته‌شده توسط ما",
    backToTop: "بازگشت به بالا",
  },
  en: {
    navIntro: "Intro",
    navFeatures: "Features",
    navDetails: "Details",
    download: "Download",
    downloadTitle: "Choose your platform",
    downloadWindows: "Windows",
    downloadMac: "Mac",
    close: "Close",
    heroTitle: "Build your movie & series archive",
    heroText:
      "A focused experience for movie and series lovers\nOrganize, search, and watch your local films and shows",
    featuresTitle: "App features",
    features: [
      {
        icon: "auto_awesome",
        tone: "amber",
        title: "Automatic metadata",
        text: "Outstanding movie and series sorting with one click",
      },
      {
        icon: "manage_search",
        tone: "cream",
        title: "Fast search",
        text: "Find your movies and series by title, genre, and watch status",
      },
      {
        icon: "high_quality",
        tone: "deep",
        title: "Fast playback",
        text: "Play movies directly from their file location",
      },
    ],
    detailsTitle: "Modern and simple UI",
    detailsText:
      "The interface is designed so you can keep your movies and series neatly categorized and easy to reach",
    checks: [
      "Simple design without complex settings",
      "Smart organization for movies and series",
      "Watchlist and local archive browsing",
    ],
    footer: "Made by us",
    backToTop: "Back to top",
  },
} as const;

function MaterialIcon({ name }: { name: string }) {
  return (
    <span className="material-symbols-outlined" aria-hidden>
      {name}
    </span>
  );
}

export function ManagmentLanding() {
  const { locale, dir } = useLocale();
  const t = copy[locale];
  const [slide, setSlide] = useState(0);
  const [showDownload, setShowDownload] = useState(false);
  const [showTopBtn, setShowTopBtn] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((i) => (i + 1) % SLIDES.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowTopBtn(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!showDownload) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setShowDownload(false);
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [showDownload]);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function scrollToSection(
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) {
    event.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <div className="ca-page" dir={dir} data-locale={locale}>
      <nav className="ca-nav" ref={navRef}>
        <div className="ca-nav__inner ca-nav__inner--no-cta">
          <Link href="/managment" className="ca-brand" aria-label="MoodyFilm">
            <Image
              src="/Management/moodyfilm-logo.png"
              alt="MoodyFilm"
              width={360}
              height={100}
              className="ca-brand__logo"
              priority
            />
          </Link>
          <ul className="ca-nav__links">
            <li>
              <a className="is-active" href="#intro" onClick={(e) => scrollToSection(e, "intro")}>
                {t.navIntro}
              </a>
            </li>
            <li>
              <a href="#features" onClick={(e) => scrollToSection(e, "features")}>
                {t.navFeatures}
              </a>
            </li>
            <li>
              <a href="#details" onClick={(e) => scrollToSection(e, "details")}>
                {t.navDetails}
              </a>
            </li>
          </ul>
          <div className="ca-nav__locale">
            <LocaleToggler />
          </div>
        </div>
      </nav>

      <main className="ca-main">
        <section className="ca-hero" id="intro">
          <div className="ca-hero__bg" aria-hidden>
            <Image
              src="/Management/background.png"
              alt=""
              fill
              priority
              sizes="100vw"
              className="ca-hero__img"
            />
            <div className="ca-hero__veil ca-hero__veil--y" />
            <div className="ca-hero__veil ca-hero__veil--x" />
          </div>
          <div className="ca-hero__content">
            <h1>{t.heroTitle}</h1>
            <p className="ca-hero__text">
              {t.heroText.split("\n").map((line) => (
                <span key={line}>{line}</span>
              ))}
            </p>
            <div className="ca-hero__actions">
              <button
                type="button"
                className="ca-btn ca-btn--primary ca-btn--lg"
                onClick={() => setShowDownload(true)}
              >
                {t.download}
              </button>
            </div>
          </div>
        </section>

        <section className="ca-features" id="features">
          <div className="ca-features__inner">
            <h2 className="ca-section-title">{t.featuresTitle}</h2>
            <div className="ca-features__grid">
              {t.features.map((feature) => (
                <article
                  key={feature.title}
                  className={`ca-glass ca-feature ca-feature--${feature.tone}`}
                >
                  <div className="ca-feature__glow" aria-hidden />
                  <MaterialIcon name={feature.icon} />
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="ca-details" id="details">
          <div className="ca-details__inner">
            <div className="ca-details__copy">
              <h2>{t.detailsTitle}</h2>
              <p>{t.detailsText}</p>
              <ul>
                {t.checks.map((item) => (
                  <li key={item}>
                    <MaterialIcon name="check_circle" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ca-details__visual">
              <div className="ca-monitor" aria-live="polite">
                {SLIDES.map((src, index) => (
                  <Image
                    key={src}
                    src={src}
                    alt="MoodyFilm interface"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className={`ca-monitor__img ${index === slide ? "is-on" : ""}`}
                    priority={index === 0}
                  />
                ))}
                <div className="ca-monitor__marks" aria-hidden>
                  {SLIDES.map((src, index) => (
                    <i key={src} className={index === slide ? "is-on" : undefined} />
                  ))}
                </div>
              </div>
              <div className="ca-details__blob" aria-hidden />
            </div>
          </div>
        </section>
      </main>

      <footer className="ca-footer">
        <p>
          {t.footer} <span aria-hidden>❤</span>
        </p>
      </footer>

      {showDownload ? (
        <div
          className="ca-modal-overlay"
          onClick={() => setShowDownload(false)}
          role="presentation"
        >
          <div
            className="ca-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t.downloadTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="ca-modal__close"
              onClick={() => setShowDownload(false)}
              aria-label={t.close}
            >
              <MaterialIcon name="close" />
            </button>
            <h2>{t.downloadTitle}</h2>
            <div className="ca-modal__actions">
              <a className="ca-btn ca-btn--primary ca-btn--lg" href={DOWNLOAD_WINDOWS_URL}>
                {t.downloadWindows}
              </a>
              <a className="ca-btn ca-btn--glass ca-btn--lg" href={DOWNLOAD_MAC_URL}>
                {t.downloadMac}
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {showTopBtn ? (
        <button
          type="button"
          className="ca-top-btn"
          onClick={scrollToTop}
          aria-label={t.backToTop}
          title={t.backToTop}
        >
          <MaterialIcon name="keyboard_arrow_up" />
        </button>
      ) : null}
    </div>
  );
}
