import fs from "node:fs";

const errors = [];
function fail(message) { errors.push(message); }

function attrs(tag) {
  const result = {};
  for (const match of tag.matchAll(/([^\\s=<>/]+)\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

function tags(html, name) {
  const pattern = new RegExp("<" + name + "\\b[^>]*>", "gi");
  return [...html.matchAll(pattern)].map(match => match[0]);
}

function matchingMeta(html, key, value) {
  return tags(html, "meta").map(tag => attrs(tag)).filter(item => item[key] === value);
}

function matchingLinks(html, predicate) {
  return tags(html, "link").map(tag => attrs(tag)).filter(predicate);
}

const base = "https://ivanivorontsov-sudo.github.io";
const pages = [
  {
    file: "../index.html",
    language: "ru",
    canonical: base + "/vizitka/",
    alternate: base + "/vizitka/en/",
    proofUrl: base + "/proofs/",
    researchUrl: base + "/aefh/v7.4/"
  },
  {
    file: "../en/index.html",
    language: "en",
    canonical: base + "/vizitka/en/",
    alternate: base + "/vizitka/",
    proofUrl: base + "/en/proofs/",
    researchUrl: base + "/en/research/aefh-v7-4/"
  }
];

for (const page of pages) {
  const html = fs.readFileSync(new URL(page.file, import.meta.url), "utf8");
  const titleTag = tags(html, "title");
  const title = titleTag[0]?.replace(/^<title[^>]*>/i, "").replace(/<\\/title>$/i, "").trim() ?? "";
  const description = matchingMeta(html, "name", "description");
  const robots = matchingMeta(html, "name", "robots");
  const ogUrl = matchingMeta(html, "property", "og:url");
  const canonical = matchingLinks(html, item => (item.rel || "").toLowerCase().split(/\\s+/).includes("canonical"));
  const lang = attrs(tags(html, "html")[0] ?? "").lang ?? "";
  const staticHtml = html.replace(/<script[\\s\\S]*?<\\/script>/gi, "").replace(/<style[\\s\\S]*?<\\/style>/gi, "");
  const h1Count = (staticHtml.match(/<h1\\b/gi) || []).length;

  if (titleTag.length !== 1 || !title) fail(page.file + ": expected one non-empty title");
  else if (title.length < 15 || title.length > 80) fail(page.file + ": title length " + title.length + " is outside 15..80");

  if (description.length !== 1 || !description[0].content) {
    fail(page.file + ": expected exactly one non-empty meta description");
  } else if (description[0].content.length < 70 || description[0].content.length > 200) {
    fail(page.file + ": meta description length " + description[0].content.length + " is outside 70..200");
  }

  if (lang.toLowerCase() !== page.language) fail(page.file + ": html lang does not match " + page.language);
  if (canonical.length !== 1 || canonical[0].href !== page.canonical) fail(page.file + ": canonical URL does not match " + page.canonical);
  if (ogUrl.length !== 1 || ogUrl[0].content !== page.canonical) fail(page.file + ": og:url must match canonical");
  if (robots.length !== 1 || /noindex/i.test(robots[0].content || "")) fail(page.file + ": robots must allow indexing");

  for (const property of ["og:type", "og:title", "og:description", "og:image"]) {
    const matches = matchingMeta(html, "property", property);
    if (matches.length !== 1 || !matches[0].content) fail(page.file + ": expected one non-empty " + property);
  }
  for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    const matches = matchingMeta(html, "name", name);
    if (matches.length !== 1 || !matches[0].content) fail(page.file + ": expected one non-empty " + name);
  }

  if (h1Count !== 1) fail(page.file + ": expected exactly one static H1, found " + h1Count);
  if (!html.includes(page.proofUrl)) fail(page.file + ": missing link to the matching Short Proofs page");
  if (!html.includes(page.researchUrl)) fail(page.file + ": missing link to the current AEFH v7.4 edition");

  const alternates = matchingLinks(html, item => (item.rel || "").toLowerCase().split(/\\s+/).includes("alternate") && !!item.hreflang);
  const alternateMap = Object.fromEntries(alternates.map(item => [item.hreflang.toLowerCase(), item.href]));
  const expectedAlternates = {
    ru: base + "/vizitka/",
    en: base + "/vizitka/en/",
    "x-default": base + "/vizitka/"
  };
  for (const [language, url] of Object.entries(expectedAlternates)) {
    if (alternateMap[language] !== url) fail(page.file + ": hreflang " + language + " must point to " + url);
  }

  const jsonld = [...html.matchAll(/<script[^>]+type=["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script>/gi)];
  if (!jsonld.length) fail(page.file + ": missing JSON-LD");
  jsonld.forEach((item, index) => {
    try { JSON.parse(item[1]); }
    catch (error) { fail(page.file + ": invalid JSON-LD #" + (index + 1) + ": " + error.message); }
  });

  console.log("Checked " + page.file + ": lang=" + page.language + ", title=" + title.length + " chars, description=" + (description[0]?.content.length ?? 0) + " chars");
}

if (errors.length) {
  errors.forEach(error => console.error("[SEO] " + error));
  process.exit(1);
}
console.log("Portfolio SEO audit passed for Russian and English pages.");
