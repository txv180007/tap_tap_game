# BEAT DANCE

A browser rhythm game in the spirit of DDR / Tap Tap Revenge / Guitar Hero — load **your own MP3 or FLAC**, set the tempo with the built-in **tap-to-the-beat tool** (or one-click auto-detect), and hit the arrows in time with the music.

No build step required for solo play: the whole game is a single `index.html`. Just open it in a modern browser (Chrome, Edge, or Firefox).

## Multiplayer (LAN / Tailscale)

Two players, side by side on the same track — each with their own difficulty.

```
npm install
npm start
```

One player hosts; the server prints its addresses. Both players open the host's LAN or **Tailscale** IP (e.g. `http://100.x.y.z:8123`) and click **Multiplayer**. Either player can pick the song — upload an MP3/FLAC (it's relayed to the other player automatically, along with identical pre-generated charts) or use the demo track. The song owner sets the tempo as usual; both players pick their own difficulty and hit READY. Starts are clock-synchronized to a few milliseconds; your opponent's runway renders live beside yours with their hits, combo, and multiplier. Esc during a match offers a forfeit (no pausing — it would desync). Not in v1: reconnect mid-song, more than 2 players, spectators.

## How to play

1. **Load a song** — drop an MP3/FLAC (wav/ogg/m4a work too) onto the start screen, or try the built-in demo track.
2. **Set the tempo** — press play and tap <kbd>Space</kbd> along with the beat (8+ taps recommended), or click **✨ Auto-detect BPM**. Turn on the metronome to hear ticks over the music and check they line up; nudge the first-beat offset or re-tap if they drift. The waveform shows the beat grid.
3. **Pick a difficulty** — Easy through Expert. Notes are generated automatically from the song's energy, snapped to the beat grid. Sustained sounds (pads, held vocals, long synths) become **hold notes** — press on the head, keep the key down until the trail ends. Repeating sections of the song (choruses, loops) are detected and get the same step patterns each time they come around.
4. **Dance!** Chain hits to climb the **multiplier ladder** — x2 / x3 / x4 / x5 / x10 / x20 at 10 / 20 / 30 / 40 / 60 / 100 combo. A miss or a broken hold drops you straight back to x1.

| Action | Keys |
|---|---|
| Hit lanes | <kbd>←</kbd> <kbd>↓</kbd> <kbd>↑</kbd> <kbd>→</kbd> or <kbd>D</kbd> <kbd>F</kbd> <kbd>J</kbd> <kbd>K</kbd> |
| Tap tempo (sync screen) | <kbd>Space</kbd> |
| Pause / resume | <kbd>Esc</kbd> |

Judgments are **Perfect** (±50 ms), **Great** (±105 ms), **Good** (±160 ms), otherwise a miss. Combo boosts your score; the results screen grades your run S–D and tells you if you're consistently hitting early or late (fix it with the *Audio offset* slider on the difficulty screen).

## Tech notes

- **Web Audio API** for decoding and sample-accurate scheduling — the game clock is the audio clock, so notes can't drift from the music. Pause suspends the `AudioContext`, freezing both together.
- **Tap tempo**: BPM from the median tap interval (outlier-filtered mean), first-beat offset from the circular mean of tap phases.
- **Auto-detect**: autocorrelation of the onset-strength envelope with a preference for the common dance-tempo range; beat phase from folding onsets across one period.
- **Note generation**: an RMS energy envelope (prefix-summed for O(1) windowed queries) scores every beat-grid subdivision; the strongest onsets win, subject to per-difficulty spacing rules, with two-lane jumps on the heaviest hits at Hard+.
- **Repetition detection**: every bar gets a 16th-note onset fingerprint; bars are clustered by cosine similarity, one pattern is generated per unique cluster and stamped into all of its repeats — so the chorus plays the same steps every time.
- **Hold placement**: a candidate becomes a hold when the mix stays above 35% of its onset energy across consecutive 40 ms slices (drum tails dip and don't qualify), for at least ~a beat, capped at four.
