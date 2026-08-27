"use client";

import { useLocale } from "@/components/LocaleProvider";

interface SummaryModalProps {
  summary: string;
  storyMeaningful: boolean;
  onShow: () => void;
}

export function SummaryModal({
  summary,
  storyMeaningful,
  onShow,
}: SummaryModalProps) {
  const { t, dir } = useLocale();

  return (
    <div className="summary-modal-overlay" dir={dir} role="dialog" aria-modal="true">
      <div
        className={`summary-modal-card ${storyMeaningful ? "" : "summary-modal-card--warn"}`}
      >
        <p className="summary-modal-eyebrow">{t.summaryTitle}</p>
        <p className="summary-modal-text">{summary}</p>
        {!storyMeaningful ? (
          <p className="summary-modal-hint">{t.summaryGibberishHint}</p>
        ) : null}
        <button
          type="button"
          className="summary-modal-btn primary-btn"
          onClick={onShow}
        >
          {t.summaryShow}
        </button>
      </div>
    </div>
  );
}
