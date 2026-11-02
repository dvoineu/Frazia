# Frazia for Mac

[Website](https://dvoineu.github.io/Frazia/) · [Русский](https://dvoineu.github.io/Frazia/?lang=ru) · [Downloads and release notes](https://github.com/dvoineu/VoiceHelper-downloads/releases)

Free voice dictation at your text cursor. This repository contains the official bilingual website and video guides. The Russian guide includes DAV narration; the English guide has built-in subtitles.

## Maintaining the site

Application installers remain in the established downloads repository. The website uses those verified versioned links and its latest-release API. This repository contains no application source or installers.

Preview with `python3 -m http.server --directory site 8080`. Run `python3 Tests/site_test.py` and check JavaScript syntax before opening a PR. Work is tracked in Issues and the Frazia Project. Site changes go through an Issue branch and PR targeting main. The Pages workflow checks PRs and deploys the site after merge to main.

The former website at `/VoiceHelper-downloads/` forwards visitors here while preserving their language and section. Its releases remain available.
