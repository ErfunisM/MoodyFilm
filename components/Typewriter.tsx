"use client";

import { useEffect, useState } from "react";

// متن‌هایی که یک‌بار تایپ شده‌اند نگه‌داری می‌شوند تا افکت دوباره اجرا نشود
const typedTexts = new Set<string>();

type TypewriterProps = {
  text: string;
  className?: string;
  speed?: number;
};

export function Typewriter({ text, className, speed = 55 }: TypewriterProps) {
  const chars = Array.from(text);
  // اگر این متن قبلاً تایپ شده، از همان ابتدا کامل نمایش داده می‌شود
  const [count, setCount] = useState(() =>
    typedTexts.has(text) ? Array.from(text).length : 0,
  );

  useEffect(() => {
    if (typedTexts.has(text)) {
      return;
    }
    const letters = Array.from(text);
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      setCount(index);
      if (index >= letters.length) {
        clearInterval(timer);
        typedTexts.add(text);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  const done = count >= chars.length;

  return (
    <h1 className={className} aria-label={text}>
      <span aria-hidden>{chars.slice(0, count).join("")}</span>
      {!done ? <span className="tagline-caret" aria-hidden /> : null}
    </h1>
  );
}
