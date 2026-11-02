# Credits

Every model, sound and music file in Commit City, with its author and license. Only CC0 and CC-BY files ship. A unit test (`tests/unit/credits.test.mjs`) fails the gate when an audio file under `src/` or `public/` is not listed here.

## Sound

| File | Title | Author | Source | License | Changes |
| --- | --- | --- | --- | --- | --- |
| `src/assets/audio/rain.mp3` | AMB Rain Loop 1 | Kresiek The Furry | https://opengameart.org/content/amb-rain-loop-1 | CC0 1.0 | Re-encoded from the Ogg to mono 64 kbps MP3 |
| `src/assets/audio/traffic.mp3` | High traffic road sounds (`gatve Varniu_2.ogg`) | IgnasD | https://opengameart.org/content/high-traffic-road-sounds | CC0 1.0 | Re-encoded to mono 56 kbps MP3 |

## Synthesized in the page (no file)

- City hum: low oscillators (50 Hz and harmonics) through a lowpass, made in Web Audio in `src/audio/sound.js`.
- Synth radio: a stand-in track (minor progression with pad, bass and arpeggio) made in Web Audio in `src/audio/sound.js`.
