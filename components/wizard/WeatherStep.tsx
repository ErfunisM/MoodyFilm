"use client";

import { useLocale } from "@/components/LocaleProvider";
import type { Weather, WizardData } from "@/lib/types";

interface WeatherStepProps {
  data: WizardData;
  onSelect: (weather: Weather) => void;
}

export function WeatherStep({ data, onSelect }: WeatherStepProps) {
  const { t } = useLocale();

  const weathers: { value: Weather; label: string }[] = [
    { value: "sunny", label: t.sunny },
    { value: "cloudy", label: t.cloudy },
    { value: "rainy", label: t.rainy },
    { value: "snowy", label: t.snowy },
  ];

  return (
    <section className="wizard-step">
      <p className="step-sub">{t.weatherSub}</p>
      <div className="mood-grid weather-grid">
        {weathers.map((weather) => (
          <button
            key={weather.value}
            type="button"
            className={`mood-btn ${data.weather === weather.value ? "active" : ""}`}
            onClick={() => onSelect(weather.value)}
            aria-pressed={data.weather === weather.value}
          >
            <span
              className={`mood-emoji weather-icon weather-icon--${weather.value}`}
              aria-hidden
            />
            <span className="mood-label">{weather.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
