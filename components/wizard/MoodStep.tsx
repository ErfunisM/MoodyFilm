"use client";

import { useLocale } from "@/components/LocaleProvider";
import type { Mood, WizardData } from "@/lib/types";

interface MoodStepProps {
  data: WizardData;
  onSelect: (mood: Mood) => void;
}

export function MoodStep({ data, onSelect }: MoodStepProps) {
  const { t } = useLocale();

  const moods: { value: Mood; label: string }[] = [
    { value: "happy", label: t.happy },
    { value: "sad", label: t.sad },
    { value: "romantic", label: t.romantic },
    { value: "thrill", label: t.thrill },
    { value: "chill", label: t.chill },
  ];

  return (
    <section className="wizard-step">
      <p className="step-sub">{t.howFeelingSub}</p>
      <div className="mood-grid">
        {moods.map((mood) => (
          <button
            key={mood.value}
            type="button"
            className={`mood-btn ${data.mood === mood.value ? "active" : ""}`}
            onClick={() => onSelect(mood.value)}
            aria-pressed={data.mood === mood.value}
          >
            <span
              className={`mood-emoji mood-icon mood-icon--${mood.value}`}
              aria-hidden
            />
            <span className="mood-label">{mood.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
