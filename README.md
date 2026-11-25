# The World in One Day — Wednesday 25 November 2026 (Full-Day Edition)

![make.fun entry](https://img.shields.io/badge/make.fun-entry-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Bounty](https://img.shields.io/badge/bounty-news--image--20261125-red)

One-page visual summary of the world's news for **Wednesday 25 November
2026**, full-day edition (cut-off ~21:30 UTC, after the Wall Street close).
Built for the make.fun bounty
[news-image-20261125](https://make.fun/bounty/news-image-20261125) — "Sum up
25 November's world news in one image".

## What's on the page

- 36 verified stories across 7 regions: the USTR Section 301 tariff
  proposals and the Asia sell-off (Kospi −6.16%), US Q3 GDP at 4.3% with
  October core PCE at 3.3%, the Shenzhou-24 launch and docking with the
  first foreign astronaut aboard Tiangong, the Cartagena hostage rescue,
  Russia's overnight strike on Ukraine's energy grid, Dell's $132.3bn AI
  server backlog, the Nepal 5.6 quake, Microsoft's "Code Red", and the
  Hormuz tanker mine strikes — plus a UTC timeline, a dotted world map
  with numbered pins, and a DATE CHECK box separating what is in, what was
  left out, and what is still to come.
- Colour order: deep-navy lead headlines, dark-red grid headlines, red
  kickers, navy section headings, big red stats numbers, black masthead on
  cream paper.

## How it runs

Node 22+ standard library only — no network, no clock, no randomness:

```sh
node main.ts
```

It reads `atlas.png` + `metrics.json` beside itself (a glyph atlas rendered
from real TTF fonts — Noto Serif Display Black and Liberation Serif/Sans —
under the SIL Open Font License, see `OFL.txt`) and writes one 1024×1024
PNG, at most 1 MiB, to `/output/entry.png`. Two runs from any working
directory produce byte-identical output.

## Layout

Top strip · masthead · red sub-deck · six-number stats strip · navy UTC
timeline · three lead panels · ten-card grid · 23-wire list with a dotted
world map · DATE CHECK box · sources line · dark footer.

## License

MIT — see `LICENSE`.
