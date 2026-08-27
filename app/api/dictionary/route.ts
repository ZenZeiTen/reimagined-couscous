import { NextRequest, NextResponse } from "next/server";

const DICT_API = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const UPSTREAM_TIMEOUT_MS = 10_000;

export async function GET(request: NextRequest) {
  const word = request.nextUrl.searchParams.get("word")?.trim().toLowerCase();
  if (!word || word.length > 64) {
    return NextResponse.json(
      { error: "Missing or invalid 'word' parameter" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(DICT_API + encodeURIComponent(word), {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate: 86_400 },
    });
    if (res.status === 404) {
      return NextResponse.json({ notFound: true, word }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Dictionary upstream error (${res.status})` },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Dictionary upstream unreachable" },
      { status: 502 }
    );
  }
}
