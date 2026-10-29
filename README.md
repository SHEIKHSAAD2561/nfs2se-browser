# NFS II SE in the Browser

A small web page that runs **Need for Speed II: Special Edition (DOS version)** in the browser using [js-dos](https://js-dos.com) (DOSBox compiled to WebAssembly).

**This repo contains no game files.** You load your own copy from your computer, and it never leaves your browser.

## How to use

1. Open the page (GitHub Pages link, or run it locally, see below).
2. Click **Choose folder** and pick your installed NFS II SE DOS folder, or pick a `.zip` of it.
3. If the game asks for the CD, also add the disc image (`.iso`, or `.cue` + `.bin`). It's mounted as `D:`.
4. Check that **Program to run** shows the game's exe (usually `NFS2SE.EXE`), then press **Start game**.

With **Keep the files in this browser** ticked, the files are copied once into the browser's private storage (OPFS), so next time the page loads them by itself. **Forget saved files** removes them.

### Tips

- **Folder names must be DOS-friendly**: 8 characters or fewer, no spaces (e.g. `NFSSE`). The page warns you if not.
- If the game runs too slowly or too fast, change **CPU cycles** (try `fixed 60000`).
- If it crashes or has no sound, try the **DOSBox-X** emulator option, or tweak the sound card settings in the game's setup program (Sound Blaster 16, port 220, IRQ 7, DMA 1).
- You can edit the full `dosbox.conf` under **Edit dosbox.conf by hand**.
- The Windows 95 version of the game won't run here; it needs the DOS version.

## Run locally

js-dos doesn't work from `file://`, so serve the folder:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Host on GitHub Pages

Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**. The page will be live at `https://<your-username>.github.io/<repo-name>/`.

## How it works

- Your files are read with the File API (folder picker) or [JSZip](https://stuk.github.io/jszip/) (zip).
- They're passed to js-dos as an in-memory file system (`initFs`), along with a generated `dosbox.conf` that mounts them as `C:` and launches the selected program.

### Compared with the Cricket 07 port

[cricket07-browser](https://github.com/Dhaiwat10/cricket07-browser) uses *static recompilation*: the Windows game's machine code is translated to C and compiled to WebAssembly, and Direct3D, DirectSound and DirectInput are rebuilt on WebGPU and Web Audio. That gives near-native speed but is a large, game-specific engineering project.

This project emulates a DOS PC instead, so the original game runs unmodified. It borrows the "pick your folder once, keep it in browser storage" design from that repo.

## Legal

Need for Speed is a trademark of Electronic Arts. The game is still under copyright, so don't commit game files to this repo or host them publicly. Use a copy you own. The launcher code in this repo is MIT licensed.
