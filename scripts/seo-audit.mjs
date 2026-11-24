import fs from "node:fs";

const errors = [];
function fail(message) { errors.push(message); }

function parseAttributes(tag) {
  const result = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

function getTags(html, name) {
  const pattern = new RegExp("<" + name + "\\b[^>]*>", "gi");
  return [...html.matchAll(pattern)].map(match => match[0]);
}

function getMeta(html, key, value) {
  return getTags(html, "meta")
    .map(parseAttributes)
    .filter(item => item[key] === value);
}

function getLinks(html, predicate) {
  return getTags(html, "link")
    .map(parseAttributes)
    .filter(predicate);
}

const BASE = "https://ivanivorontsov-sudo.github.io";
const pages = [
  {
    file: "../index.html",
    language: "ru",
    canonical: BASE + "/vizitka/",
    proofUrl: BASE + "/proofs/",
    researchUrl: BASE + "/aefh/v7.4/"
  },
  {
    file: "../en/index.html",
    language: "en",
    canonical: BASE + "/vizitka/en/",
    proofUrl: BASE + "/en/proofs/",
    researchUrl: BASE + "/en/research/aefh-v7-4/"
  }
];

for (const page of pages) {
  const html = fs.readFileSync(new URL(page.file, import.meta.url), "utf8");
  const titleMatches = [...html.matchAll(/<title\\b[^>]*>([\\s\\S]*?)<\\/title>/gi)];
  const title = titleMatches[0]?.[1]?.replace(/<[^>]*>/g, "").trim() ?? "";
  const descriptions = getMeta(html, "name", "description");
  const robots = getMeta(html, "name", "robots");
  const ogUrl = getMeta(html, "property", "og:url");
  const canonical = getLinks(html, item => (item.rel || "").toLowerCase().split(/\s+/).includes("canonical"));
  const htmlTag = getTags(html, "html")[0] ?? "";
  const language = parseAttributes(htmlTag).lang ?? "";
  const staticHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const h1Count = (staticHtml.match(/<h1\b/gi) || []).length;

  if (titleMatches.length !== 1 || !title) {
    fail(page.file + ": expected exactly one non-empty title");
  } else if (title.length < 15 || title.length > 80) {
    fail(page.file + ": title length " + title.length + " is outside 15..80");
  }

  if (descriptions.length !== 1 || !descriptions[0].content) {
    fail(page.file + ": expected exactly one non-empty meta description");
  } else if (descriptions[0].content.length < 70 || descriptions[0].content.length > 200) {
    fail(page.file + ": description length " + descriptions[0].content.length + " is outside 70..200");
  }

  if (language.toLowerCase() !== page.language) {
    fail(page.file + ": expected html lang=" + page.language + ", got " + language);
  }
  if (canonical.length !== 1 || canonical[0].href !== page.canonical) {
    fail(page.file + ": canonical URL must be " + page.canonical);
  }
  if (ogUrl.length !== 1 || ogUrl[0].content !== page.canonical) {
    fail(page.file + ": og:url must match canonical");
  }
  if (robots.length !== 1 || /noindex/i.test(robots[0].content || "")) {
    fail(page.file + ": robots must allow indexing");
  }

  for (const property of ["og:type", "og:title", "og:description", "og:image"]) {
    const matches = getMeta(html, "property", property);
    if (matches.length !== 1 || !matches[0].content) {
      fail(page.file + ": expected one non-empty " + property);
    }
  }
  for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    const matches = getMeta(html, "name", name);
    if (matches.length !== 1 || !matches[0].content) {
      fail(page.file + ": expected one non-empty " + name);
    }
  }

  if (h1Count !== 1) fail(page.file + ": expected exactly one static H1, found " + h1Count);
  if (!html.includes(page.proofUrl)) fail(page.file + ": missing matching Short Proofs link");
  if (!html.includes(page.researchUrl)) fail(page.file + ": missing current AEFH v7.4 link");

  const alternateLinks = getLinks(html, item =>
    (item.rel || "").toLowerCase().split(/\s+/).includes("alternate") && !!item.hreflang
  );
  const alternateMap = Object.fromEntries(
    alternateLinks.map(item => [item.hreflang.toLowerCase(), item.href])
  );
  const expectedAlternates = {
    ru: BASE + "/vizitka/",
    en: BASE + "/vizitka/en/",
    "x-default": BASE + "/vizitka/"
  };
  for (const [languageCode, url] of Object.entries(expectedAlternates)) {
    if (alternateMap[languageCode] !== url) {
      fail(page.file + ": hreflang " + languageCode + " must point to " + url);
    }
  }

  const jsonld = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (!jsonld.length) fail(page.file + ": missing JSON-LD");
  jsonld.forEach((item, index) => {
    try { JSON.parse(item[1]); }
    catch (error) { fail(page.file + ": invalid JSON-LD #" + (index + 1) + ": " + error.message); }
  });

  console.log(
    "Checked " + page.file + ": lang=" + page.language +
    ", title=" + title.length + " chars, description=" +
    (descriptions[0]?.content.length ?? 0) + " chars"
  );
}

if (errors.length) {
  errors.forEach(error => console.error("[SEO] " + error));
  process.exit(1);
}
console.log("Portfolio SEO audit passed for both Russian and English pages.");
