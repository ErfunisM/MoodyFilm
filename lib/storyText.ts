const MIN_STORY_LENGTH = 5;

/** آیا کاربر حداقل متنی نوشته که ارسال مجاز باشد؟ */
export function isStoryFilled(story: string): boolean {
  return story.trim().length >= MIN_STORY_LENGTH;
}

/**
 * تشخیص سریع سمت کلاینت/سرور برای متن بی‌معنی
 * (حروف تصادفی، تکرار، بدون فاصله/واکه، و غیره).
 * قضاوت نهایی در generateProfileSummary با مدل انجام می‌شود.
 */
export function looksLikeGibberish(story: string): boolean {
  const text = story.trim();
  if (text.length < MIN_STORY_LENGTH) return true;

  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4) return true;

  const unique = new Set(letters.toLowerCase());
  if (unique.size <= 2 && letters.length >= 6) return true;

  // یک کاراکتر تکرارشده: aaaaa / ااااا
  if (/^(.)\1+$/u.test(letters)) return true;

  const hasPersian = /[\u0600-\u06FF]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  const words = text.split(/\s+/).filter(Boolean);

  if (hasLatin && !hasPersian) {
    const vowelRatio =
      (text.match(/[aeiouyAEIOUY]/g) ?? []).length / Math.max(letters.length, 1);
    if (vowelRatio < 0.12 && letters.length >= 8) return true;
    // رشتهٔ طولانی بدون فاصله معمولاً نویز کیبورد است
    if (words.length === 1 && letters.length >= 12) return true;
  }

  if (hasPersian) {
    // متن فارسی واقعی معمولاً حداقل یک فاصله یا چند کلمه کوتاه دارد
    if (words.length === 1 && letters.length >= 14) return true;
  }

  // اگر نه فارسی و نه لاتین معنادار
  if (!hasPersian && !hasLatin) return true;

  return false;
}
