// NFS II SE browser launcher.
// The user's own game files are read locally, handed to js-dos as an in-memory
// file system, and run with a generated dosbox.conf. Nothing leaves the browser.

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // path (forward slashes, no leading slash) -> File | JSZipObject
  let gameFiles = new Map();
  let cdFiles = new Map();
  let dos = null;

  const LIKELY_GAME = /^(nfs2se|nfssed|nfs2sea|nfs2sen|nfs2|nfs)\.(exe|bat|com)$/i;
  const NOT_GAME = /(setup|install|uninst|readme|dos4gw|pmode)/i;

  // ---------- loading files ----------

  function clean(path) {
    return path.replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function setFilesStatus(msg, kind = "") {
    const el = $("files-status");
    el.textContent = msg;
    el.className = "status " + kind;
  }

  async function loadFolder(fileList) {
    gameFiles = new Map();
    fromStore = false;
    for (const f of fileList) {
      gameFiles.set(clean(f.webkitRelativePath || f.name), f);
    }
    afterGameLoad();
  }

  async function loadZip(file) {
    setFilesStatus("Reading " + file.name + "…");
    try {
      const zip = await JSZip.loadAsync(file);
      gameFiles = new Map();
      fromStore = false;
      zip.forEach((path, entry) => {
        if (!entry.dir) gameFiles.set(clean(path), entry);
      });
      afterGameLoad();
    } catch (e) {
      setFilesStatus("Couldn't read that zip: " + e.message, "err");
    }
  }

  function afterGameLoad() {
    if (gameFiles.size === 0) {
      setFilesStatus("No files found.", "err");
      return;
    }
    const programs = [...gameFiles.keys()].filter((p) => /\.(exe|bat|com)$/i.test(p));
    programs.sort((a, b) => score(b) - score(a) || a.length - b.length);

    const sel = $("exe");
    sel.innerHTML = "";
    for (const p of programs) {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = p;
      sel.appendChild(o);
    }

    const total = [...gameFiles.values()].reduce((n, f) => n + (f.size || f._data?.uncompressedSize || 0), 0);
    const warnings = longNameWarnings(programs[0]);
    if (!programs.length) {
      setFilesStatus(`Loaded ${gameFiles.size} files, but found no .EXE/.BAT to run.`, "err");
    } else {
      setFilesStatus(
        `Loaded ${gameFiles.size} files (${mb(total)}).` + (warnings ? " " + warnings : ""),
        warnings ? "warn" : "ok"
      );
    }
    rebuildConf();
  }

  function score(path) {
    const name = path.split("/").pop();
    let s = 0;
    if (LIKELY_GAME.test(name)) s += 10;
    if (/nfs/i.test(name)) s += 3;
    if (/\.exe$/i.test(name)) s += 1;
    if (NOT_GAME.test(name)) s -= 20;
    return s;
  }

  // DOS can only cd into 8.3 names, so long folder names break the launch.
  function longNameWarnings(path) {
    if (!path) return "";
    const bad = path.split("/").slice(0, -1).filter((d) => !is83(d));
    return bad.length
      ? `Folder name "${bad[0]}" is too long for DOS; rename it to 8 characters or fewer with no spaces (e.g. NFSSE).`
      : "";
  }

  function is83(name) {
    return /^[^\s.]{1,8}(\.[^\s.]{1,3})?$/.test(name);
  }

  function loadCd(fileList) {
    cdFiles = new Map();
    for (const f of fileList) cdFiles.set("cd/" + clean(f.name), f);
    fromStore = false;
    showCdStatus();
  }

  function showCdStatus() {
    const names = [...cdFiles.keys()];
    const image = cdImagePath();
    $("cd-status").textContent = image
      ? `Mounting ${names.map((n) => n.slice(3)).join(" + ")} as D:`
      : "Pick an .iso or a .cue (with its .bin).";
    $("cd-status").className = "status " + (image ? "ok" : "err");
    rebuildConf();
  }

  function cdImagePath() {
    const names = [...cdFiles.keys()];
    return names.find((n) => /\.cue$/i.test(n)) || names.find((n) => /\.iso$/i.test(n)) || null;
  }

  // ---------- saved files (browser private storage, OPFS) ----------
  // Same idea as the Cricket 07 port: copy the game folder in once, then load it from storage.

  const STORE = "nfs2se";
  const SETTINGS_KEY = "nfs2se-settings";
  const SETTING_IDS = ["exe", "cycles", "memsize", "backend"];
  let fromStore = false;

  const storeSupported = !!(navigator.storage && navigator.storage.getDirectory);

  async function storeDir(create) {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(STORE, { create });
  }

  async function writeFile(dir, path, blob) {
    const parts = path.split("/");
    const name = parts.pop();
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    await w.write(blob instanceof Blob ? blob : await blob.async("blob"));
    await w.close();
  }

  async function saveToStore(onProgress) {
    await clearStore();
    const dir = await storeDir(true);
    const all = [
      ...[...gameFiles].map(([p, f]) => ["game/" + p, f]),
      ...cdFiles,
    ];
    let i = 0;
    for (const [path, f] of all) {
      await writeFile(dir, path, f);
      onProgress(++i, all.length);
    }
    try { await navigator.storage.persist(); } catch (_) {}
  }

  async function walk(dir, prefix, out) {
    for await (const [name, handle] of dir.entries()) {
      const path = prefix ? prefix + "/" + name : name;
      if (handle.kind === "directory") await walk(handle, path, out);
      else out.set(path, await handle.getFile());
    }
    return out;
  }

  async function loadFromStore() {
    let dir;
    try { dir = await storeDir(false); } catch (_) { return false; }
    const all = await walk(dir, "", new Map());
    const game = new Map(), cd = new Map();
    for (const [p, f] of all) {
      if (p.startsWith("game/")) game.set(p.slice(5), f);
      else if (p.startsWith("cd/")) cd.set(p, f);
    }
    if (!game.size) return false;
    gameFiles = game;
    cdFiles = cd;
    fromStore = true;
    return true;
  }

  async function clearStore() {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(STORE, { recursive: true });
    } catch (_) { /* nothing saved */ }
  }

  function saveSettings() {
    try {
      const s = {};
      for (const id of SETTING_IDS) s[id] = $(id).value;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (_) {}
  }

  function restoreSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      for (const id of SETTING_IDS) {
        if (s[id] && [...$(id).options].some((o) => o.value === s[id])) $(id).value = s[id];
      }
    } catch (_) {}
  }

  async function init() {
    if (!storeSupported) {
      $("remember").checked = false;
      $("remember").disabled = true;
      $("remember").parentElement.title = "This browser doesn't support saving files.";
    } else if (await loadFromStore()) {
      afterGameLoad();
      if (cdFiles.size) showCdStatus();
      restoreSettings();
      rebuildConf();
      setFilesStatus($("files-status").textContent + " (loaded from this browser)", $("files-status").className.split(" ")[1]);
      $("forget").hidden = false;
      return;
    }
    restoreSettings();
    rebuildConf();
  }

  // ---------- dosbox.conf ----------

  function buildConf() {
    const exe = $("exe").value;
    const parts = exe ? exe.split("/") : [];
    const program = parts.pop() || "";
    const dir = parts.join("\\");
    const cd = cdImagePath();

    const lines = [
      "[sdl]",
      "autolock=true",
      "",
      "[dosbox]",
      "machine=svga_s3",
      `memsize=${$("memsize").value}`,
      "",
      "[cpu]",
      "core=dynamic",
      "cputype=pentium_slow",
      `cycles=${$("cycles").value}`,
      "",
      "[render]",
      "aspect=true",
      "",
      "[mixer]",
      "rate=44100",
      "",
      "[sblaster]",
      "sbtype=sb16",
      "sbbase=220",
      "irq=7",
      "dma=1",
      "hdma=5",
      "",
      "[autoexec]",
      "mount c .",
    ];
    if (cd) lines.push(`imgmount d ${cd} -t iso`);
    lines.push("c:");
    if (dir) lines.push(`cd \\${dir}`);
    if (program) lines.push(program);
    return lines.join("\n") + "\n";
  }

  function rebuildConf() {
    $("conf").value = buildConf();
    $("launch").disabled = !$("exe").value;
  }

  // ---------- launch ----------

  async function toBytes(f) {
    if (f instanceof Blob) return new Uint8Array(await f.arrayBuffer());
    return f.async("uint8array"); // JSZip entry
  }

  async function launch() {
    const btn = $("launch");
    btn.disabled = true;
    btn.textContent = "Preparing files…";
    try {
      if (storeSupported && $("remember").checked && !fromStore) {
        try {
          await saveToStore((i, n) => { btn.textContent = `Saving files ${i}/${n}…`; });
          fromStore = true;
        } catch (e) {
          setFilesStatus("Couldn't save files in this browser (" + e.message + "); running without saving.", "warn");
        }
      }
      saveSettings();
      btn.textContent = "Preparing files…";
      const initFs = [];
      for (const [path, f] of [...gameFiles, ...cdFiles]) {
        initFs.push({ path, contents: await toBytes(f) });
      }

      $("setup").hidden = true;
      $("player").hidden = false;
      $("running").textContent = $("exe").value;

      dos = Dos($("dos"), {
        dosboxConf: $("conf").value,
        initFs,
        backend: $("backend").value,
        autoStart: true,
        kiosk: false,
        renderAspect: "4/3",
        mouseCapture: true,
      });
    } catch (e) {
      $("setup").hidden = false;
      $("player").hidden = true;
      setFilesStatus("Couldn't start: " + e.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "Start game";
    }
  }

  async function stop() {
    try {
      if (dos && typeof dos.stop === "function") await dos.stop();
    } catch (_) { /* fall through to reload */ }
    location.reload();
  }

  function mb(bytes) {
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  // ---------- wiring ----------

  $("pick-folder").addEventListener("change", (e) => e.target.files.length && loadFolder(e.target.files));
  $("pick-zip").addEventListener("change", (e) => e.target.files[0] && loadZip(e.target.files[0]));
  $("pick-cd").addEventListener("change", (e) => e.target.files.length && loadCd(e.target.files));
  for (const id of ["exe", "cycles", "memsize"]) $(id).addEventListener("change", rebuildConf);
  for (const id of SETTING_IDS) $(id).addEventListener("change", saveSettings);
  $("launch").addEventListener("click", launch);
  $("stop").addEventListener("click", stop);
  $("forget").addEventListener("click", async () => {
    await clearStore();
    location.reload();
  });

  const drop = $("drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const f = e.dataTransfer.files[0];
    if (f && /\.zip$/i.test(f.name)) loadZip(f);
    else setFilesStatus("Drop a .zip file (or use Choose folder).", "err");
  });

  init();
})();
