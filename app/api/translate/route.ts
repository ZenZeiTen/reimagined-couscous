import { NextRequest, NextResponse } from "next/server";

const TRANSLATE_API = "https://api.mymemory.translated.net/get";
const UPSTREAM_TIMEOUT_MS = 10_000;
const LANGS = new Set(["en", "id"]);

/** Decode the HTML entities MyMemory sometimes embeds and collapse whitespace. */
function clean(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!q || q.length > 128 || !LANGS.has(from) || !LANGS.has(to) || from === to) {
    return NextResponse.json(
      { error: "Invalid 'q', 'from', or 'to' parameter" },
      { status: 400 }
    );
  }

  try {
    const url = `${TRANSLATE_API}?q=${encodeURIComponent(q)}&langpair=${from}|${to}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Translation upstream error (${res.status})` },
        { status: 502 }
      );
    }
    const data = await res.json();

    // Community translation memories can surface junk as the top match, so
    // collect every candidate (primary + matches) for the client to try.
    const seen = new Set<string>();
    const candidates: string[] = [];
    const push = (raw: unknown) => {
      const t = clean(String(raw ?? ""));
      const key = t.toLowerCase();
      if (t && key !== q.toLowerCase() && !seen.has(key)) {
        seen.add(key);
        candidates.push(t);
      }
    };
    push(data?.responseData?.translatedText);
    const matches = Array.isArray(data?.matches) ? data.matches : [];
    for (const m of [...matches].sort(
      (a, b) => (Number(b?.match) || 0) - (Number(a?.match) || 0)
    )) {
      push(m?.translation);
    }

    if (candidates.length === 0) {
      return NextResponse.json({ notFound: true, q }, { status: 404 });
    }
    return NextResponse.json(
      { translatedText: candidates[0], candidates: candidates.slice(0, 5) },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Translation upstream unreachable" },
      { status: 502 }
    );
  }
}
