/**
 * Drift detector for project skills. Scans every `.cursor/skills/<name>/SKILL.md`,
 * extracts repo-relative paths referenced in markdown links and inline code, and fails
 * if any referenced file no longer exists. Keeps skills honest as the code evolves.
 *
 * Usage: npm run check:skills
 */
import fs from "node:fs";
import path from "node:path";

const SKILLS_DIR = ".cursor/skills";
const PATH_PREFIX = /^(src\/|scripts\/|data\/|drizzle\/|\.cursor\/|AGENTS\.md|README\.md)/;

function referencedPaths(markdown: string): Set<string> {
  const refs = new Set<string>();
  const patterns = [/\]\(([^)]+)\)/g, /`([^`]+)`/g];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(markdown)) !== null) {
      const raw = (match[1] ?? "").split("#")[0]?.trim() ?? "";
      if (PATH_PREFIX.test(raw) && /[/.]/.test(raw)) refs.add(raw);
    }
  }
  return refs;
}

function main(): void {
  const problems: string[] = [];

  if (!fs.existsSync(SKILLS_DIR)) {
    console.log("check:skills OK (no .cursor/skills yet)");
    return;
  }

  const skillDirs = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of skillDirs) {
    const file = path.join(SKILLS_DIR, dir.name, "SKILL.md");
    if (!fs.existsSync(file)) {
      problems.push(`${dir.name}: missing SKILL.md`);
      continue;
    }
    const content = fs.readFileSync(file, "utf8");
    for (const ref of referencedPaths(content)) {
      if (!fs.existsSync(ref)) {
        problems.push(`${dir.name}: references missing path "${ref}"`);
      }
    }
  }

  if (problems.length > 0) {
    console.error("Skill drift detected:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`check:skills OK (${skillDirs.length} skills)`);
}

main();
