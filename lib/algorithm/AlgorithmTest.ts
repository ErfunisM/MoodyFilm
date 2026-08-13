import type { RecommendRequest } from "../types.ts";
import { RecommendationAlgorithm } from "./RecommendationAlgorithm.ts";

/**
 * تست‌های واقعی الگوریتم پیشنهاد فیلم.
 * هر تست یک assert دارد؛ در صورت شکست، exit code غیرصفر برمی‌گردد.
 * اجرا: node --experimental-strip-types lib/algorithm/AlgorithmTest.ts
 */

function base(over: Partial<RecommendRequest>): RecommendRequest {
  return {
    gender: "male",
    age: 30,
    country: "Iran",
    city: "Tehran",
    locationLabel: "Tehran, Iran",
    weather: "sunny",
    mood: "happy",
    story: "",
    watchTime: "night",
    company: "alone",
    locale: "en",
    seenTitles: [],
    ...over,
  };
}

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}`);
  }
}

console.log("=== RecommendationAlgorithm tests ===\n");

// ۱) هیچ insight ساختگی آب‌وهوا وقتی قاعده‌ی آب‌وهوایی فعال نیست
{
  const insights = RecommendationAlgorithm.getInsights(
    base({ weather: "sunny", company: "partner", mood: "romantic" }),
  );
  check(
    "no fabricated weather insight (sunny+romantic)",
    !insights.some((i) => i.toLowerCase().includes("weather")),
  );
  check(
    "partner+romantic insight present",
    insights.some((i) => i.toLowerCase().includes("partner")),
  );
}

// ۲) هر insight باید از یک قاعده‌ی واقعاً فعال بیاید (تعداد <= تعداد قواعد)
{
  const insights = RecommendationAlgorithm.getInsights(
    base({ weather: "cloudy", company: "alone", mood: "thrill" }),
  );
  check(
    "cloudy weather produces NO weather sentence",
    !insights.some((i) => i.toLowerCase().includes("cloudy")),
  );
}

// ۳) متن فقط فاصله نباید «درخواست خاص» شمرده شود
{
  const prompt = RecommendationAlgorithm.getPrompt(base({ story: "           " }));
  check(
    "whitespace-only story => no written request",
    prompt.includes("Written request: (none)") &&
      prompt.includes("No written request was given"),
  );
}

// ۴) متن کوتاه واقعی باید «درخواست خاص» شمرده شود
{
  const prompt = RecommendationAlgorithm.getPrompt(base({ story: "anime" }));
  check(
    "short real story counts as request",
    prompt.includes("written request is the strongest signal"),
  );
}

// ۵) تضاد متن و mood: متن برنده است و اول اولویت‌ها می‌آید
{
  const prompt = RecommendationAlgorithm.getPrompt(
    base({ mood: "thrill", story: "comedy please, something light" }),
  );
  check(
    "story wins over mood in priority order",
    prompt.includes("1. the written request"),
  );
}

// ۶) کودک ۱۰ ساله: قید سخت محتوا و سن به عنوان اولویت اول
{
  const prompt = RecommendationAlgorithm.getPrompt(
    base({ age: 10, mood: "thrill" }),
  );
  check("age 10 => hard content limit", prompt.includes("HARD CONTENT LIMIT"));
  check(
    "age 10 => age is top priority",
    prompt.includes("1. age-appropriateness"),
  );
}

// ۷) بزرگسال با خانواده: باید محدودیت خانوادگی بگیرد
{
  const prompt = RecommendationAlgorithm.getPrompt(
    base({ age: 35, company: "family", mood: "thrill" }),
  );
  check(
    "adult+family => family safety note",
    prompt.includes("watching with family"),
  );
}

// ۸) بزرگسال تنها: هیچ قید سختی نباید باشد
{
  const prompt = RecommendationAlgorithm.getPrompt(base({ age: 30 }));
  check(
    "adult alone => no hard content limit",
    !prompt.includes("HARD CONTENT LIMIT"),
  );
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
