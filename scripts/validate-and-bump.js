// Bruges af GitHub Action'en (.github/workflows/version-and-release.yml).
// 1) Trækker JSX-koden ud af index.html og tjekker at Babel kan parse den
//    (fanger de "Babel/JSX parse error"-fejl vi ellers først opdager i browseren).
// 2) Hvis alt er ok: finder den SENESTE version ud fra eksisterende git-tags
//    (ikke fra teksten i filen – den kan sagtens være forældet, fx hvis nogen
//    uploader en ældre kopi af index.html manuelt). Bumper patch-tallet ud fra
//    det højeste eksisterende tag, og skriver det nye versionsnummer ind i index.html.
// Printer den nye version på sidste linje, så workflowet kan læse den.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
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

// ── 2) Find den reelle nuværende version ud fra git-tags ──────────
// Git-tags er den eneste sandhed her. Teksten i filen bruges KUN som fallback,
// hvis der slet ingen tags findes endnu (allerførste kørsel).
function highestExistingVersion() {
  let tags = [];
  try {
    tags = execSync('git tag -l "v*"', { encoding: "utf8" })
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
  } catch (e) {
    tags = [];
  }
  let best = null;
  for (const t of tags) {
    const m = t.match(/^v(\d+)\.(\d+)\.(\d+)$/);
    if (!m) continue;
    const tuple = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!best || tuple[0] > best[0] || (tuple[0] === best[0] && tuple[1] > best[1]) || (tuple[0] === best[0] && tuple[1] === best[1] && tuple[2] > best[2])) {
      best = tuple;
    }
  }
  return best; // [major, minor, patch] eller null
}

let base = highestExistingVersion();
if (!base) {
  // Ingen tags fundet endnu – brug det der står i filen som udgangspunkt (bootstrap).
  const versionMatch = html.match(/const APP_VERSION="v(\d+)\.(\d+)\.(\d+)"/);
  if (!versionMatch) {
    console.error("Kunne ikke finde APP_VERSION-konstanten i index.html, og ingen git-tags fundet.");
    process.exit(1);
  }
  base = [Number(versionMatch[1]), Number(versionMatch[2]), Number(versionMatch[3])];
  console.error(`ℹ️ Ingen eksisterende git-tags – bruger version fra filen som udgangspunkt: v${base.join(".")}`);
} else {
  console.error(`ℹ️ Højeste eksisterende git-tag: v${base.join(".")}`);
}

const newVersion = `v${base[0]}.${base[1]}.${base[2] + 1}`;
const newHtml = html.replace(
  /const APP_VERSION="v\d+\.\d+\.\d+"/,
  `const APP_VERSION="${newVersion}"`
);
fs.writeFileSync(filePath, newHtml);
console.error(`🔖 Version bumpet til ${newVersion}`);

// Sidste linje på stdout = ren version, så workflowet nemt kan læse den med `tail -n1`
console.log(newVersion);
