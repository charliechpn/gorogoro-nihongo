# License scope

GoroGoro Nihongo separates reusable study software and data from its visual identity. A public repository does not give permission to reuse every file under the same license.

## Application code — AGPL-3.0-or-later

The application source code, study algorithms, server logic, tests, build configuration, migration logic, and scripts are licensed under the [GNU Affero General Public License, version 3 or later](LICENSE), except for the data and visual materials described below.

You may use the code, including commercially, under the AGPL terms. A modified version offered to people over a network must make its corresponding source code available to those users under the AGPL. The project name, mascot, and visual identity are not granted by the code license.

## Study data — CC BY-SA 4.0

The curated study data, including the SQLite catalogs in `kanjis/`, the JSON data in `content/` and `public/data/`, and dataset records embedded in SQL migrations, is licensed under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). This includes data derived from OpenJLPT and its upstream sources. Give the credits in [DATA_ATTRIBUTION.md](DATA_ATTRIBUTION.md), link the license, indicate your changes, and share adapted datasets under compatible ShareAlike terms.

The SQL code that defines database schemas or performs migrations remains under AGPL-3.0-or-later; the study records carried by those files remain under CC BY-SA 4.0.

## Visual identity — rights reserved

The original artwork, mascot, logo, image assets, and visual stylesheets are excluded from the AGPL and CC BY-SA grants above. This includes image files in `public/` (excluding `public/data/`) and CSS files under `app/`. High-resolution working files in the local `assets/` and `img/` folders are intentionally not published.

They are supplied so this repository can be viewed, run locally, and contributed to. Apart from rights supplied by GitHub for using its service, no permission is granted to extract or reuse them in another project, redistribute modified versions of them, or use them commercially. Forks or deployments that reuse the AGPL study code should supply their own artwork and styling. Contact the project owner for separate permission to use the original visual materials.

This reservation concerns the supplied files and distinctive visual identity; it does not restrict independent artwork or styling made for a new version of the study application.
