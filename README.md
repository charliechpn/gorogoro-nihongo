# GoroGoro Nihongo

A bilingual Japanese study site with kanji, vocabulary, transitivity, onomatopoeia, and word recall exercises. The interface supports English and Brazilian Portuguese. Study catalogs and editorial translations are included in this repository.

## Run locally

Requirements: Node.js 22.13 or newer and npm.

On Windows, run `ABRIR NIHON-GO.cmd`. It installs no dependencies for you: run `npm ci` first. The launcher prepares the local D1 database on first use and opens the site at <http://localhost:3000>.

To set up manually:

1. Run `npm ci`.
2. Run `npm run db:migrate:local` to create the local Cloudflare D1 database.
3. For each level `N5`, `N4`, `N3`, `N2`, and `N1`, generate and apply its vocabulary curation:

   ```sh
   npm run data:vocabulary:build-local -- N5 work/vocabulary-N5-curation.sql
   npx wrangler d1 execute site-creator-d1 --local --config wrangler.jsonc --file work/vocabulary-N5-curation.sql
   ```

   Repeat those two commands with the other level names.
4. Run `npm run dev` and open <http://localhost:3000>.

Kanji and vocabulary practice progress uses an anonymous browser identifier and the D1 database. Named custom kanji lists live only in that browser's local storage. The local `.wrangler/` database contains runtime state and is intentionally excluded from Git.

## Data and deployment

The repository includes the curated data and its source files in `kanjis/`, `content/`, `public/data/`, and `drizzle/`. The included SQLite files contain study catalogs, not learner accounts. Deployment needs your own Cloudflare D1 database binding; the ID in `wrangler.jsonc` is a placeholder.

The runtime artwork in `public/` is included so the site works locally. Original high-resolution working files in the local `assets/` and `img/` folders are intentionally excluded from Git.

The JLPT level groups are community approximations, not official JLPT lists. Read [DATA_ATTRIBUTION.md](DATA_ATTRIBUTION.md) for source credits and data license terms.

## Licenses

The study application code is licensed under [GNU AGPL v3 or later](LICENSE). The derived study data is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The original artwork, mascot, visual identity, and stylesheets are **not** licensed for reuse; they remain reserved to this project. See [LICENSES.md](LICENSES.md) for the exact file scope and contribution guidance.
