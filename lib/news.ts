import { cached } from "./cache";

export type NewsItem = { title: string; link: string; date: string; source: string };

const UA = { "User-Agent": "Mozilla/5.0 (StrixBot; market-research)" };

function parseRss(xml: string, fallbackSource: string): NewsItem[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
  const tag = (s: string, t: string) => {
    const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`));
    return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim() : "";
  };
  const decode = (s: string) =>
    s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return items.map((it) => {
    const raw = decode(tag(it, "title"));
    // Google News titles end with " - Source"
    const m = raw.match(/^(.*) - ([^-]+)$/);
    return {
      title: m ? m[1] : raw,
      link: tag(it, "link"),
      date: tag(it, "pubDate"),
      source: decode(tag(it, "source")) || (m ? m[2] : fallbackSource),
    };
  });
}

async function rss(url: string, source: string) {
  return cached(`rss:${url}`, 600_000, async () => {
    const res = await fetch(url, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`RSS ${res.status}`);
    return parseRss(await res.text(), source);
  });
}

/** Robinhood Chain news, optionally narrowed to a token/topic. */
export async function getNews(topic?: string, limit = 8): Promise<NewsItem[]> {
  const q = topic && !/robinhood/i.test(topic) ? `"Robinhood Chain" ${topic}` : `"Robinhood Chain"`;
  const items = await rss(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, "Google News");
  if (items.length >= 3 || !topic) return items.slice(0, limit);
  const base = await rss(`https://news.google.com/rss/search?q=${encodeURIComponent('"Robinhood Chain"')}&hl=en-US&gl=US&ceid=US:en`, "Google News");
  return [...items, ...base].slice(0, limit);
}
