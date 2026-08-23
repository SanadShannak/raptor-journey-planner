import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The docs are navigation instructions: CLAUDE.md and the api-contract skill
 * both send a reader to a specific file ("read formatItinerary.js rather than
 * guessing at fields"). A rename anywhere in the repo silently turns those into
 * dead ends, and nothing else in the build would notice.
 *
 * So every backtick-quoted span in those two documents that looks like a repo
 * path is resolved against the files git actually tracks. This test lives under
 * src/test/ rather than beside its subject because its subject is the
 * repository, not a module — it is the one test here with no code to sit next
 * to.
 *
 * `git ls-files` rather than the filesystem, deliberately: it answers the same
 * way on a fresh clone and in CI as it does on a machine that has run the
 * pipeline and built the frontend, so a failure always means a wrong path and
 * never a missing build artefact.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const DOCS = ['CLAUDE.md', '.claude/skills/api-contract/SKILL.md'] as const;

/*
 * CLAUDE.md's "Frontend conventions" and "Localisation" sections write frontend
 * paths relative to `frontend/` (`src/i18n/en.ts`), while its architecture
 * sections write them from the repo root (`backend/server/index.js`). Both are
 * unambiguous to a reader, so both resolve here.
 */
const BASE_DIRS = ['', 'frontend'] as const;

const SOURCE_EXTENSION = /\.(?:js|mjs|cjs|jsx|ts|tsx|json|css|md|html)$/;

/*
 * Characters that no path in this repo contains, and that instead mark a span
 * as prose, code, or a pattern: `HH:mm` and `Europe/Helsinki` carry a colon,
 * `*-mapping.json` a glob, `claude/<topic>` and `raw-data/<network>-gtfs-data/`
 * a placeholder, `anySignal()` a call, `{ errorCode, error }` a shape.
 */
const NOT_A_PATH = /[\s*<>()[\]{}|:#$@!?,;='"\\]/;

/*
 * Generated, and gitignored as such (see the "data used by parsers and
 * algorithms" and "Dependency directories" rules in .gitignore). The docs name
 * them because a reader needs to know they exist; asserting they are on disk
 * would only assert that whoever ran the test had run the pipeline first.
 */
const GENERATED = [
  'processed-data',
  'raw-data',
  'node_modules',
  'active-services.processed.json',
] as const;

const trackedFiles = new Set(
  execSync('git ls-files -z', {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean),
);

const trackedDirs = new Set<string>();
const trackedBasenames = new Set<string>();
for (const file of trackedFiles) {
  const segments = file.split('/');
  for (let depth = 1; depth < segments.length; depth += 1) {
    trackedDirs.add(segments.slice(0, depth).join('/'));
  }
  trackedBasenames.add(segments[segments.length - 1] ?? file);
}

/* The top-level names under each base dir — `backend`, `src`, `scripts`, … */
const rootSegments = new Set<string>();
for (const entry of [...trackedFiles, ...trackedDirs]) {
  for (const base of BASE_DIRS) {
    const prefix = base === '' ? '' : `${base}/`;
    if (!entry.startsWith(prefix)) continue;
    const [first] = entry.slice(prefix.length).split('/');
    if (first !== undefined && first !== '') rootSegments.add(first);
  }
}

interface Quote {
  readonly span: string;
  readonly line: number;
}

/*
 * Inline spans only. Fenced blocks hold shell commands, whose arguments
 * (`path/to/x.test.ts`) are illustrations rather than references.
 */
function inlineCodeSpans(markdown: string): Quote[] {
  const quotes: Quote[] = [];
  let inFence = false;

  markdown.split('\n').forEach((text, index) => {
    if (/^\s*```/.test(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    for (const match of text.matchAll(/`([^`]+)`/g)) {
      const span = match[1];
      if (span !== undefined) quotes.push({ span, line: index + 1 });
    }
  });

  return quotes;
}

type Verdict = 'prose' | 'generated' | 'path';

function classify(span: string): Verdict {
  if (NOT_A_PATH.test(span)) return 'prose';
  // `.tsbuildinfo`, `--dark-*`, `/api/planner`: a suffix, a token, a route.
  if (/^[./-]/.test(span)) return 'prose';

  // The trailing slash is read before it is stripped: it is what tells
  // `backend/` and `src/theme/` apart from a bare word like `mode`.
  const namesDirectory = span.endsWith('/');
  const normalised = span.replace(/\/+$/, '');

  if (GENERATED.some((entry) => normalised === entry || normalised.startsWith(`${entry}/`))) {
    return 'generated';
  }

  // Anything ending in a source extension is a file reference wherever it sits,
  // so a path invented wholesale still fails rather than being waved through.
  if (SOURCE_EXTENSION.test(normalised)) return 'path';

  // A bare word naming no file is prose: `mode`, `strings`, `train-H`.
  if (!namesDirectory && !normalised.includes('/')) return 'prose';

  /*
   * What is left is directory-shaped and extensionless — a real folder, or an
   * identifier wearing the same clothes. `Europe/Helsinki` and `Asia/Amman` are
   * IANA zones, and what separates them from `backend/` is that no top-level
   * `Europe` exists. The cost of that rule is that a folder invented wholesale
   * (`bogus-dir/`) reads as prose instead of failing; a wrong path *under* a
   * real root still fails, and so does every span naming a file.
   */
  const [first] = normalised.split('/');
  return first !== undefined && rootSegments.has(first) ? 'path' : 'prose';
}

function resolves(span: string): boolean {
  const normalised = span.replace(/\/+$/, '');

  for (const base of BASE_DIRS) {
    const candidate = base === '' ? normalised : `${base}/${normalised}`;
    if (trackedFiles.has(candidate) || trackedDirs.has(candidate)) return true;
  }

  /*
   * A file cited without its directory — `formatItinerary.js`, `runPipeline.js`
   * — can only be checked by name. Weaker than an exact path, but it still
   * catches the way these actually go stale, which is a rename.
   */
  return !normalised.includes('/') && trackedBasenames.has(normalised);
}

describe('repo paths quoted in the docs', () => {
  it.each(DOCS)('%s points only at files that exist', (doc) => {
    const markdown = readFileSync(resolve(repoRoot, doc), 'utf8');
    const paths = inlineCodeSpans(markdown).filter(({ span }) => classify(span) === 'path');

    // Guards against a change to the extractor quietly making this vacuous.
    expect(paths.length).toBeGreaterThan(0);

    const dangling = paths
      .filter(({ span }) => !resolves(span))
      .map(({ span, line }) => `${doc}:${line}  \`${span}\``);

    expect(dangling).toEqual([]);
  });
});

describe('classify', () => {
  it('reads a quoted repo path as one, from either base directory', () => {
    expect(classify('backend/server/utils/formatItinerary.js')).toBe('path');
    expect(classify('src/i18n/en.ts')).toBe('path');
    expect(classify('frontend/.env.development')).toBe('path');
    expect(classify('backend/')).toBe('path');
    expect(classify('frontend/src/api')).toBe('path');
    expect(classify('itineraryRows.ts')).toBe('path');
  });

  it('leaves prose, patterns, and API routes alone', () => {
    // Zone identifiers, which are the one thing here shaped exactly like a path.
    expect(classify('Europe/Helsinki')).toBe('prose');
    expect(classify('Asia/Amman')).toBe('prose');
    // Routes belong to the API, not the filesystem.
    expect(classify('/api/planner')).toBe('prose');
    expect(classify('GET /api/stop/:id')).toBe('prose');
    // Patterns and placeholders describe a shape rather than name a file.
    expect(classify('*-mapping.json')).toBe('prose');
    expect(classify('*.test.ts(x)')).toBe('prose');
    expect(classify('claude/<topic>')).toBe('prose');
    expect(classify('processed-data/<network>-processed-data/')).toBe('prose');
    // Identifiers, tokens, and values.
    expect(classify('HH:mm')).toBe('prose');
    expect(classify('pipelineConfig.rules')).toBe('prose');
    expect(classify('Intl.PluralRules')).toBe('prose');
    expect(classify('addendum.GTFS')).toBe('prose');
    expect(classify('ms-*')).toBe('prose');
    expect(classify('text-start')).toBe('prose');
    expect(classify('errorCode')).toBe('prose');
  });

  it('exempts the pipeline output the docs name but git does not carry', () => {
    expect(classify('processed-data/')).toBe('generated');
    expect(classify('active-services.processed.json')).toBe('generated');
    expect(classify('node_modules')).toBe('generated');
  });

  it('fails a path that no longer exists', () => {
    expect(classify('backend/server/utils/formatMoney.js')).toBe('path');
    expect(resolves('backend/server/utils/formatMoney.js')).toBe(false);
    expect(resolves('backend/server/utils/formatItinerary.js')).toBe(true);
  });
});

describe('inlineCodeSpans', () => {
  it('skips fenced blocks, where a path is an illustration', () => {
    const markdown = ['Read `src/api/client.ts`.', '', '```sh', 'npx vitest run path/to/x.test.ts', '```', '', 'Then `src/api/health.ts`.'].join('\n');

    expect(inlineCodeSpans(markdown)).toEqual([
      { span: 'src/api/client.ts', line: 1 },
      { span: 'src/api/health.ts', line: 7 },
    ]);
  });
});
