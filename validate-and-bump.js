// Bruges af GitHub Action'en (.github/workflows/version-and-release.yml).
// 1) Trækker JSX-koden ud af index.html og tjekker at Babel kan parse den
//    (fanger de "Babel/JSX parse error"-fejl vi ellers først opdager i browseren).
// 2) Hvis alt er ok: finder nuværende APP_VERSION, bumper patch-tallet,
//    og skriver det nye versionsnummer tilbage i index.html.
// Printer den nye version på sidste linje, så workflowet kan læse den.

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const filePath = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(filePath, "utf8");

// ── 1) Udtræk og valider JSX ──────────────────────────────────────
const match = html.match(/<script type="text\/babel">([\s\S]*)<\/script>/);
if (!match) {
  console.error("Kunne ikke finde <script type=\"text/babel\">-blokken i index.html");
  process.exit(1);
}
try {
  babel.transformSync(match[1], { presets: ["@babel/preset-react"], filename: "index.jsx" });
} catch (e) {
  console.error("❌ JSX/Babel-syntaksfejl fundet – deploy stoppes:");
  console.error(e.message);
  process.exit(1);
}
console.error("✅ JSX-syntaks er OK");

// ── 2) Bump version (patch) ───────────────────────────────────────
const versionMatch = html.match(/const APP_VERSION="v(\d+)\.(\d+)\.(\d+)"/);
if (!versionMatch) {
  console.error("Kunne ikke finde APP_VERSION-konstanten i index.html");
  process.exit(1);
}
const [, major, minor, patch] = versionMatch;
const newVersion = `v${major}.${minor}.${Number(patch) + 1}`;
const newHtml = html.replace(
  /const APP_VERSION="v\d+\.\d+\.\d+"/,
  `const APP_VERSION="${newVersion}"`
);
fs.writeFileSync(filePath, newHtml);
console.error(`🔖 Version bumpet til ${newVersion}`);

// Sidste linje på stdout = ren version, så workflowet nemt kan læse den med `tail -n1`
console.log(newVersion);
