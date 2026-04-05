export interface LensMatch {
  title: string;
  link: string;
  source: string;
  thumbnail: string;
  price?: { value: number; currency: string; raw: string };
}

export async function searchByImage(imageUrl: string): Promise<LensMatch[]> {
  const params = new URLSearchParams({
    engine: "google_lens",
    url: imageUrl,
    search_type: "products",
    api_key: process.env.SEARCHAPI_KEY!,
  });

  const res = await fetch(`https://www.searchapi.io/api/v1/search?${params}`);
  const data = await res.json();
  return (data.visual_matches ?? []).slice(0, 10) as LensMatch[];
}

export function extractSearchTerms(matches: LensMatch[]): string[] {
  return matches
    .slice(0, 3)
    .map((m) => m.title)
    .filter(Boolean);
}

export function findBrandPrice(
  matches: LensMatch[]
): { price: string; source: string } | null {
  const priced = matches.filter((m) => m.price?.value);
  if (!priced.length) return null;
  const highest = priced.sort((a, b) => b.price!.value - a.price!.value)[0];
  return { price: highest.price!.raw, source: highest.source };
}
