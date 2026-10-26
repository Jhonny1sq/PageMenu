(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const $ = (s, r = document) => r.querySelector(s);

  const wrapper = $("#wrapper");
  const topbar = $("#topbar");
  const masterToggle = $("#masterToggle");

  // Inside BloodSense the host window owns show/hide and the Insert key.
  const hosted = !!(window.chrome && window.chrome.webview);

  const STORAGE_KEY = "bloodsense.config.v2";
  const AUTOSAVE_MS = 1200;

  let activeTab = "aim";
  let fitScale = 1;
  let storedScale = 1;

  /* ------------------------------------------------------------- toast */

  const toastEl = $("#toast");
  let toastTimer = 0;
  const toast = (msg, kind) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle("err", kind === "err");
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  };

  /* ---------------------------------------------------------------- fit */

  // The game window can be any size. Scale the whole panel down rather than
  // letting the fixed 860x590 layout overflow off-screen.
  const fit = () => {
    const stage = $("#stage");
    if (!stage || wrapper.classList.contains("dragging")) return;
    const availW = stage.clientWidth - 32;
    const availH = stage.clientHeight - 32;
    const w = wrapper.offsetWidth * storedScale;
    const h = wrapper.offsetHeight * storedScale;
    fitScale = Math.min(1, availW / w, availH / h);
    wrapper.style.transform = `scale(${(storedScale * fitScale).toFixed(4)})`;
  };

  /* ---------------------------------------------------------------- tabs */

  const syncMasterScope = () => {
    masterToggle.dataset.scope = activeTab;
  };

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.tab;
      if (key === activeTab) return;
      activeTab = key;
      $$(".tab").forEach((t) => {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      $$(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === key));
      syncMasterScope();
      $("#body").scrollTop = 0;
      scheduleSave();
    });
  });
  syncMasterScope();

  /* ------------------------------------------------------------ bar/scale */

  const posSel = $("#barPos");
  const applyBar = (pos) => {
    wrapper.dataset.bar = pos;
    requestAnimationFrame(fit);
  };
  if (posSel) {
    posSel.addEventListener("change", () => {
      applyBar(posSel.value);
      toast("tabs: " + posSel.value);
      scheduleSave();
    });
    applyBar(posSel.value || "top");
  }

  const scaleSel = $("#uiScale");
  const applyScale = (s) => {
    storedScale = parseFloat(s) || 1;
    fit();
  };
  if (scaleSel) {
    scaleSel.addEventListener("change", () => {
      applyScale(scaleSel.value);
      toast("scale: " + Math.round(storedScale * 100) + "%");
      scheduleSave();
    });
    applyScale(scaleSel.value || "1");
  }

  window.addEventListener("resize", fit);

  /* --------------------------------------------------------------- drag */

  let drag = null;
  let rafId = null;

  topbar.addEventListener("mousedown", (e) => {
    if (e.target.closest(".tab, .btn, .master-toggle, .dropdown")) return;
    const rect = wrapper.getBoundingClientRect();
    drag = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top };
    wrapper.style.transform = "none";
    wrapper.style.position = "fixed";
    wrapper.style.left = rect.left + "px";
    wrapper.style.top = rect.top + "px";
    wrapper.style.margin = "0";
    wrapper.classList.add("dragging");
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      wrapper.style.left = drag.originX + dx + "px";
      wrapper.style.top = drag.originY + dy + "px";
    });
  });

  window.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = null;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    wrapper.classList.remove("dragging");
  });

  /* ------------------------------------------------------------- hide key */

  document.addEventListener("keydown", (e) => {
    if (hosted) return; // host handles visibility, page must not fight it
    if (e.key !== "Insert" && e.key !== "Escape") return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    e.preventDefault();
    wrapper.classList.toggle("hidden");
  });

  /* -------------------------------------------------------- master switch */

  const flipMaster = () => {
    masterToggle.classList.toggle("on");
    const on = masterToggle.classList.contains("on");
    masterToggle.setAttribute("aria-checked", on ? "true" : "false");
    toast(on ? "master on" : "master off");
    scheduleSave();
  };
  masterToggle.addEventListener("click", flipMaster);
  masterToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      flipMaster();
    }
  });

  /* ----------------------------------------------------------- checkboxes */

  const toggleBox = (box) => {
    const row = box.closest(".row");
    if (!row) return;
    row.classList.toggle("on");
    box.setAttribute("aria-checked", row.classList.contains("on") ? "true" : "false");
    box.classList.remove("pop");
    void box.offsetWidth;
    box.classList.add("pop");
    scheduleSave();
  };

  document.addEventListener("click", (e) => {
    const box = e.target.closest(".cbox");
    if (box) {
      e.stopPropagation();
      toggleBox(box);
      return;
    }
    const row = e.target.closest(".row[data-toggle]");
    if (!row) return;
    const cb = row.querySelector(".cbox");
    if (cb) toggleBox(cb);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const box = e.target.closest && e.target.closest(".cbox");
    if (!box) return;
    e.preventDefault();
    toggleBox(box);
  });

  /* -------------------------------------------------------------- sliders */

  const buildSlider = (row) => {
    const track = row.querySelector(".slider-track");
    const fill = row.querySelector(".slider-fill");
    const thumb = row.querySelector(".slider-thumb");
    const input = row.querySelector("input[type='range']");
    const valEl = row.querySelector(".val");
    if (!track || !input || !valEl) return;

    const tip = document.createElement("div");
    tip.className = "slider-tip";
    track.appendChild(tip);

    const paint = () => {
      const v = parseFloat(input.value);
      const lo = parseFloat(input.min);
      const hi = parseFloat(input.max);
      const pct = hi === lo ? 0 : ((v - lo) / (hi - lo)) * 100;
      fill.style.width = pct + "%";
      thumb.style.left = pct + "%";
      valEl.textContent = input.value;
      tip.textContent = input.value;
      tip.style.left = pct + "%";
    };

    const commit = () => {
      paint();
      scheduleSave();
    };

    input.addEventListener("input", paint);
    input.addEventListener("change", commit);
    input.addEventListener("pointerdown", () => tip.classList.add("visible"));
    input.addEventListener("pointerup", () => tip.classList.remove("visible"));
    input.addEventListener("pointerleave", () => tip.classList.remove("visible"));
    input.addEventListener("dblclick", () => {
      const def = row.dataset.default;
      if (def == null) return;
      input.value = def;
      commit();
      toast("reset " + (row.querySelector(".label")?.textContent || ""));
    });
    paint();

    track.addEventListener("click", (e) => {
      if (e.target === input) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const lo = parseFloat(input.min);
      const hi = parseFloat(input.max);
      const step = parseFloat(input.step) || 1;
      input.value = Math.round((lo + pct * (hi - lo)) / step) * step;
      commit();
    });
  };
  $$(".slider-row").forEach(buildSlider);

  /* -------------------------------------------------------------- profile */

  const profileSel = $("#profile");
  const footProfile = $("#footProfile");
  const syncProfile = () => {
    if (!profileSel || !footProfile) return;
    footProfile.textContent = "PROFILE: " + profileSel.value.toUpperCase();
  };
  if (profileSel) {
    profileSel.addEventListener("change", () => {
      syncProfile();
      toast("profile: " + profileSel.value);
      scheduleSave();
    });
    syncProfile();
  }

  const keySel = $("#menuKey");
  const kbdToggle = $("#kbdToggle");
  if (keySel) {
    keySel.addEventListener("change", () => {
      if (kbdToggle) kbdToggle.textContent = keySel.value;
      toast("menu key: " + keySel.value);
      scheduleSave();
    });
  }

  /* ------------------------------------------------------- save / restore */

  const flash = (btn) => {
    btn.classList.add("flash");
    setTimeout(() => btn.classList.remove("flash"), 600);
  };

  const snapshot = () => ({
    v: 2,
    toggles: $$(".row[data-toggle]").map((r) => r.classList.contains("on")),
    sliders: $$(".slider-row input[type='range']").map((i) => i.value),
    master: masterToggle.classList.contains("on"),
    bar: wrapper.dataset.bar || "top",
    scale: scaleSel ? scaleSel.value : "1",
    profile: profileSel ? profileSel.value : "default",
    menuKey: keySel ? keySel.value : "INSERT",
    tab: activeTab
  });

  const restore = (s) => {
    if (!s) return;

    $$(".row[data-toggle]").forEach((r, i) => {
      if (!s.toggles || s.toggles[i] == null) return;
      r.classList.toggle("on", !!s.toggles[i]);
      const cb = r.querySelector(".cbox");
      if (cb) cb.setAttribute("aria-checked", s.toggles[i] ? "true" : "false");
    });

    $$(".slider-row input[type='range']").forEach((i, idx) => {
      if (!s.sliders || s.sliders[idx] == null) return;
      i.value = s.sliders[idx];
      i.dispatchEvent(new Event("input"));
    });

    masterToggle.classList.toggle("on", !!s.master);
    masterToggle.setAttribute("aria-checked", s.master ? "true" : "false");

    if (s.bar && posSel) {
      posSel.value = s.bar;
      applyBar(s.bar);
    }
    if (s.scale && scaleSel) {
      scaleSel.value = s.scale;
      applyScale(s.scale);
    }
    if (s.profile && profileSel) {
      profileSel.value = s.profile;
      syncProfile();
    }
    if (s.menuKey && keySel) {
      keySel.value = s.menuKey;
      if (kbdToggle) kbdToggle.textContent = s.menuKey;
    }
    if (s.tab) {
      const tab = $(`.tab[data-tab="${s.tab}"]`);
      if (tab && !tab.classList.contains("active")) tab.click();
    }
    requestAnimationFrame(fit);
  };

  const writeStore = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
      return true;
    } catch (_) {
      return false;
    }
  };

  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeStore, AUTOSAVE_MS);
  }

  $("#btnSave").addEventListener("click", (e) => {
    const ok = writeStore();
    flash(e.currentTarget);
    toast(ok ? "config saved" : "save failed", ok ? "" : "err");
  });

  $("#btnLoad").addEventListener("click", (e) => {
    let ok = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        restore(JSON.parse(raw));
        ok = true;
      }
    } catch (_) {
      ok = false;
    }
    flash(e.currentTarget);
    toast(ok ? "config loaded" : "nothing stored", ok ? "" : "err");
  });

  $("#btnReset").addEventListener("click", (e) => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}

    $$(".row[data-toggle]").forEach((r) => {
      r.classList.remove("on");
      const cb = r.querySelector(".cbox");
      if (cb) cb.setAttribute("aria-checked", "false");
    });

    $$(".slider-row").forEach((row) => {
      const input = row.querySelector("input[type='range']");
      if (!input || row.dataset.default == null) return;
      input.value = row.dataset.default;
      input.dispatchEvent(new Event("input"));
    });

    masterToggle.classList.remove("on");
    masterToggle.setAttribute("aria-checked", "false");
    flash(e.currentTarget);
    toast("reset to defaults");
  });

  /* --------------------------------------------------------------- uptime */

  const t0 = Date.now();
  const upEl = $("#uptime");
  if (upEl) {
    setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      upEl.textContent = mm + ":" + ss;
    }, 1000);
  }

  /* ----------------------------------------------------------------- boot */

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) restore(JSON.parse(raw));
  } catch (_) {}

  requestAnimationFrame(() => requestAnimationFrame(fit));

  if (hosted) document.documentElement.dataset.host = "webview2";
})();
