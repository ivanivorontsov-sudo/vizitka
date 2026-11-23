import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const errors = [];
function fail(message) { errors.push(message); }
function one(regex, label) {
  const matches = Array.from(html.matchAll(regex));
  if (matches.length !== 1) fail(label + ": expected exactly one, found " + matches.length);
  return matches.length ? matches[0][1] : "";
}

const title = one(/<title>([\s\S]*?)<\/title>/gi, "title");
const description = one(/<meta\s+name=["']description["']\s+content=["']([^"']*)["'][^>]*>/gi, "description");
const canonical = one(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["'][^>]*>/gi, "canonical");

if (!title.trim()) fail("title is empty");
if (description.trim().length < 70) fail("description is too short");
if (canonical !== "https://ivanivorontsov-sudo.github.io/vizitka/") fail("canonical URL does not match portfolio URL");

const staticHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
if ((staticHtml.match(/<h1\b/gi) || []).length !== 1) fail("expected exactly one static h1");

for (const property of ["og:title", "og:description", "og:url", "og:image"]) {
  const pattern = new RegExp("<meta[^>]+property=[\\"']" + property + "[\\"']", "i");
  if (!pattern.test(html)) fail("missing " + property);
}
if (html.indexOf("https://ivanivorontsov-sudo.github.io/og-cover.png") < 0) fail("missing social preview image URL");

const jsonld = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
if (!jsonld.length) fail("missing JSON-LD");
jsonld.forEach((item, index) => {
  try { JSON.parse(item[1]); }
  catch (error) { fail("invalid JSON-LD #" + (index + 1) + ": " + error.message); }
});
if (!html.includes('class="static-category-links"')) fail("missing static category-link fallback");
if (!html.includes("https://ivanivorontsov-sudo.github.io/projects/")) fail("missing project landing page links");

if (errors.length) {
  errors.forEach(error => console.error("[SEO] " + error));
  process.exit(1);
}
console.log("Portfolio SEO audit passed.");
