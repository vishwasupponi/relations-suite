/* Relations Suite — by Vishwas Upponi
   3-in-1 Plugin suite featuring Instant Relationship Property Sync,
   Interactive Family Tree View and Interactive Relations Graph View.
   All features and settings unified under one single plugin.
*/
"use strict";
const obsidian = require("obsidian");

const RELATION_GRAPH_VIEW_TYPE = "relation-path-graph-view";
const FAMILY_TREE_VIEW_TYPE = "family-tree-view";

const DEFAULT_SETTINGS = {
  // --- 1. Relation Sync Engine ---
  includedFolders: [],
  autoLinkSiblings: false,
  autoLinkSpouseCoParent: false,
  genderProperty: "",
  maleValues: [],
  femaleValues: [],
  fatherProperty: [],
  motherProperty: [],
  husbandProperty: [],
  wifeProperty: [],
  sonProperty: [],
  daughterProperty: [],
  brotherProperty: [],
  sisterProperty: [],
  relations: [],

  // --- 2. Relation Graph Viewer ---
  rpg_basePropertyName: "",
  rpg_defaultBaseValue: "",
  rpg_excludedProperties: [],

  // --- 3. Family Tree Viewer ---
  ft_basePropertyName: "",
  ft_defaultBaseValue: "",
  ft_excludePropertyName: "",
  ft_excludePropertyValue: "",
  ft_excludeValues: [],
  ft_selectedCardProps: [],
  cardSubtitleProperty: "",
  fatherProps: [],
  motherProps: [],
  husbandProps: [],
  wifeProps: [],
  sonProps: [],
  daughterProps: [],
  brotherProps: [],
  sisterProps: [],
  genderProps: [],
  generationRowHeight: 200,
  cardWidth: 154,
  cardHeight: 54,
  horizontalSpacing: 48,
  familyBranchSpacing: 260,
};

const LINEAGE_PALETTE = [
  { stroke: "#00f0ff", fill: "rgba(0, 240, 255, 0.15)", name: "Cyan" },
  { stroke: "#10b981", fill: "rgba(16, 185, 129, 0.15)", name: "Emerald" },
  { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.15)", name: "Amber" },
  { stroke: "#a855f7", fill: "rgba(168, 85, 247, 0.15)", name: "Purple" },
  { stroke: "#ec4899", fill: "rgba(236, 72, 153, 0.15)", name: "Rose" },
  { stroke: "#38bdf8", fill: "rgba(56, 189, 248, 0.15)", name: "Sky" },
  { stroke: "#14b8a6", fill: "rgba(20, 184, 166, 0.15)", name: "Teal" },
  { stroke: "#eab308", fill: "rgba(234, 179, 8, 0.15)", name: "Gold" },
  { stroke: "#8b5cf6", fill: "rgba(139, 92, 246, 0.15)", name: "Violet" },
  { stroke: "#fb923c", fill: "rgba(251, 146, 60, 0.15)", name: "Coral" }
];

/* ═════════════════════════ SHARED HELPERS ═════════════════════════ */

function bare(s) {
  if (!s) return "";
  let n = String(s).trim();
  if (n.startsWith("[[") && n.endsWith("]]")) n = n.slice(2, -2);
  const p = n.indexOf("|"); if (p !== -1) n = n.slice(0, p);
  const h = n.indexOf("#"); if (h !== -1) n = n.slice(0, h);
  return n.replace(/\.md$/i, "").trim();
}

function linksUnderProp(cache, propKey) {
  if (!cache) return [];
  const lk = propKey.toLowerCase();
  const results = new Set();

  if (Array.isArray(cache.frontmatterLinks)) {
    for (const fl of cache.frontmatterLinks) {
      const flKeyRaw = (fl.key || "").toLowerCase();
      const flKeyBase = flKeyRaw.split(".")[0].split("[")[0];
      if (flKeyBase === lk) {
        const n = bare(fl.link || fl.displayText || fl.original || "");
        if (n) results.add(n);
      }
    }
  }

  const fm = cache.frontmatter;
  if (fm) {
    const realKey = Object.keys(fm).find(k => k.toLowerCase() === lk);
    if (realKey) {
      const val = fm[realKey];
      const items = Array.isArray(val) ? val : [val];
      for (const item of items) {
        if (!item) continue;
        if (typeof item === "string") {
          const rx = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
          let m, found = false;
          while ((m = rx.exec(item)) !== null) { results.add(bare(m[1])); found = true; }
          if (!found) results.add(bare(item));
        } else if (typeof item === "object") {
          const n = bare(item.link || item.path || item.displayText || item.toFileName || item.original || "");
          if (n) results.add(n);
        }
      }
    }
  }
  return [...results].filter(Boolean);
}

function getAllVaultPropertyKeys(app) {
  const keys = new Set();
  try {
    Object.keys(app.metadataCache.getAllPropertyInfos?.() ?? {}).forEach(k => keys.add(k));
  } catch (_) {}
  app.vault.getMarkdownFiles().forEach(f => {
    const fm = app.metadataCache.getFileCache(f)?.frontmatter;
    if (fm) {
      Object.keys(fm).filter(k => k !== "position").forEach(k => keys.add(k));
    }
  });
  return [...keys].filter(Boolean).sort();
}

function getVaultBaseValues(app, basePropKey) {
  const k = (basePropKey || "").toLowerCase().trim();
  const values = new Set();
  if (!k) return [];
  for (const f of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(f);
    if (!cache || !cache.frontmatter) continue;
    const realKey = Object.keys(cache.frontmatter).find(x => x.toLowerCase() === k);
    if (!realKey) continue;
    const val = cache.frontmatter[realKey];
    const items = Array.isArray(val) ? val : [val];
    for (const item of items) {
      if (!item) continue;
      const bName = bare(typeof item === "string" ? item : (item.link || ""));
      if (bName) values.add(bName);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function parsePropList(val) {
  if (Array.isArray(val)) return val.map(x => String(x).trim().toLowerCase()).filter(Boolean);
  return (val || "")
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);
}

function extractLinksFromProperty(cache, propKeys, excludedSet) {
  if (!cache || !propKeys || propKeys.length === 0) return [];
  const allowed = new Set(propKeys.map(k => k.toLowerCase()));
  const excl = excludedSet instanceof Set ? excludedSet : new Set();
  const results = new Set();

  if (Array.isArray(cache.frontmatterLinks)) {
    for (const fl of cache.frontmatterLinks) {
      const flKeyRaw = (fl.key || "").toLowerCase();
      const flKeyBase = flKeyRaw.split(".")[0].split("[")[0];
      if (allowed.has(flKeyBase) && !excl.has(flKeyBase)) {
        const n = bare(fl.link || fl.displayText || fl.original || "");
        if (n) results.add(n);
      }
    }
  }

  const fm = cache.frontmatter;
  if (fm) {
    for (const key of Object.keys(fm)) {
      const loKey = key.toLowerCase();
      if (allowed.has(loKey) && !excl.has(loKey)) {
        const val = fm[key];
        const items = Array.isArray(val) ? val : [val];
        for (const item of items) {
          if (!item) continue;
          if (typeof item === "string") {
            const rx = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
            let m, found = false;
            while ((m = rx.exec(item)) !== null) {
              results.add(bare(m[1]));
              found = true;
            }
            if (!found) results.add(bare(item));
          } else if (typeof item === "object") {
            const n = bare(item.link || item.path || item.displayText || item.original || "");
            if (n) results.add(n);
          }
        }
      }
    }
  }

  return [...results].filter(Boolean);
}

function extractStringFromProperty(cache, propKeys) {
  if (!cache || !cache.frontmatter || !propKeys || propKeys.length === 0) return "";
  const allowed = new Set(propKeys.map(k => k.toLowerCase()));
  const fm = cache.frontmatter;
  for (const key of Object.keys(fm)) {
    if (allowed.has(key.toLowerCase())) {
      const val = fm[key];
      if (val !== undefined && val !== null) {
        if (Array.isArray(val)) return String(val[0] || "").trim();
        return String(val).trim();
      }
    }
  }
  return "";
}

function formatPropertyValue(val) {
  if (val === null || val === undefined) return "";
  if (Array.isArray(val)) {
    return val.map(x => formatPropertyValue(x)).filter(Boolean).join(", ");
  }
  if (typeof val === "object") {
    return bare(val.link || val.displayText || val.original || val.path || "");
  }
  let s = String(val).trim();
  if (s.startsWith("[[") && s.endsWith("]]")) s = bare(s);
  return s;
}

function setupAutocomplete(inputEl, containerEl, getMatches, onSelect) {
  let popup = null;
  let selectedIndex = -1;
  let popupItems = [];

  const closePopup = () => {
    if (popup) {
      popup.remove();
      popup = null;
    }
    selectedIndex = -1;
    popupItems = [];
  };

  const updateSelection = (idx) => {
    popupItems.forEach((el, i) => {
      if (i === idx) {
        el.addClass("is-selected");
        el.scrollIntoView({ block: "nearest" });
      } else {
        el.removeClass("is-selected");
      }
    });
    selectedIndex = idx;
  };

  const showMatches = (query) => {
    closePopup();
    const rawVal = query || "";
    const lastComma = rawVal.lastIndexOf(",");
    const currentToken = (lastComma !== -1 ? rawVal.slice(lastComma + 1) : rawVal).trim().toLowerCase();
    const all = getMatches ? getMatches() : [];
    const matches = (all || []).filter(k => {
      const kl = String(k).toLowerCase();
      return !currentToken || kl.includes(currentToken);
    }).slice(0, 20);

    if (!matches.length) return;

    if (window.getComputedStyle(containerEl).position === "static") {
      containerEl.style.position = "relative";
    }

    popup = containerEl.createDiv({ cls: "ft-suggest-popup" });
    popup.style.position = "absolute";
    popup.style.left = inputEl.offsetLeft + "px";
    popup.style.top = (inputEl.offsetTop + inputEl.offsetHeight + 4) + "px";
    popup.style.minWidth = Math.max(inputEl.offsetWidth, 180) + "px";
    popupItems = [];

    matches.forEach((val, idx) => {
      const item = popup.createDiv({ cls: "ft-suggest-item", text: val });
      popupItems.push(item);

      item.addEventListener("mouseenter", () => {
        updateSelection(idx);
      });

      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();

        let finalVal = val;
        if (lastComma !== -1) {
          finalVal = rawVal.slice(0, lastComma + 1).trimEnd() + " " + val;
        }
        inputEl.value = finalVal;
        onSelect(finalVal);
        closePopup();
        inputEl.focus({ preventScroll: true });
      });
    });

    selectedIndex = 0;
    updateSelection(0);
  };

  inputEl.addEventListener("input", (e) => showMatches(e.target.value));
  inputEl.addEventListener("focus", (e) => showMatches(e.target.value));
  inputEl.addEventListener("blur", () => setTimeout(closePopup, 200));

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      if (popup && popupItems.length > 0) {
        e.preventDefault();
        const next = (selectedIndex + 1) % popupItems.length;
        updateSelection(next);
      } else {
        showMatches(inputEl.value);
      }
    } else if (e.key === "ArrowUp") {
      if (popup && popupItems.length > 0) {
        e.preventDefault();
        const prev = (selectedIndex - 1 + popupItems.length) % popupItems.length;
        updateSelection(prev);
      }
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (popup && selectedIndex >= 0 && selectedIndex < popupItems.length) {
        e.preventDefault();
        const chosen = popupItems[selectedIndex].textContent;
        const rawVal = inputEl.value || "";
        const lastComma = rawVal.lastIndexOf(",");
        let finalVal = chosen;
        if (lastComma !== -1) {
          finalVal = rawVal.slice(0, lastComma + 1).trimEnd() + " " + chosen;
        }
        inputEl.value = finalVal;
        onSelect(finalVal);
        closePopup();
        inputEl.focus({ preventScroll: true });
      } else {
        onSelect(inputEl.value || "");
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePopup();
      inputEl.blur();
    }
  });
}

/* ═════════════════════════ SUGGEST CLASSES ═════════════════════════ */

class VaultPropertySuggest extends obsidian.AbstractInputSuggest {
  constructor(app, inputEl, onSelect) { super(app, inputEl); this._cb = onSelect; }
  getSuggestions(q) {
    const keys = getAllVaultPropertyKeys(this.app);
    const lo = q.toLowerCase().trim();
    return keys.filter(k => !lo || k.toLowerCase().includes(lo)).sort();
  }
  renderSuggestion(v, el) { el.setText(v); }
  selectSuggestion(v) { this.setValue(v); if (this._cb) this._cb(v); }
}

class VaultFolderSuggest extends obsidian.AbstractInputSuggest {
  constructor(app, inputEl, onSelect) { super(app, inputEl); this._cb = onSelect; }
  getSuggestions(q) {
    const lo = q.toLowerCase().trim();
    return this.app.vault.getAllLoadedFiles()
      .filter(f => f instanceof obsidian.TFolder && f.path !== "/")
      .map(f => f.path).filter(p => !lo || p.toLowerCase().includes(lo)).sort();
  }
  renderSuggestion(v, el) { el.setText(`📁 ${v}`); }
  selectSuggestion(v) { this.setValue(v); if (this._cb) this._cb(v); }
}

/* ═════════════════════════ PILL SELECTORS ═════════════════════════ */

class RPGPropertyPillSelector {
  constructor(containerEl, initialProps, app, onChange, getAvailableProps = null, placeholder = "") {
    this.containerEl = containerEl;
    this.props = Array.isArray(initialProps) ? [...initialProps] : [];
    this.app = app;
    this.onChange = onChange;
    this.getAvailableProps = getAvailableProps;
    this.placeholder = placeholder;

    this.render();
  }

  render() {
    this.containerEl.empty();
    this.containerEl.addClass("rpg-pill-container");

    // Render pill badges
    this.props.forEach((prop, idx) => {
      const pill = this.containerEl.createSpan({ cls: "rpg-pill", text: prop });
      const del = pill.createSpan({ cls: "rpg-pill-remove", text: "×" });
      del.addEventListener("click", e => {
        e.stopPropagation();
        this.props.splice(idx, 1);
        this.onChange(this.props);
        this.render();
        this.input.focus({ preventScroll: true });
      });
    });

    // Inline input box — clean blank placeholder
    this.input = this.containerEl.createEl("input", {
      type: "text",
      cls: "rpg-pill-input",
      placeholder: this.placeholder || "",
    });

    let dropdown = null;
    let selectedIndex = -1;
    let dropdownItems = [];

    const closeDropdown = () => {
      if (dropdown) { dropdown.remove(); dropdown = null; }
      selectedIndex = -1;
      dropdownItems = [];
    };

    const updateSelection = idx => {
      dropdownItems.forEach((el, i) => {
        if (i === idx) {
          el.classList.add("is-selected");
          el.scrollIntoView({ block: "nearest" });
        } else {
          el.classList.remove("is-selected");
        }
      });
      selectedIndex = idx;
    };

    const showDropdown = query => {
      closeDropdown();
      const allKeys = this.getAvailableProps ? this.getAvailableProps() : (this.app ? getAllVaultPropertyKeys(this.app) : []);
      const q = String(query || "").toLowerCase().trim();
      const matches = allKeys
        .map(k => String(k))
        .filter(k => !this.props.some(p => p.toLowerCase() === k.toLowerCase()))
        .filter(k => !q || k.toLowerCase().includes(q))
        .slice(0, 20);

      if (!matches.length) return;

      dropdown = this.containerEl.createDiv({ cls: "rpg-pill-dropdown" });
      dropdownItems = [];
      matches.forEach((k, idx) => {
        const item = dropdown.createDiv({ cls: "rpg-pill-item", text: k });
        dropdownItems.push(item);

        item.addEventListener("mouseenter", () => {
          updateSelection(idx);
        });

        item.addEventListener("mousedown", e => {
          e.preventDefault();
          this.addProp(k);
          closeDropdown();
        });
      });

      selectedIndex = 0;
      updateSelection(0);
    };

    this.input.addEventListener("input", e => {
      showDropdown(e.target.value);
    });

    this.input.addEventListener("focus", e => {
      showDropdown(e.target.value);
    });

    this.input.addEventListener("blur", () => {
      setTimeout(closeDropdown, 200);
    });

    this.input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") {
        if (dropdown && dropdownItems.length > 0) {
          e.preventDefault();
          const next = (selectedIndex + 1) % dropdownItems.length;
          updateSelection(next);
        } else {
          showDropdown(this.input.value);
        }
      } else if (e.key === "ArrowUp") {
        if (dropdown && dropdownItems.length > 0) {
          e.preventDefault();
          const prev = (selectedIndex - 1 + dropdownItems.length) % dropdownItems.length;
          updateSelection(prev);
        }
      } else if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
        if (dropdown && selectedIndex >= 0 && selectedIndex < dropdownItems.length) {
          e.preventDefault();
          this.addProp(dropdownItems[selectedIndex].textContent);
          closeDropdown();
        } else {
          const val = this.input.value.replace(/,/g, "").trim();
          if (val) {
            e.preventDefault();
            this.addProp(val);
            closeDropdown();
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeDropdown();
        this.input.blur();
      } else if (e.key === "Backspace" && !this.input.value && this.props.length > 0) {
        e.preventDefault();
        this.props.pop();
        this.onChange(this.props);
        this.render();
        this.input.focus({ preventScroll: true });
      }
    });

    this.containerEl.addEventListener("click", () => {
      this.input.focus({ preventScroll: true });
    });
  }

  addProp(name) {
    const clean = String(name || "").trim();
    if (!clean) return;
    if (!this.props.some(p => p.toLowerCase() === clean.toLowerCase())) {
      this.props.push(clean);
      this.onChange(this.props);
      this.render();
      this.input.focus({ preventScroll: true });
    }
  }

  setProps(newProps) {
    this.props = Array.isArray(newProps) ? [...newProps] : [];
    this.render();
  }
}

class FTPropertyPillSelector {
  constructor(containerEl, initialProps, getAvailableProps, onChange, placeholderText = "", placeholderAdd = "") {
    this.containerEl = containerEl;
    this.props = Array.isArray(initialProps) ? [...initialProps] : [];
    this.getAvailableProps = getAvailableProps;
    this.onChange = onChange;
    this.placeholderText = placeholderText;
    this.placeholderAdd = placeholderAdd;

    this.render();
  }

  render() {
    this.containerEl.empty();
    this.containerEl.addClass("ft-pill-container");

    // Render pill badges
    this.props.forEach((prop, idx) => {
      const pill = this.containerEl.createSpan({ cls: "ft-pill", text: prop });
      const del = pill.createSpan({ cls: "ft-pill-remove", text: "×" });
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.props.splice(idx, 1);
        this.onChange(this.props);
        this.render();
        this.input.focus({ preventScroll: true });
      });
    });

    // Inline input box — clean blank placeholder
    this.input = this.containerEl.createEl("input", {
      type: "text",
      cls: "ft-pill-input",
      placeholder: this.props.length ? this.placeholderAdd : this.placeholderText,
    });

    let dropdown = null;
    let selectedIndex = -1;
    let dropdownItems = [];

    const closeDropdown = () => {
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
      }
      selectedIndex = -1;
      dropdownItems = [];
    };

    const updateSelection = (idx) => {
      dropdownItems.forEach((el, i) => {
        if (i === idx) {
          el.addClass("is-selected");
          el.scrollIntoView({ block: "nearest" });
        } else {
          el.removeClass("is-selected");
        }
      });
      selectedIndex = idx;
    };

    const showDropdown = (query) => {
      closeDropdown();
      const allKeys = this.getAvailableProps ? this.getAvailableProps() : [];
      const q = (query || "").toLowerCase().trim();
      const matches = allKeys
        .map(k => String(k))
        .filter(k => !this.props.some(p => p.toLowerCase() === k.toLowerCase()))
        .filter(k => !q || k.toLowerCase().includes(q))
        .slice(0, 20);

      if (!matches.length) return;

      dropdown = this.containerEl.createDiv({ cls: "ft-pill-dropdown" });
      dropdownItems = [];
      matches.forEach((k, idx) => {
        const item = dropdown.createDiv({ cls: "ft-pill-item", text: k });
        dropdownItems.push(item);

        item.addEventListener("mouseenter", () => {
          updateSelection(idx);
        });

        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          this.addProp(k);
          closeDropdown();
        });
      });

      selectedIndex = 0;
      updateSelection(0);
    };

    this.input.addEventListener("input", (e) => {
      showDropdown(e.target.value);
    });

    this.input.addEventListener("focus", (e) => {
      showDropdown(e.target.value);
    });

    this.input.addEventListener("blur", () => {
      setTimeout(closeDropdown, 200);
    });

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        if (dropdown && dropdownItems.length > 0) {
          e.preventDefault();
          const next = (selectedIndex + 1) % dropdownItems.length;
          updateSelection(next);
        } else {
          showDropdown(this.input.value);
        }
      } else if (e.key === "ArrowUp") {
        if (dropdown && dropdownItems.length > 0) {
          e.preventDefault();
          const prev = (selectedIndex - 1 + dropdownItems.length) % dropdownItems.length;
          updateSelection(prev);
        }
      } else if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
        if (dropdown && selectedIndex >= 0 && selectedIndex < dropdownItems.length) {
          e.preventDefault();
          this.addProp(dropdownItems[selectedIndex].textContent);
          closeDropdown();
        } else {
          const val = this.input.value.replace(/,/g, "").trim();
          if (val) {
            e.preventDefault();
            this.addProp(val);
            closeDropdown();
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeDropdown();
        this.input.blur();
      } else if (e.key === "Backspace" && !this.input.value && this.props.length > 0) {
        e.preventDefault();
        this.props.pop();
        this.onChange(this.props);
        this.render();
        this.input.focus({ preventScroll: true });
      }
    });

    this.containerEl.addEventListener("click", () => {
      this.input.focus({ preventScroll: true });
    });
  }

  addProp(name) {
    const clean = name.trim();
    if (!clean) return;
    if (!this.props.some(p => p.toLowerCase() === clean.toLowerCase())) {
      this.props.push(clean);
      this.onChange(this.props);
      this.render();
      this.input.focus({ preventScroll: true });
    }
  }

  setProps(newProps) {
    this.props = Array.isArray(newProps) ? [...newProps] : [];
    this.render();
  }
}

/* ═════════════════════════ RELATION GRAPH VIEW ═════════════════════════ */

class RelationGraphView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;

    // View state
    this.baseKey = this.plugin.settings.rpg_basePropertyName || this.plugin.settings.basePropertyName || "";
    this.selectedBaseVal = this.plugin.settings.rpg_defaultBaseValue || this.plugin.settings.defaultBaseValue || "";
    this.personA = "";
    this.personB = "";

    this.paths = [];
    this.currentPathIndex = 0;
    this.graphData = { nodes: [], edges: [], edgeElements: [], nodeElements: [] };

    // Pan / Zoom transform
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;

    // Silky Smooth Physics Animation
    this.alpha = 0;
    this.animFrameId = null;
    this.draggedNode = null;
    this.dragStartPos = { x: 0, y: 0 };
  }

  getViewType() { return RELATION_GRAPH_VIEW_TYPE; }
  getDisplayText() { return "Relationship Path Graph"; }
  getIcon() { return "git-fork"; }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("rpg-view-container");

    this.renderControlBar(contentEl);
    this.renderGraphCanvas(contentEl);

    this.refreshBaseDropdown();
  }

  onClose() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }

  renderControlBar(parentEl) {
    this.controlBar = parentEl.createDiv({ cls: "rpg-control-bar" });

    // ── Row 1: Base Property Key, Base Filter Value, Excluded Properties Pills ──
    const row1 = this.controlBar.createDiv({ cls: "rpg-control-row" });

    // Step 1: Base Property Key
    const baseKeyGrp = row1.createDiv({ cls: "rpg-field-group" });
    baseKeyGrp.createEl("label", { text: "Base Property:" });
    this.baseKeyInput = baseKeyGrp.createEl("input", {
      type: "text",
      cls: "rpg-input-base-key",
      placeholder: "",
      value: this.baseKey,
    });
    new VaultPropertySuggest(this.app, this.baseKeyInput, async val => {
      this.baseKey = val.trim();
      this.plugin.settings.rpg_basePropertyName = this.baseKey;
      this.plugin.settings.rpg_basePropertyName = this.baseKey;
      this.plugin.settings.basePropertyName = this.baseKey;
      await this.plugin.saveSettings();
      this.refreshBaseDropdown();
    });
    this.baseKeyInput.addEventListener("change", async e => {
      this.baseKey = e.target.value.trim();
      this.plugin.settings.basePropertyName = this.baseKey;
      await this.plugin.saveSettings();
      this.refreshBaseDropdown();
    });

    // Step 2: Base Filter Value text input with autocomplete
    const baseValGrp = row1.createDiv({ cls: "rpg-field-group" });
    baseValGrp.createEl("label", { text: "Base Value:" });
    this.baseValInput = baseValGrp.createEl("input", {
      type: "text",
      cls: "rpg-input-base-val",
      value: this.selectedBaseVal || "",
      placeholder: "",
    });
    this.setupAutocomplete(
      this.baseValInput,
      baseValGrp,
      async name => {
        this.selectedBaseVal = name.trim();
        this.baseValInput.value = this.selectedBaseVal;
        this.plugin.settings.rpg_defaultBaseValue = this.selectedBaseVal;
        this.plugin.settings.defaultBaseValue = this.selectedBaseVal;
        await this.plugin.saveSettings();
        this.personAInput.value = "";
        this.personBInput.value = "";
        this.personA = "";
        this.personB = "";
        this.paths = [];
        this.updateGraph();
      },
      () => {
        const k = (this.baseKey || "").trim() || "base";
        const vals = getVaultBaseValues(this.app, k);
        return vals.length ? vals : getVaultBaseValues(this.app, "base");
      }
    );
    this.baseValInput.addEventListener("input", async e => {
      this.selectedBaseVal = e.target.value.trim();
      this.plugin.settings.rpg_defaultBaseValue = this.selectedBaseVal;
      this.plugin.settings.defaultBaseValue = this.selectedBaseVal;
      await this.plugin.saveSettings();
      this.personAInput.value = "";
      this.personBInput.value = "";
      this.personA = "";
      this.personB = "";
      this.paths = [];
      this.updateGraph();
    });

    // Step 3: Excluded Properties (Visual Pill Tag Selector)
    const exclGrp = row1.createDiv({ cls: "rpg-field-group", attr: { style: "flex: 1;" } });
    exclGrp.createEl("label", { text: "Exclude Properties:" });
    const pillBox = exclGrp.createDiv({ attr: { style: "flex: 1;" } });
    this.pillSelector = new RPGPropertyPillSelector(
      pillBox,
      this.plugin.getExcludedPropertiesList(),
      this.app,
      async updatedList => {
        this.plugin.settings.rpg_excludedProperties = updatedList;
        this.plugin.settings.excludedProperties = updatedList;
        await this.plugin.saveSettings();
        this.updateGraph();
      }
    );

    // ── Row 2: Person A, Swap, Person B, Action Buttons ──
    const row2 = this.controlBar.createDiv({ cls: "rpg-control-row" });

    // Step 4: Person A
    const personAGrp = row2.createDiv({ cls: "rpg-field-group" });
    personAGrp.createEl("label", { text: "Person A:" });
    this.personAInput = personAGrp.createEl("input", {
      type: "text",
      cls: "rpg-input-person",
      placeholder: "",
    });
    this.setupAutocomplete(this.personAInput, personAGrp, name => {
      this.personA = name;
      this.personAInput.value = name;
      if (this.personA && this.personB) this.findAndDisplayPaths();
    });

    // Swap button
    const swapBtn = row2.createEl("button", { cls: "rpg-swap-btn", title: "Swap A and B", text: "⇄" });
    swapBtn.addEventListener("click", () => {
      const temp = this.personA;
      this.personA = this.personB;
      this.personB = temp;
      this.personAInput.value = this.personA;
      this.personBInput.value = this.personB;
      if (this.personA && this.personB) this.findAndDisplayPaths();
    });

    // Step 4: Person B
    const personBGrp = row2.createDiv({ cls: "rpg-field-group" });
    personBGrp.createEl("label", { text: "Person B:" });
    this.personBInput = personBGrp.createEl("input", {
      type: "text",
      cls: "rpg-input-person",
      placeholder: "",
    });
    this.setupAutocomplete(this.personBInput, personBGrp, name => {
      this.personB = name;
      this.personBInput.value = name;
      if (this.personA && this.personB) this.findAndDisplayPaths();
    });

    // Trace Path button
    const traceBtn = row2.createEl("button", { cls: "mod-cta", text: "Trace Relationship" });
    traceBtn.addEventListener("click", () => this.findAndDisplayPaths());

    // Reset button
    const resetBtn = row2.createEl("button", { text: "Clear" });
    resetBtn.addEventListener("click", () => {
      this.personA = "";
      this.personB = "";
      this.personAInput.value = "";
      this.personBInput.value = "";
      this.paths = [];
      this.updateGraph();
    });

    // ── Row 3: Status / Stepper & Zoom Controls ──
    this.statusBar = this.controlBar.createDiv({ cls: "rpg-status-bar" });

    this.stepperEl = this.statusBar.createDiv({ cls: "rpg-stepper" });
    this.prevBtn = this.stepperEl.createEl("button", { cls: "rpg-stepper-btn", text: "◀ Prev" });
    this.prevBtn.disabled = true;
    this.prevBtn.addEventListener("click", () => this.changePath(-1));

    this.pathLabelEl = this.stepperEl.createSpan({ text: "Select Person A & B to trace relationship." });

    this.nextBtn = this.stepperEl.createEl("button", { cls: "rpg-stepper-btn", text: "Next ▶" });
    this.nextBtn.disabled = true;
    this.nextBtn.addEventListener("click", () => this.changePath(1));

    this.breadcrumbEl = this.statusBar.createDiv({ cls: "rpg-breadcrumb" });

    const viewOpts = this.statusBar.createDiv({ cls: "rpg-view-options" });
    const zoomInBtn = viewOpts.createEl("button", { cls: "rpg-zoom-btn", text: "+" });
    zoomInBtn.addEventListener("click", () => this.applyZoom(1.2));
    const zoomOutBtn = viewOpts.createEl("button", { cls: "rpg-zoom-btn", text: "−" });
    zoomOutBtn.addEventListener("click", () => this.applyZoom(0.8));
    const resetZoomBtn = viewOpts.createEl("button", { cls: "rpg-zoom-btn", text: "Reset View" });
    resetZoomBtn.addEventListener("click", () => this.resetView());
  }

  renderGraphCanvas(parentEl) {
    this.canvasWrapper = parentEl.createDiv({ cls: "rpg-canvas-wrapper" });

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.classList.add("rpg-svg");
    this.canvasWrapper.appendChild(this.svg);

    // Viewport group for Pan / Zoom
    this.viewport = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.viewport.classList.add("rpg-viewport");
    this.svg.appendChild(this.viewport);

    this.edgesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.viewport.appendChild(this.edgesGroup);

    this.nodesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.viewport.appendChild(this.nodesGroup);

    // Empty state notice
    this.emptyState = this.canvasWrapper.createDiv({
      cls: "rpg-empty-state",
      text: "Select a Base and enter Person A & Person B to view their relationship chain.",
    });

    // Tooltip
    this.tooltip = this.canvasWrapper.createDiv({ cls: "rpg-tooltip" });

    // Pan & Zoom Event Listeners
    this.canvasWrapper.addEventListener("wheel", e => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
      this.applyZoom(zoomFactor, e.clientX, e.clientY);
    });

    this.canvasWrapper.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      if (e.target.closest(".rpg-node")) return;
      this.isPanning = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
    });

    window.addEventListener("mousemove", e => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
      } else if (this.draggedNode) {
        // Dragging a node in canvas space
        const p = this.screenToCanvasPoint(e.clientX, e.clientY);
        this.draggedNode.x = p.x;
        this.draggedNode.y = p.y;
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;
        this.wakeSimulation(0.3);
      }
    });

    window.addEventListener("mouseup", () => {
      this.isPanning = false;
      this.draggedNode = null;
    });
  }

  screenToCanvasPoint(clientX, clientY) {
    const rect = this.canvasWrapper.getBoundingClientRect();
    const x = (clientX - rect.left - this.panX) / this.zoom;
    const y = (clientY - rect.top - this.panY) / this.zoom;
    return { x, y };
  }

  /* ─── Autocomplete logic ─── */

  setupAutocomplete(inputEl, containerEl, onSelect, getCustomMatches = null) {
    let popup = null;
    let selectedIndex = -1;
    let popupItems = [];

    const closePopup = () => {
      if (popup) { popup.remove(); popup = null; }
      selectedIndex = -1;
      popupItems = [];
    };

    const updateSelection = idx => {
      popupItems.forEach((el, i) => {
        if (i === idx) {
          el.classList.add("is-selected");
          el.scrollIntoView({ block: "nearest" });
        } else {
          el.classList.remove("is-selected");
        }
      });
      selectedIndex = idx;
    };

    const showMatches = query => {
      closePopup();
      const q = (query || "").toLowerCase().trim();
      let allItems = [];
      if (typeof getCustomMatches === "function") {
        allItems = getCustomMatches() || [];
      } else {
        allItems = this.getFilesMatchingBase().map(f => f.basename);
      }
      const matches = allItems
        .filter(name => !q || String(name).toLowerCase().includes(q))
        .slice(0, 20);

      if (!matches.length) return;

      popup = containerEl.createDiv({ cls: "rpg-suggest-popup" });
      popupItems = [];
      matches.forEach((name, idx) => {
        const item = popup.createDiv({ cls: "rpg-suggest-item", text: name });
        popupItems.push(item);

        item.addEventListener("mouseenter", () => {
          updateSelection(idx);
        });

        item.addEventListener("mousedown", e => {
          e.preventDefault();
          onSelect(name);
          closePopup();
        });
      });

      selectedIndex = 0;
      updateSelection(0);
    };

    inputEl.addEventListener("input", e => {
      showMatches(e.target.value);
    });

    inputEl.addEventListener("focus", e => {
      showMatches(e.target.value);
    });

    inputEl.addEventListener("blur", () => {
      setTimeout(closePopup, 200);
    });

    inputEl.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") {
        if (popup && popupItems.length > 0) {
          e.preventDefault();
          const next = (selectedIndex + 1) % popupItems.length;
          updateSelection(next);
        } else {
          showMatches(inputEl.value);
        }
      } else if (e.key === "ArrowUp") {
        if (popup && popupItems.length > 0) {
          e.preventDefault();
          const prev = (selectedIndex - 1 + popupItems.length) % popupItems.length;
          updateSelection(prev);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (popup && selectedIndex >= 0 && selectedIndex < popupItems.length) {
          onSelect(popupItems[selectedIndex].textContent);
          closePopup();
        } else if (inputEl.value.trim()) {
          onSelect(inputEl.value.trim());
          closePopup();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePopup();
      }
    });
  }

  /* ─── Base discovery ─── */

  refreshBaseDropdown() {
    if (this.baseValInput) {
      this.baseValInput.value = this.selectedBaseVal || "";
    }
    this.updateGraph();
  }

  getFilesMatchingBase() {
    const k = (this.baseKey || "").toLowerCase();
    const targetVal = (this.selectedBaseVal || "").toLowerCase();
    const result = [];

    for (const f of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(f);
      if (!cache || !cache.frontmatter) continue;
      const realKey = Object.keys(cache.frontmatter).find(key => key.toLowerCase() === k);
      if (!realKey) continue;
      const v = cache.frontmatter[realKey];
      const items = Array.isArray(v) ? v : [v];
      const hasBase = items.some(item => {
        if (!item) return false;
        const bName = bare(typeof item === "string" ? item : (item.link || ""));
        return bName.toLowerCase() === targetVal;
      });
      if (hasBase) result.push(f);
    }
    return result;
  }

  getExcludedPropertiesSet() {
    const list = this.plugin.getExcludedPropertiesList();
    return new Set(list.map(s => s.trim().toLowerCase()).filter(Boolean));
  }

  /* ─── Graph Construction & Pathfinding (Point 1: Deduplication) ─── */

  buildGraphData() {
    const baseFiles = this.getFilesMatchingBase();
    const fileSet = new Map();
    baseFiles.forEach(f => fileSet.set(f.basename.toLowerCase(), f));

    const excluded = this.getExcludedPropertiesSet();
    const nodes = [];
    const nodeMap = new Map();
    const edges = [];
    const edgeKeySet = new Set();

    const count = baseFiles.length;
    baseFiles.forEach((f, idx) => {
      const angle = (idx / Math.max(count, 1)) * 2 * Math.PI;
      const rad = 140 + Math.random() * 80;
      const node = {
        id: f.basename,
        file: f,
        x: Math.cos(angle) * rad,
        y: Math.sin(angle) * rad,
        vx: 0,
        vy: 0,
        isEndpoint: false,
        isIntermediate: false,
        isDimmed: true,
      };
      nodes.push(node);
      nodeMap.set(f.basename.toLowerCase(), node);
    });

    // Build edges from all non-excluded properties
    for (const f of baseFiles) {
      const cache = this.app.metadataCache.getFileCache(f);
      if (!cache || !cache.frontmatter) continue;

      for (const propKey of Object.keys(cache.frontmatter)) {
        if (propKey === "position") continue;
        if (excluded.has(propKey.toLowerCase())) continue;

        const linkedNames = linksUnderProp(cache, propKey);
        for (const targetName of linkedNames) {
          const targetLower = targetName.toLowerCase();
          if (fileSet.has(targetLower) && targetLower !== f.basename.toLowerCase()) {
            const edgeKey = `${f.basename.toLowerCase()}->${targetLower}:${propKey.toLowerCase()}`;
            if (!edgeKeySet.has(edgeKey)) {
              edgeKeySet.add(edgeKey);
              edges.push({
                sourceId: f.basename,
                targetId: fileSet.get(targetLower).basename,
                propKey: propKey,
                isActivePath: false,
              });
            }
          }
        }
      }
    }

    return { nodes, nodeMap, edges, edgeElements: [], nodeElements: [] };
  }

  findPaths(graph, startName, endName) {
    const sLower = bare(startName || "").toLowerCase().trim();
    const eLower = bare(endName || "").toLowerCase().trim();
    if (!sLower || !eLower) return [];
    if (!graph.nodeMap.has(sLower) || !graph.nodeMap.has(eLower)) return [];

    // Map each node to its unique neighbors and the properties connecting them
    const adj = new Map();
    for (const n of graph.nodes) {
      adj.set(n.id.toLowerCase(), new Map());
    }

    for (const e of graph.edges) {
      const s = e.sourceId.toLowerCase();
      const t = e.targetId.toLowerCase();
      if (!adj.has(s) || !adj.has(t)) continue;

      // s -> t (forward link)
      if (!adj.get(s).has(t)) {
        adj.get(s).set(t, { forwardProps: [], reverseProps: [] });
      }
      adj.get(s).get(t).forwardProps.push(e.propKey);

      // t -> s (reverse link)
      if (!adj.get(t).has(s)) {
        adj.get(t).set(s, { forwardProps: [], reverseProps: [] });
      }
      adj.get(t).get(s).reverseProps.push(e.propKey);
    }

    // BFS with unique neighbor traversal & deduplication
    const queue = [[{ node: sLower, edgeProp: null }]];
    const foundPaths = [];
    const seenNodeSequences = new Set();
    const maxPaths = 5;
    let iterations = 0;
    const maxIterations = 10000;

    while (queue.length > 0 && iterations++ < maxIterations) {
      const path = queue.shift();
      const lastNode = path[path.length - 1].node;

      if (lastNode === eLower) {
        const seqKey = path.map(step => step.node).join("->");
        if (!seenNodeSequences.has(seqKey)) {
          seenNodeSequences.add(seqKey);
          foundPaths.push(path);
          if (foundPaths.length >= maxPaths) break;
        }
        continue;
      }

      // Allow up to 12 degrees of relationship
      if (path.length > 12) continue;

      const neighborMap = adj.get(lastNode);
      if (!neighborMap) continue;

      for (const [neighbor, edgeInfo] of neighborMap.entries()) {
        if (!path.some(step => step.node === neighbor)) {
          // Prefer direct forward relationship property, fall back to reverse property
          const bestProp = edgeInfo.forwardProps[0] || edgeInfo.reverseProps[0] || "related";
          queue.push([...path, { node: neighbor, edgeProp: bestProp }]);
        }
      }
    }

    return foundPaths;
  }

  findAndDisplayPaths() {
    this.personA = bare(this.personAInput.value).trim();
    this.personB = bare(this.personBInput.value).trim();

    if (!this.personA || !this.personB) {
      new obsidian.Notice("Please enter both Person A and Person B.");
      return;
    }

    this.graphData = this.buildGraphData();
    this.paths = this.findPaths(this.graphData, this.personA, this.personB);
    this.currentPathIndex = 0;

    if (!this.paths.length) {
      this.pathLabelEl.setText(`No connection found between "${this.personA}" and "${this.personB}".`);
      this.breadcrumbEl.empty();
      this.prevBtn.disabled = true;
      this.nextBtn.disabled = true;
    } else {
      this.updatePathDisplay();
    }

    this.renderGraph();
  }

  changePath(delta) {
    if (!this.paths.length) return;
    this.currentPathIndex = (this.currentPathIndex + delta + this.paths.length) % this.paths.length;
    this.updatePathDisplay();
    this.renderGraph();
  }

  updatePathDisplay() {
    const total = this.paths.length;
    const idx = this.currentPathIndex;
    const isShortest = idx === 0 ? " (Shortest)" : "";
    this.pathLabelEl.setText(`Path ${idx + 1} of ${total}${isShortest}`);

    this.prevBtn.disabled = total <= 1;
    this.nextBtn.disabled = total <= 1;

    // Breadcrumb
    this.breadcrumbEl.empty();
    const activePath = this.paths[idx];
    activePath.forEach((step, i) => {
      if (i > 0) {
        const edgeSpan = this.breadcrumbEl.createSpan({ cls: "rpg-breadcrumb-edge" });
        edgeSpan.setText(` ── ${step.edgeProp} ➔ `);
      }
      const nodeSpan = this.breadcrumbEl.createSpan({ cls: "rpg-breadcrumb-node" });
      const origNode = this.graphData.nodeMap.get(step.node);
      nodeSpan.setText(origNode ? origNode.id : step.node);
    });
  }

  updateGraph() {
    this.graphData = this.buildGraphData();
    if (this.personA && this.personB) {
      this.paths = this.findPaths(this.graphData, this.personA, this.personB);
      this.currentPathIndex = 0;
      if (this.paths.length) this.updatePathDisplay();
    }
    this.renderGraph();
  }

  /* ─── SVG Rendering & Silky-Smooth Animation Loop (Point 3) ─── */

  renderGraph() {
    const { nodes, nodeMap, edges } = this.graphData;
    this.edgesGroup.innerHTML = "";
    this.nodesGroup.innerHTML = "";
    this.graphData.edgeElements = [];
    this.graphData.nodeElements = [];

    if (!nodes.length) {
      this.emptyState.style.display = "block";
      this.emptyState.setText(`No notes found in Base "${this.selectedBaseVal}".`);
      return;
    }
    this.emptyState.style.display = "none";

    const activePath = this.paths[this.currentPathIndex] || null;
    const pathNodeSet = new Set();
    const pathEdgesSet = new Set();

    if (activePath) {
      activePath.forEach(s => pathNodeSet.add(s.node));
      for (let i = 0; i < activePath.length - 1; i++) {
        const u = activePath[i].node;
        const v = activePath[i + 1].node;
        pathEdgesSet.add(`${u}->${v}`);
        pathEdgesSet.add(`${v}->${u}`);
      }
    }

    const sLower = this.personA.toLowerCase();
    const eLower = this.personB.toLowerCase();

    for (const node of nodes) {
      const nLower = node.id.toLowerCase();
      if (nLower === sLower || nLower === eLower) {
        node.isEndpoint = true;
        node.isIntermediate = false;
        node.isDimmed = false;
      } else if (pathNodeSet.has(nLower)) {
        node.isEndpoint = false;
        node.isIntermediate = true;
        node.isDimmed = false;
      } else {
        node.isEndpoint = false;
        node.isIntermediate = false;
        node.isDimmed = true;
      }
    }

    for (const edge of edges) {
      const u = edge.sourceId.toLowerCase();
      const v = edge.targetId.toLowerCase();
      edge.isActivePath = pathEdgesSet.has(`${u}->${v}`);
    }

    // ── 1. Render Background Edges ──
    for (const edge of edges) {
      const srcNode = nodeMap.get(edge.sourceId.toLowerCase());
      const tgtNode = nodeMap.get(edge.targetId.toLowerCase());
      if (!srcNode || !tgtNode) continue;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", srcNode.x);
      line.setAttribute("y1", srcNode.y);
      line.setAttribute("x2", tgtNode.x);
      line.setAttribute("y2", tgtNode.y);
      line.setAttribute("stroke", "var(--text-faint, #666666)");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-opacity", "0.25");
      line.style.stroke = "var(--text-faint, #666666)";
      line.style.strokeWidth = "1px";
      line.style.opacity = "0.25";
      line.classList.add("rpg-edge-bg");
      this.edgesGroup.appendChild(line);

      this.graphData.edgeElements.push({ line, textEl: null, srcNode, tgtNode, isActive: false });
    }

    // ── 2. Render Active Path Glowing Lines (Directly from activePath) ──
    if (activePath && activePath.length > 1) {
      for (let i = 0; i < activePath.length - 1; i++) {
        const u = activePath[i].node;
        const v = activePath[i + 1].node;
        const srcNode = nodeMap.get(u);
        const tgtNode = nodeMap.get(v);
        if (!srcNode || !tgtNode) continue;

        // Halo glow line underneath
        const haloLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        haloLine.setAttribute("x1", srcNode.x);
        haloLine.setAttribute("y1", srcNode.y);
        haloLine.setAttribute("x2", tgtNode.x);
        haloLine.setAttribute("y2", tgtNode.y);
        haloLine.setAttribute("stroke", "#00f0ff");
        haloLine.setAttribute("stroke-width", "7");
        haloLine.setAttribute("stroke-opacity", "0.35");
        haloLine.setAttribute("stroke-linecap", "round");
        haloLine.style.stroke = "#00f0ff";
        haloLine.style.strokeWidth = "7px";
        haloLine.style.opacity = "0.35";
        haloLine.classList.add("rpg-edge-halo");
        this.edgesGroup.appendChild(haloLine);

        // Core glowing connection line
        const activeLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        activeLine.setAttribute("x1", srcNode.x);
        activeLine.setAttribute("y1", srcNode.y);
        activeLine.setAttribute("x2", tgtNode.x);
        activeLine.setAttribute("y2", tgtNode.y);
        activeLine.setAttribute("stroke", "#00f0ff");
        activeLine.setAttribute("stroke-width", "3");
        activeLine.setAttribute("stroke-linecap", "round");
        activeLine.setAttribute("stroke-dasharray", "8, 4");
        activeLine.setAttribute("filter", "drop-shadow(0 0 6px #00f0ff)");
        activeLine.style.stroke = "#00f0ff";
        activeLine.style.strokeWidth = "3px";
        activeLine.classList.add("rpg-edge-active");
        this.edgesGroup.appendChild(activeLine);

        // Sleek relationship label on the line
        const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
        textEl.classList.add("rpg-edge-label-text");
        textEl.setAttribute("x", (srcNode.x + tgtNode.x) / 2);
        textEl.setAttribute("y", (srcNode.y + tgtNode.y) / 2 - 8);
        textEl.setAttribute("fill", "#00f0ff");
        textEl.setAttribute("font-size", "11");
        textEl.setAttribute("font-weight", "600");
        textEl.setAttribute("text-anchor", "middle");
        textEl.style.fill = "#00f0ff";
        textEl.style.fontSize = "11px";
        textEl.textContent = activePath[i + 1].edgeProp || "";
        this.edgesGroup.appendChild(textEl);

        this.graphData.edgeElements.push({
          line: haloLine,
          textEl: null,
          srcNode,
          tgtNode,
          isActive: true
        });

        this.graphData.edgeElements.push({
          line: activeLine,
          textEl,
          srcNode,
          tgtNode,
          isActive: true
        });
      }
    }

    // ── 3. Render Nodes (Small, sleek native Obsidian dots with Dragging) ──
    for (const node of nodes) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add("rpg-node");
      g.setAttribute("transform", `translate(${node.x}, ${node.y})`);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.textContent = node.id;

      if (node.isEndpoint) {
        g.classList.add("rpg-node-endpoint");
        circle.setAttribute("r", 7.5);
        circle.setAttribute("fill", "#00f0ff");
        circle.setAttribute("stroke", "#ffffff");
        circle.setAttribute("stroke-width", "2");
        circle.setAttribute("filter", "drop-shadow(0 0 6px #00f0ff)");
        text.setAttribute("y", 16);
      } else if (node.isIntermediate) {
        g.classList.add("rpg-node-intermediate");
        circle.setAttribute("r", 6.0);
        circle.setAttribute("fill", "#818cf8");
        circle.setAttribute("stroke", "#c7d2fe");
        circle.setAttribute("stroke-width", "1.5");
        circle.setAttribute("filter", "drop-shadow(0 0 4px rgba(129, 140, 248, 0.6))");
        text.setAttribute("y", 14);
      } else {
        g.classList.add("rpg-node-bg");
        circle.setAttribute("r", 4.5);
        circle.setAttribute("fill", "var(--text-faint, #666666)");
        circle.setAttribute("opacity", "0.45");
        text.setAttribute("y", 12);
      }

      g.appendChild(circle);
      g.appendChild(text);

      // Node Interactions (Point 2: Left-click and move drags, Right-click opens context menu, Double-click opens note)
      g.addEventListener("mousedown", e => {
        if (e.button === 0) {
          // Left click: start dragging node
          e.stopPropagation();
          this.draggedNode = node;
          this.dragStartPos = { x: e.clientX, y: e.clientY };
          this.wakeSimulation(0.35);
        }
      });

      g.addEventListener("dblclick", e => {
        e.stopPropagation();
        this.app.workspace.openLinkText(node.id, "");
      });

      g.addEventListener("contextmenu", e => {
        e.preventDefault();
        e.stopPropagation();
        this.showNodeContextMenu(node, e);
      });

      g.addEventListener("mouseenter", e => this.showTooltip(node, e));
      g.addEventListener("mousemove", e => this.moveTooltip(e));
      g.addEventListener("mouseleave", () => this.hideTooltip());

      this.nodesGroup.appendChild(g);
      this.graphData.nodeElements.push({ g, node });
    }

    // Pre-relaxation pass: untangle layout before camera centers
    for (let step = 0; step < 60; step++) {
      this.computePhysics(0.25);
    }

    // Auto-fit camera to framed graph
    this.autoFitView(nodes, activePath);

    // Start 60fps physics simulation for silky smooth dragging & micro-settling
    this.wakeSimulation(0.6);
  }

  computePhysics(alpha) {
    const { nodes, nodeMap, edges } = this.graphData;
    const repulseK = 22000;
    const springLen = 140;
    const minDistance = 70;

    // 1. Repulsion & Collision barrier
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;

        if (dist < minDistance) {
          let push = (minDistance - dist) * 0.25 * alpha;
          let px = (dx / dist) * push;
          let py = (dy / dist) * push;
          if (a !== this.draggedNode) { a.x -= px; a.y -= py; }
          if (b !== this.draggedNode) { b.x += px; b.y += py; }
        }

        let force = (repulseK / (dist * dist + 150)) * alpha;
        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;
        if (a !== this.draggedNode) { a.vx -= fx; a.vy -= fy; }
        if (b !== this.draggedNode) { b.vx += fx; b.vy += fy; }
      }
    }

    // 2. Spring attraction
    for (const e of edges) {
      const a = nodeMap.get(e.sourceId.toLowerCase());
      const b = nodeMap.get(e.targetId.toLowerCase());
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let force = (dist - springLen) * 0.05 * alpha;
      let fx = (dx / dist) * force;
      let fy = (dy / dist) * force;
      if (a !== this.draggedNode) { a.vx += fx; a.vy += fy; }
      if (b !== this.draggedNode) { b.vx += fx; b.vy += fy; }
    }

    // 3. Apply velocities & damping
    for (const n of nodes) {
      if (n === this.draggedNode) continue;
      n.vx -= n.x * 0.005 * alpha;
      n.vy -= n.y * 0.005 * alpha;
      n.x += n.vx * 0.8;
      n.y += n.vy * 0.8;
      n.vx *= 0.82;
      n.vy *= 0.82;
    }
  }

  wakeSimulation(alphaBoost = 0.5) {
    this.alpha = Math.max(this.alpha || 0, alphaBoost);
    if (!this.animFrameId) {
      this.animFrameId = requestAnimationFrame(this.stepSimulation.bind(this));
    }
  }

  stepSimulation() {
    if (this.alpha <= 0.003 && !this.draggedNode) {
      this.animFrameId = null;
      return;
    }

    this.computePhysics(this.alpha);

    const { nodeElements, edgeElements } = this.graphData;

    // 4. Update SVG positions smoothly
    for (const el of nodeElements) {
      el.g.setAttribute("transform", `translate(${el.node.x}, ${el.node.y})`);
    }

    for (const el of edgeElements) {
      el.line.setAttribute("x1", el.srcNode.x);
      el.line.setAttribute("y1", el.srcNode.y);
      el.line.setAttribute("x2", el.tgtNode.x);
      el.line.setAttribute("y2", el.tgtNode.y);

      if (el.textEl && el.isActive) {
        const midX = (el.srcNode.x + el.tgtNode.x) / 2;
        const midY = (el.srcNode.y + el.tgtNode.y) / 2;
        el.textEl.setAttribute("x", midX);
        el.textEl.setAttribute("y", midY - 8);
      }
    }

    // Decay energy
    if (!this.draggedNode) {
      this.alpha *= 0.985;
    }

    this.animFrameId = requestAnimationFrame(this.stepSimulation.bind(this));
  }

  autoFitView(nodes, activePath) {
    const width = this.canvasWrapper.clientWidth || 800;
    const height = this.canvasWrapper.clientHeight || 600;

    let targetNodes = nodes;
    if (activePath && activePath.length > 0) {
      const activeIds = new Set(activePath.map(s => s.node));
      const filtered = nodes.filter(n => activeIds.has(n.id.toLowerCase()));
      if (filtered.length) targetNodes = filtered;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of targetNodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    const boundW = Math.max(maxX - minX + 240, 320);
    const boundH = Math.max(maxY - minY + 240, 320);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const scaleX = width / boundW;
    const scaleY = height / boundH;
    this.zoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.5), 1.6);

    this.panX = (width / 2) - (midX * this.zoom);
    this.panY = (height / 2) - (midY * this.zoom);
    this.updateTransform();
  }

  applyZoom(factor, clientX = null, clientY = null) {
    const oldZoom = this.zoom;
    this.zoom = Math.min(Math.max(this.zoom * factor, 0.25), 4.0);

    const rect = this.canvasWrapper.getBoundingClientRect();
    const cx = clientX != null ? clientX - rect.left : rect.width / 2;
    const cy = clientY != null ? clientY - rect.top : rect.height / 2;

    this.panX = cx - ((cx - this.panX) * (this.zoom / oldZoom));
    this.panY = cy - ((cy - this.panY) * (this.zoom / oldZoom));
    this.updateTransform();
  }

  resetView() {
    this.autoFitView(this.graphData.nodes, this.paths[this.currentPathIndex]);
  }

  updateTransform() {
    this.viewport.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
  }

  /* ─── Context Menu & Tooltips (Point 2: Show Edit Option on Right Click) ─── */

  showNodeContextMenu(node, event) {
    const menu = new obsidian.Menu();

    // 1. Edit / Open note
    menu.addItem(item => {
      item.setTitle("Edit / Open note")
        .setIcon("edit")
        .onClick(() => this.app.workspace.openLinkText(node.id, ""));
    });

    // 2. Open note in new tab
    menu.addItem(item => {
      item.setTitle("Open in new tab")
        .setIcon("external-link")
        .onClick(() => this.app.workspace.openLinkText(node.id, "", "tab"));
    });

    menu.addSeparator();

    // 3. Set as Person A / B
    menu.addItem(item => {
      item.setTitle(`Set "${node.id}" as Person A`)
        .setIcon("arrow-right-circle")
        .onClick(() => {
          this.personA = node.id;
          this.personAInput.value = node.id;
          if (this.personA && this.personB) this.findAndDisplayPaths();
        });
    });
    menu.addItem(item => {
      item.setTitle(`Set "${node.id}" as Person B`)
        .setIcon("arrow-left-circle")
        .onClick(() => {
          this.personB = node.id;
          this.personBInput.value = node.id;
          if (this.personA && this.personB) this.findAndDisplayPaths();
        });
    });

    menu.showAtMouseEvent(event);
  }

  showTooltip(node, event) {
    const cache = this.app.metadataCache.getFileCache(node.file);
    const fm = cache?.frontmatter || {};

    let html = `<h4>${node.id}</h4>`;
    const keys = Object.keys(fm).filter(k => k !== "position").slice(0, 6);
    for (const k of keys) {
      let val = fm[k];
      if (typeof val === "object") val = JSON.stringify(val);
      html += `<div class="rpg-tooltip-prop"><strong>${k}:</strong> ${val}</div>`;
    }

    this.tooltip.innerHTML = html;
    this.tooltip.style.display = "block";
    this.moveTooltip(event);
  }

  moveTooltip(event) {
    const rect = this.canvasWrapper.getBoundingClientRect();
    const x = event.clientX - rect.left + 15;
    const y = event.clientY - rect.top + 15;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  hideTooltip() {
    this.tooltip.style.display = "none";
  }
}

/* ═════════════════════════ FAMILY TREE VIEW ═════════════════════════ */

class FamilyTreeView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.baseProperty = this.plugin.settings.ft_basePropertyName || this.plugin.settings.basePropertyName || "";
    this.baseFilterValue = this.plugin.settings.ft_defaultBaseValue || this.plugin.settings.defaultBaseValue || "ALL";
    this.excludeProperty = this.plugin.settings.ft_excludePropertyName || this.plugin.settings.excludePropertyName || "(None)";
    this.excludeValues = Array.isArray(this.plugin.settings.ft_excludeValues || this.plugin.settings.excludeValues) ? [...(this.plugin.settings.ft_excludeValues || this.plugin.settings.excludeValues)] : [];
    this.selectedCardProps = Array.isArray(this.plugin.settings.ft_selectedCardProps || this.plugin.settings.selectedCardProps) ? [...(this.plugin.settings.ft_selectedCardProps || this.plugin.settings.selectedCardProps)] : [];

    // Viewport transform
    this.zoom = 0.95;
    this.panX = 60;
    this.panY = 30;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;

    // Data structures
    this.people = {};
    this.unions = [];
    this.activeHighlightId = null;
  }

  getCardWidth(person) {
    if (!person) return 154;
    if (person.cardW) return person.cardW;

    const baseMin = 154;
    const name = String(person.name || person.id || "");
    let textWidth = 0;

    try {
      if (!this._measureCtx) {
        const canvas = document.createElement("canvas");
        this._measureCtx = canvas.getContext("2d");
      }
      this._measureCtx.font = "bold 13px sans-serif";
      textWidth = this._measureCtx.measureText(name).width;

      if (this.selectedCardProps && this.selectedCardProps.length > 0 && person.rawFrontmatter) {
        this._measureCtx.font = "11px sans-serif";
        for (const prop of this.selectedCardProps) {
          const val = formatPropertyValue(person.rawFrontmatter[prop]);
          if (val) {
            const propW = this._measureCtx.measureText(`${prop}: ${val}`).width;
            if (propW > textWidth) textWidth = propW;
          }
        }
      }
    } catch (_) {
      textWidth = name.length * 9;
    }

    const fullWidth = Math.ceil(textWidth + 56);
    person.cardW = Math.max(baseMin, fullWidth);
    return person.cardW;
  }

  getEffectiveCardHeight() {
    const propCount = this.selectedCardProps ? this.selectedCardProps.length : 0;
    if (propCount === 0) return 46;
    return 54 + (propCount - 1) * 15;
  }

  getViewType() {
    return FAMILY_TREE_VIEW_TYPE;
  }

  getDisplayText() {
    return "Family Tree Viewer";
  }

  getIcon() {
    return "git-fork";
  }

  async onOpen() {
    this.buildUI();
    this.loadAndRenderTree();
  }

  async onClose() {
    // Cleanup if needed
  }

  buildUI() {
    const root = this.contentEl;
    root.empty();
    root.addClass("family-tree-view-root");

    // ──────────────── Multi-Row Toolbar ────────────────
    const toolbar = root.createDiv({ cls: "ft-toolbar" });

    // Row 1: Base Property & Value | Exclude Property & Value (Left Side)
    const row1 = toolbar.createDiv({ cls: "ft-toolbar-row" });

    const leftGrp1 = row1.createDiv({ cls: "ft-toolbar-left-group" });
    const centerGrp = leftGrp1.createDiv({ cls: "ft-toolbar-center" });

    // Base Property Input with Autocomplete
    const propItem = centerGrp.createDiv({ cls: "ft-filter-item" });
    propItem.createSpan({ cls: "ft-filter-label", text: "Base Property:" });
    this.basePropInput = propItem.createEl("input", {
      type: "text",
      cls: "ft-input-filter",
      value: this.baseProperty || "",
      placeholder: "",
    });
    setupAutocomplete(
      this.basePropInput,
      propItem,
      () => getAllVaultPropertyKeys(this.app),
      async val => {
        this.baseProperty = val.trim();
        this.basePropInput.value = this.baseProperty;
        this.plugin.settings.ft_basePropertyName = this.baseProperty;
        this.plugin.settings.basePropertyName = this.baseProperty;
        await this.plugin.saveSettings();
        this.loadAndRenderTree();
      }
    );
    this.basePropInput.addEventListener("input", async e => {
      this.baseProperty = e.target.value.trim();
      this.plugin.settings.ft_basePropertyName = this.baseProperty;
      this.plugin.settings.basePropertyName = this.baseProperty;
      await this.plugin.saveSettings();
      this.loadAndRenderTree();
    });

    centerGrp.createDiv({ cls: "ft-divider-v" });

    // Base Value Input with Autocomplete
    const valItem = centerGrp.createDiv({ cls: "ft-filter-item" });
    valItem.createSpan({ cls: "ft-filter-label", text: "Base Value:" });
    this.baseValInput = valItem.createEl("input", {
      type: "text",
      cls: "ft-input-filter",
      value: (this.baseFilterValue === "ALL" ? "" : this.baseFilterValue) || "",
      placeholder: "",
    });
    setupAutocomplete(
      this.baseValInput,
      valItem,
      () => {
        const k = (this.baseProperty || "").trim() || "base";
        const vals = getVaultBaseValues(this.app, k);
        return vals.length ? vals : getVaultBaseValues(this.app, "base");
      },
      async val => {
        this.baseFilterValue = val.trim();
        this.baseValInput.value = this.baseFilterValue;
        this.plugin.settings.ft_defaultBaseValue = this.baseFilterValue;
        this.plugin.settings.defaultBaseValue = this.baseFilterValue;
        await this.plugin.saveSettings();
        this.loadAndRenderTree();
      }
    );
    this.baseValInput.addEventListener("input", async e => {
      this.baseFilterValue = e.target.value.trim();
      this.plugin.settings.ft_defaultBaseValue = this.baseFilterValue;
      this.plugin.settings.defaultBaseValue = this.baseFilterValue;
      await this.plugin.saveSettings();
      this.loadAndRenderTree();
    });

    centerGrp.createDiv({ cls: "ft-divider-v" });

    // Exclude Property Input with Autocomplete
    const exclPropItem = centerGrp.createDiv({ cls: "ft-filter-item" });
    exclPropItem.createSpan({ cls: "ft-filter-label", text: "Exclude Prop:" });
    this.excludePropInput = exclPropItem.createEl("input", {
      type: "text",
      cls: "ft-input-filter",
      value: (this.excludeProperty === "(None)" ? "" : this.excludeProperty) || "",
      placeholder: "",
    });
    setupAutocomplete(
      this.excludePropInput,
      exclPropItem,
      () => getAllVaultPropertyKeys(this.app),
      async val => {
        this.excludeProperty = val.trim();
        this.excludePropInput.value = this.excludeProperty;
        this.plugin.settings.ft_excludePropertyName = this.excludeProperty;
        this.plugin.settings.excludePropertyName = this.excludeProperty;
        if (!this.excludeProperty) {
          this.excludeValues = [];
          this.plugin.settings.ft_excludeValues = [];
          this.plugin.settings.excludeValues = [];
          if (this.excludeValPillSelector) this.excludeValPillSelector.setProps([]);
        }
        await this.plugin.saveSettings();
        this.loadAndRenderTree();
      }
    );
    this.excludePropInput.addEventListener("input", async e => {
      this.excludeProperty = e.target.value.trim();
      this.plugin.settings.ft_excludePropertyName = this.excludeProperty;
      this.plugin.settings.excludePropertyName = this.excludeProperty;
      if (!this.excludeProperty) {
        this.excludeValues = [];
        this.plugin.settings.ft_excludeValues = [];
        this.plugin.settings.excludeValues = [];
        if (this.excludeValPillSelector) this.excludeValPillSelector.setProps([]);
      }
      await this.plugin.saveSettings();
      this.loadAndRenderTree();
    });

    centerGrp.createDiv({ cls: "ft-divider-v" });

    // Exclude Value(s) Selector (Multi-Select Pills)
    const exclValItem = centerGrp.createDiv({ cls: "ft-filter-item" });
    exclValItem.createSpan({ cls: "ft-filter-label", text: "Exclude Value(s):" });
    const exclValPillBox = exclValItem.createDiv({ cls: "ft-pill-wrapper" });
    this.excludeValPillSelector = new FTPropertyPillSelector(
      exclValPillBox,
      this.excludeValues,
      () => {
        const k = (this.excludeProperty || "").trim();
        if (!k || k === "(None)") return [];
        return getVaultBaseValues(this.app, k);
      },
      (updatedList) => {
        this.excludeValues = updatedList;
        this.plugin.settings.ft_excludeValues = [...updatedList];
        this.plugin.settings.excludeValues = [...updatedList];
        this.plugin.saveSettings();
        this.loadAndRenderTree();
      },
      "",
      ""
    );

    // Right Controls: Reset View, Zoom & Refresh Buttons (Row 1 Right, above Legend)
    const rightGrp1 = row1.createDiv({ cls: "ft-toolbar-right" });

    // Universal Reset View Button
    const resetBtn = rightGrp1.createEl("button", {
      cls: "ft-btn",
      attr: { title: "Universal Reset: Restore all collapsed branches, reset zoom and pan" },
    });
    resetBtn.innerHTML = "<span>⟲</span> Reset View";
    resetBtn.addEventListener("click", () => this.universalReset());

    // Zoom Controls
    const zoomGrp = rightGrp1.createDiv({ cls: "ft-btn-group" });
    const zoomOutBtn = zoomGrp.createEl("button", { cls: "ft-btn-sm", text: "−" });
    zoomOutBtn.addEventListener("click", () => this.applyZoom(0.85));

    this.zoomDisplay = zoomGrp.createSpan({ cls: "ft-zoom-readout", text: "100%" });

    const zoomInBtn = zoomGrp.createEl("button", { cls: "ft-btn-sm", text: "+" });
    zoomInBtn.addEventListener("click", () => this.applyZoom(1.15));

    // Refresh Button
    const refreshBtn = rightGrp1.createEl("button", {
      cls: "ft-btn",
      attr: { title: "Refresh vault tree data" },
    });
    refreshBtn.setText("↻ Refresh");
    refreshBtn.addEventListener("click", () => {
      this.populatePropSelect();
      this.populateValueSelect();
      this.populateExcludePropSelect();
      this.loadAndRenderTree();
    });

    // Row 2: Search Person & Card Properties (Left) | Male/Female/Marriage Legend (Right)
    const row2 = toolbar.createDiv({ cls: "ft-toolbar-row" });

    // Left Group: Search + Card Properties (below Base/Exclude in 2nd row)
    const leftGrp2 = row2.createDiv({ cls: "ft-toolbar-left-group" });

    // Search Person with Autocomplete
    const searchWrapper = leftGrp2.createDiv({ cls: "ft-search-wrapper" });
    searchWrapper.createSpan({ cls: "ft-filter-label", text: "Search:" });
    this.searchInput = searchWrapper.createEl("input", {
      type: "text",
      cls: "ft-search-input",
      placeholder: "",
    });
    searchWrapper.style.position = "relative";
    setupAutocomplete(
      this.searchInput,
      searchWrapper,
      () => Object.keys(this.people).sort(),
      (selectedName) => {
        this.focusPerson(selectedName);
      }
    );

    leftGrp2.createDiv({ cls: "ft-divider-v" });

    // Card Properties Pill Selector (matches Exclude Properties in relation-graph-viewer)
    const propWrapper = leftGrp2.createDiv({ cls: "ft-search-wrapper" });
    propWrapper.createSpan({
      cls: "ft-filter-label",
      text: "Card Properties:",
      attr: { title: "Select note properties to display on cards (type to search & add pills, click × to remove)" }
    });
    const pillBox = propWrapper.createDiv({ cls: "ft-pill-wrapper" });
    this.pillSelector = new FTPropertyPillSelector(
      pillBox,
      this.selectedCardProps,
      () => this.getAllAvailableProperties(),
      (updatedList) => {
        this.selectedCardProps = updatedList.map(s => s.toLowerCase());
        this.plugin.settings.ft_selectedCardProps = [...this.selectedCardProps];
        this.plugin.settings.selectedCardProps = [...this.selectedCardProps];
        this.plugin.saveSettings();
        this.calculateLayout();
        this.drawTree();
      }
    );

    // Right Group: Male/Female/Marriage Legend (Row 2 Right - directly under action buttons)
    const rightGrp2 = row2.createDiv({ cls: "ft-toolbar-right" });

    const legend = rightGrp2.createDiv({ cls: "ft-legend" });
    const maleLeg = legend.createDiv({ cls: "ft-legend-item" });
    maleLeg.createDiv({ cls: "ft-legend-dot male" });
    maleLeg.createSpan({ text: "Male" });

    const femaleLeg = legend.createDiv({ cls: "ft-legend-item" });
    femaleLeg.createDiv({ cls: "ft-legend-dot female" });
    femaleLeg.createSpan({ text: "Female" });

    const mLineLeg = legend.createDiv({ cls: "ft-legend-item" });
    mLineLeg.createDiv({ cls: "ft-legend-line" });
    mLineLeg.createSpan({ text: "Marriage" });

    // ──────────────── Canvas Container ────────────────
    this.canvasContainer = root.createDiv({ cls: "ft-canvas-container" });
    this.viewport = this.canvasContainer.createDiv({ cls: "ft-viewport" });

    // SVG Layer for connectors
    this.svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svgLayer.setAttribute("class", "ft-svg-connections");
    this.viewport.appendChild(this.svgLayer);

    // Cards Layer for HTML person cards
    this.cardsLayer = this.viewport.createDiv();

    // Floating Tooltip Window
    this.tooltip = root.createDiv({ cls: "ft-person-tooltip" });
    this.tooltip.innerHTML = `
      <div class="ft-tt-header">
        <div class="ft-tt-title">
          <span class="ft-legend-dot male" id="ftTtBadge"></span>
          <span class="ft-tt-name" id="ftTtName">Person</span>
        </div>
        <span class="ft-tt-gen-badge" id="ftTtGen">GEN I</span>
      </div>
      <div class="ft-tt-body">
        <div class="ft-tt-row"><span class="ft-tt-key">File:</span><span class="ft-tt-val" id="ftTtFile">Note.md</span></div>
        <div class="ft-tt-row"><span class="ft-tt-key">Base:</span><span class="ft-tt-val ft-tt-val-base" id="ftTtBase">Life.base</span></div>
        <div class="ft-tt-row"><span class="ft-tt-key">Parents:</span><span class="ft-tt-val" id="ftTtParents">None</span></div>
        <div class="ft-tt-row"><span class="ft-tt-key">Spouse:</span><span class="ft-tt-val" id="ftTtSpouse">None</span></div>
        <div class="ft-tt-row"><span class="ft-tt-key">Siblings:</span><span class="ft-tt-val" id="ftTtSiblings">None</span></div>
        <div class="ft-tt-row"><span class="ft-tt-key">Children:</span><span class="ft-tt-val" id="ftTtChildren">None</span></div>
      </div>
      <div class="ft-tt-footer">
        <span>Obsidian Note (Read-Only)</span>
        <span class="ft-tt-hint">Click to Open</span>
      </div>
    `;

    // Canvas Events (Pan & Cursor-Anchored Smooth Wheel Zoom)
    this.canvasContainer.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        if (
          e.target.closest(".ft-person-card") ||
          e.target.closest(".ft-collapse-toggle") ||
          e.target.closest("button") ||
          e.target.closest("input") ||
          e.target.closest(".ft-pill-container") ||
          e.target.closest(".ft-suggest-popup") ||
          e.target.closest(".ft-pill-dropdown")
        ) {
          return;
        }
        this.isPanning = true;
        this.startX = e.clientX - this.panX;
        this.startY = e.clientY - this.panY;
        this.canvasContainer.style.cursor = "grabbing";
        e.preventDefault();
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.canvasContainer.style.cursor = "grab";
      }
    });

    this.canvasContainer.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = Math.min(Math.max(Math.exp(-e.deltaY * 0.0018), 0.82), 1.22);
      this.applyZoom(factor, e.clientX, e.clientY);
    }, { passive: false });
  }

  populatePropSelect() {
    if (this.basePropInput) this.basePropInput.value = this.baseProperty || "";
  }

  populateValueSelect() {
    if (this.baseValInput) this.baseValInput.value = (this.baseFilterValue === "ALL" ? "" : this.baseFilterValue) || "";
  }

  populateExcludePropSelect() {
    if (this.excludePropInput) this.excludePropInput.value = (this.excludeProperty === "(None)" ? "" : this.excludeProperty) || "";
  }

  getAllAvailableProperties() {
    const propSet = new Set();
    Object.values(this.people).forEach(p => {
      if (p.rawFrontmatter) {
        Object.keys(p.rawFrontmatter).forEach(k => {
          if (k !== "position") propSet.add(k);
        });
      }
    });
    getAllVaultPropertyKeys(this.app).forEach(k => {
      if (k !== "position") propSet.add(k);
    });
    propSet.add("gender");
    propSet.add("generation");
    return [...propSet].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  setCardPropertiesFromText(raw) {
    const list = (raw || "")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    if (list.join(",") === (this.selectedCardProps || []).join(",")) {
      return;
    }

    this.selectedCardProps = list;
    this.calculateLayout();
    this.drawTree();
  }

  updateTransform() {
    this.viewport.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    if (this.zoomDisplay) {
      this.zoomDisplay.setText(Math.round(this.zoom * 100) + "%");
    }
  }

  applyZoom(factor, clientX = null, clientY = null) {
    const oldZoom = this.zoom;
    const newZoom = Math.min(Math.max(this.zoom * factor, 0.2), 3.0);
    if (newZoom === oldZoom) return;

    const rect = this.canvasContainer.getBoundingClientRect();
    const cx = clientX != null ? clientX - rect.left : rect.width / 2;
    const cy = clientY != null ? clientY - rect.top : rect.height / 2;

    this.zoom = newZoom;
    this.panX = cx - ((cx - this.panX) * (newZoom / oldZoom));
    this.panY = cy - ((cy - this.panY) * (newZoom / oldZoom));
    this.updateTransform();
  }

  zoomBy(factor) {
    this.applyZoom(factor);
  }

  universalReset() {
    this.unions.forEach(u => u.collapsed = false);
    if (this.activeHighlightId) {
      const prevCard = this.cardsLayer.querySelector(`[data-person-id="${this.activeHighlightId}"]`);
      if (prevCard) prevCard.removeClass("ft-card-highlighted");
      this.activeHighlightId = null;
    }
    if (this.searchInput) this.searchInput.value = "";
    this.zoom = 0.95;
    this.panX = 60;
    this.panY = 30;
    this.updateTransform();
    this.drawTree();
  }

  focusPerson(personId) {
    const p = this.people[personId];
    if (!p) return;

    // If person is in a collapsed branch, expand relevant ancestor unions
    let needsRedraw = false;
    this.unions.forEach(u => {
      if (u.collapsed) {
        const isDescendant = (union) => {
          if ((union.children || []).includes(personId)) return true;
          return this.unions.some(childUnion => {
            if ((union.children || []).includes(childUnion.p1) || (union.children || []).includes(childUnion.p2)) {
              return isDescendant(childUnion);
            }
            return false;
          });
        };
        if (isDescendant(u)) {
          u.collapsed = false;
          needsRedraw = true;
        }
      }
    });

    if (needsRedraw) {
      this.drawTree();
    }

    const cardW = p.cardW || this.getCardWidth(p);
    const cardH = this.getEffectiveCardHeight();
    const rect = this.canvasContainer.getBoundingClientRect();
    const targetZoom = 1.25;

    this.zoom = targetZoom;
    this.panX = (rect.width / 2) - ((p.x + cardW / 2) * targetZoom);
    this.panY = (rect.height / 2) - ((p.y + cardH / 2) * targetZoom);
    this.updateTransform();

    if (this.activeHighlightId) {
      const prevCard = this.cardsLayer.querySelector(`[data-person-id="${this.activeHighlightId}"]`);
      if (prevCard) prevCard.removeClass("ft-card-highlighted");
    }

    this.activeHighlightId = personId;
    const card = this.cardsLayer.querySelector(`[data-person-id="${personId}"]`);
    if (card) {
      card.addClass("ft-card-highlighted");
      setTimeout(() => {
        if (this.activeHighlightId === personId) {
          card.removeClass("ft-card-highlighted");
          this.activeHighlightId = null;
        }
      }, 6000);
    }
  }

  /* ─────────────────────────── Data Parsing (Strictly Read-Only) ─────────────────────────── */

  loadAndRenderTree() {
    try {
      const getPropKeys = (syncKey, ftKey) => {
        const sVal = this.plugin.settings[syncKey];
        const fVal = this.plugin.settings[ftKey];
        const val = (sVal && sVal.length > 0) ? sVal : fVal;
        return parsePropList(val);
      };

      const fatherKeys = getPropKeys("fatherProperty", "fatherProps");
      const motherKeys = getPropKeys("motherProperty", "motherProps");
      const husbandKeys = getPropKeys("husbandProperty", "husbandProps");
      const wifeKeys = getPropKeys("wifeProperty", "wifeProps");
      const sonKeys = getPropKeys("sonProperty", "sonProps");
      const daughterKeys = getPropKeys("daughterProperty", "daughterProps");
      const brotherKeys = getPropKeys("brotherProperty", "brotherProps");
      const sisterKeys = getPropKeys("sisterProperty", "sisterProps");
      const genderKeys = getPropKeys("genderProperty", "genderProps");

      const baseProp = (this.baseProperty || "base").toLowerCase();
      const filterVal = (this.baseFilterValue || "ALL").trim();

      // Excluded Property & Value filter (e.g. type: location, landmark)
      const exclProp = (this.excludeProperty || "").toLowerCase().trim();
      const exclVals = (this.excludeValues || []).map(v => v.toLowerCase().trim()).filter(Boolean);
      const hasExcludeFilter = exclProp && exclProp !== "(none)" && exclVals.length > 0;

      const markdownFiles = this.app.vault.getMarkdownFiles();
      const peopleMap = {};

      const matchBase = (b, filter) => {
        if (!b || !filter) return false;
        const bLower = b.toLowerCase().trim();
        const fLower = filter.toLowerCase().trim();
        if (bLower === fLower) return true;
        const bClean = bLower.replace(/\.md$/, "").replace(/\.base$/, "");
        const fClean = fLower.replace(/\.md$/, "").replace(/\.base$/, "");
        return bClean === fClean;
      };

      // 1. First pass: Collect all person notes matching base filter & NOT matching exclude property + value
      for (const f of markdownFiles) {
        const cache = this.app.metadataCache.getFileCache(f);
        if (!cache || !cache.frontmatter) continue;

        const fm = cache.frontmatter;

        // EXCLUSION: If note has excluded property matching ANY excluded value, skip it!
        if (hasExcludeFilter) {
          const realExclKey = Object.keys(fm).find(k => k.toLowerCase() === exclProp);
          if (realExclKey) {
            const rawVal = fm[realExclKey];
            let valArr = [];
            if (Array.isArray(rawVal)) {
              valArr = rawVal.map(x => bare(typeof x === "string" ? x : (x.link || ""))).filter(Boolean);
            } else if (rawVal !== null && rawVal !== undefined) {
              valArr = [bare(typeof rawVal === "string" ? rawVal : (rawVal.link || String(rawVal)))];
            }
            if (valArr.some(v => exclVals.includes(v.toLowerCase().trim()))) {
              continue; // Skip excluded note!
            }
          }
        }

        const bKey = Object.keys(fm).find(k => k.toLowerCase() === baseProp);
        const bRaw = bKey ? fm[bKey] : null;

        let fileBases = [];
        if (bRaw) {
          const arr = Array.isArray(bRaw) ? bRaw : [bRaw];
          fileBases = arr.map(x => bare(typeof x === "string" ? x : (x.link || ""))).filter(Boolean);
        }

        // Base filter check (if empty, matches all)
        if (baseProp && filterVal && filterVal !== "ALL") {
          if (!fileBases.some(b => matchBase(b, filterVal))) {
            continue;
          }
        }

        const id = f.basename;
        const fathers = extractLinksFromProperty(cache, fatherKeys);
      const mothers = extractLinksFromProperty(cache, motherKeys);
      const husbands = extractLinksFromProperty(cache, husbandKeys);
      const wifes = extractLinksFromProperty(cache, wifeKeys);
      const sons = extractLinksFromProperty(cache, sonKeys);
      const daughters = extractLinksFromProperty(cache, daughterKeys);
      const brothers = extractLinksFromProperty(cache, brotherKeys);
      const sisters = extractLinksFromProperty(cache, sisterKeys);

      const rawGender = extractStringFromProperty(cache, genderKeys).toLowerCase();
      let gender = "neutral";
      if (rawGender.startsWith("m") || rawGender === "male" || rawGender === "man") gender = "male";
      else if (rawGender.startsWith("f") || rawGender === "female" || rawGender === "woman") gender = "female";

      if (gender === "neutral") {
        if (husbands.length > 0) gender = "female";
        else if (wifes.length > 0) gender = "male";
      }

      peopleMap[id] = {
        id,
        name: id,
        file: f.path,
        base: fileBases.join(", ") || (filterVal !== "ALL" ? filterVal : "Note"),
        gender,
        fathers,
        mothers,
        parents: [...new Set([...fathers, ...mothers])],
        husbands,
        wifes,
        spouses: [...new Set([...husbands, ...wifes])],
        sons,
        daughters,
        children: [...new Set([...sons, ...daughters])],
        brothers,
        sisters,
        siblings: [...new Set([...brothers, ...sisters])],
        gen: 0,
        x: 0,
        y: 0,
        rawFrontmatter: fm ? { ...fm } : {},
      };
    }

    // 2. Second pass: Automatic Gender & Relationship Cross-Linking
    Object.values(peopleMap).forEach(p => {
      p.fathers.forEach(fid => {
        if (peopleMap[fid]) peopleMap[fid].gender = "male";
      });
      p.mothers.forEach(mid => {
        if (peopleMap[mid]) peopleMap[mid].gender = "female";
      });
      p.husbands.forEach(hid => {
        if (peopleMap[hid]) peopleMap[hid].gender = "male";
        if (p.gender === "neutral") p.gender = "female";
      });
      p.wifes.forEach(wid => {
        if (peopleMap[wid]) peopleMap[wid].gender = "female";
        if (p.gender === "neutral") p.gender = "male";
      });
      p.sons.forEach(sid => {
        if (peopleMap[sid]) peopleMap[sid].gender = "male";
      });
      p.daughters.forEach(did => {
        if (peopleMap[did]) peopleMap[did].gender = "female";
      });
      p.brothers.forEach(bid => {
        if (peopleMap[bid]) peopleMap[bid].gender = "male";
      });
      p.sisters.forEach(sid => {
        if (peopleMap[sid]) peopleMap[sid].gender = "female";
      });

      // Parents <-> Children linking
      p.parents.forEach(parId => {
        if (peopleMap[parId] && !peopleMap[parId].children.includes(p.id)) {
          peopleMap[parId].children.push(p.id);
        }
      });
      p.children.forEach(cid => {
        if (peopleMap[cid] && !peopleMap[cid].parents.includes(p.id)) {
          peopleMap[cid].parents.push(p.id);
        }
      });

      // Spouses bidirectional linking
      p.spouses.forEach(spId => {
        if (peopleMap[spId] && !peopleMap[spId].spouses.includes(p.id)) {
          peopleMap[spId].spouses.push(p.id);
        }
      });

      // Direct siblings bidirectional linking
      p.siblings.forEach(sibId => {
        if (peopleMap[sibId] && !peopleMap[sibId].siblings.includes(p.id)) {
          peopleMap[sibId].siblings.push(p.id);
        }
      });
    });

    // 3. Third pass: Automatic Sibling Inference from Shared Parents
    const peopleArray = Object.values(peopleMap);
    for (let i = 0; i < peopleArray.length; i++) {
      for (let j = i + 1; j < peopleArray.length; j++) {
        const p1 = peopleArray[i];
        const p2 = peopleArray[j];
        const sharedParents = p1.parents.filter(par => p2.parents.includes(par));
        if (sharedParents.length > 0) {
          if (!p1.siblings.includes(p2.id)) p1.siblings.push(p2.id);
          if (!p2.siblings.includes(p1.id)) p2.siblings.push(p1.id);
        }
      }
    }

    // 4. Build Unions & Couple entities
    const unionMap = new Map();
    const processedCouples = new Set();
    let unionCount = 0;

    Object.values(peopleMap).forEach(p => {
      p.spouses.forEach(spId => {
        const key = [p.id, spId].sort().join("___");
        if (!processedCouples.has(key)) {
          processedCouples.add(key);
          const p1 = p.gender === "female" ? spId : p.id;
          const p2 = p.gender === "female" ? p.id : spId;

          const sharedChildren = (peopleMap[p.id]?.children || []).filter(c =>
            (peopleMap[spId]?.children || []).includes(c) ||
            (peopleMap[c]?.parents && peopleMap[c].parents.includes(p.id) && peopleMap[c].parents.includes(spId))
          );

          const uId = `u_${key}`;
          const color = LINEAGE_PALETTE[unionCount % LINEAGE_PALETTE.length];
          unionCount++;

          unionMap.set(uId, {
            id: uId,
            p1,
            p2,
            children: [...new Set(sharedChildren)],
            collapsed: false,
            color,
          });
        }
      });

      // Parents forming implicit couple
      if (p.fathers.length > 0 && p.mothers.length > 0) {
        const fid = p.fathers[0];
        const mid = p.mothers[0];
        const key = [fid, mid].sort().join("___");
        const uId = `u_${key}`;
        if (!unionMap.has(uId)) {
          const color = LINEAGE_PALETTE[unionCount % LINEAGE_PALETTE.length];
          unionCount++;
          unionMap.set(uId, {
            id: uId,
            p1: fid,
            p2: mid,
            children: [p.id],
            collapsed: false,
            color,
          });
        } else {
          const u = unionMap.get(uId);
          if (!u.children.includes(p.id)) u.children.push(p.id);
        }
      }

      // Single parent with children
      if (p.children.length > 0 && p.spouses.length === 0) {
        const uId = `u_${p.id}`;
        if (!unionMap.has(uId)) {
          const color = LINEAGE_PALETTE[unionCount % LINEAGE_PALETTE.length];
          unionCount++;
          unionMap.set(uId, {
            id: uId,
            p1: p.id,
            p2: null,
            children: [...p.children],
            collapsed: false,
            color,
          });
        }
      }
    });

    this.people = peopleMap;
    this.unions = Array.from(unionMap.values());

    // 5. Calculate Generations & Clean Layout
    this.calculateLayout();
    this.drawTree();
  } catch (err) {
    console.error("[FamilyTreeViewer] Error loading and rendering family tree:", err);
    this.cardsLayer.empty();
    while (this.svgLayer.firstChild) {
      this.svgLayer.removeChild(this.svgLayer.firstChild);
    }
    const errBox = this.cardsLayer.createDiv({ cls: "ft-empty-state" });
    errBox.createDiv({ cls: "ft-empty-icon", text: "⚠️" });
    errBox.createDiv({ cls: "ft-empty-text", text: "Error loading family tree" });
    errBox.createDiv({ cls: "ft-empty-sub", text: String(err && err.message ? err.message : err) });
  }
}

  /* ─────────────────────────── Robust Hierarchical Layout Algorithm ─────────────────────────── */

  calculateLayout() {
    const peopleList = Object.values(this.people);
    if (peopleList.length === 0) return;

    // Calculate dynamic card width for every person
    peopleList.forEach(p => { p.cardW = this.getCardWidth(p); });

    const cardW = this.plugin.settings.cardWidth || 154;
    const cardH = this.getEffectiveCardHeight();
    const rowH = this.plugin.settings.generationRowHeight || 200;
    const hGap = this.plugin.settings.horizontalSpacing || 48;
    const coupleGap = 38;
    const familyGap = this.plugin.settings.familyBranchSpacing || 260;

    // 1. Generation Assignment (Depth Propagation)
    peopleList.forEach(p => { p.gen = 0; });

    let changed = true;
    let iterations = 0;
    while (changed && iterations < 30) {
      changed = false;
      iterations++;
      peopleList.forEach(p => {
        const knownParents = p.parents.filter(id => this.people[id]);
        if (knownParents.length > 0) {
          const maxParGen = Math.max(...knownParents.map(id => this.people[id].gen));
          if (p.gen < maxParGen + 1) {
            p.gen = maxParGen + 1;
            changed = true;
          }
        }
        // Spouses share identical generation
        p.spouses.forEach(spId => {
          const sp = this.people[spId];
          if (sp && sp.gen !== p.gen) {
            const maxG = Math.max(sp.gen, p.gen);
            if (p.gen < maxG) { p.gen = maxG; changed = true; }
            if (sp.gen < maxG) { sp.gen = maxG; changed = true; }
          }
        });
        // Siblings share identical generation
        p.siblings.forEach(sibId => {
          const sib = this.people[sibId];
          if (sib && sib.gen !== p.gen) {
            const maxG = Math.max(sib.gen, p.gen);
            if (p.gen < maxG) { p.gen = maxG; changed = true; }
            if (sib.gen < maxG) { sib.gen = maxG; changed = true; }
          }
        });
      });
    }

    // Dynamic Generation Heights (Adaptive vertical levels based on relationships)
    const genYMap = new Map();
    let currentY = 80;
    const allGens = [...new Set(peopleList.map(p => p.gen))].sort((a, b) => a - b);
    allGens.forEach(g => {
      genYMap.set(g, currentY);

      // Analyze unions and relationships between gen g and gen g+1
      const unionsOnThisGen = this.unions.filter(u => {
        const p = this.people[u.p1];
        return p && p.gen === g && u.children && u.children.length > 0;
      });

      const hasDistant = this.unions.some(u => {
        const p1 = this.people[u.p1];
        const p2 = u.p2 ? this.people[u.p2] : null;
        return p1 && p2 && p1.gen === g;
      });

      const laneCount = Math.min(4, Math.max(1, unionsOnThisGen.length));
      // Adaptive vertical corridor: guarantees at least 22px per lane + ample breathing room
      const dynamicCorridorH = Math.max(86, 52 + (laneCount * 22) + (hasDistant ? 26 : 0));
      currentY += cardH + dynamicCorridorH;
    });
    this.genYMap = genYMap;

    // 2. Identify Root Lineages (Independent Lineages)
    // A Root Union is a union where neither partner has parents in the current dataset
    const rootUnions = [];
    const interClanUnions = [];
    const placedPeople = new Set();
    const placedUnions = new Set();

    this.unions.forEach(u => {
      const p1 = this.people[u.p1];
      const p2 = u.p2 ? this.people[u.p2] : null;
      if (!p1) return;

      const p1HasParents = p1.parents.some(id => this.people[id]);
      const p2HasParents = p2 ? p2.parents.some(id => this.people[id]) : false;

      if (!p1HasParents && !p2HasParents) {
        rootUnions.push(u);
      } else if (p1HasParents && p2HasParents) {
        interClanUnions.push(u);
      }
    });

    // Map each person to their root clan ID
    const personClanMap = new Map();
    const traceClan = (personId, clanId, visited = new Set()) => {
      if (!personId || visited.has(personId)) return;
      visited.add(personId);
      personClanMap.set(personId, clanId);
      const p = this.people[personId];
      if (!p) return;
      (p.children || []).forEach(cid => traceClan(cid, clanId, visited));
    };

    rootUnions.forEach(ru => {
      traceClan(ru.p1, ru.id);
      if (ru.p2) traceClan(ru.p2, ru.id);
    });

    // Strategy 2: Clan Neighbor Optimization (Keep In-Laws Next to Each Other)
    const clanAffinity = new Map();
    rootUnions.forEach(ru => clanAffinity.set(ru.id, new Map()));

    this.unions.forEach(u => {
      const clan1 = personClanMap.get(u.p1);
      const clan2 = u.p2 ? personClanMap.get(u.p2) : null;
      if (clan1 && clan2 && clan1 !== clan2) {
        const m1 = clanAffinity.get(clan1);
        const m2 = clanAffinity.get(clan2);
        if (m1) m1.set(clan2, (m1.get(clan2) || 0) + 1);
        if (m2) m2.set(clan1, (m2.get(clan1) || 0) + 1);
      }
    });

    const orderedRootUnions = [];
    const remainingClans = new Set(rootUnions);

    while (remainingClans.size > 0) {
      if (orderedRootUnions.length === 0) {
        let bestClan = null;
        let maxConnections = -1;
        remainingClans.forEach(ru => {
          let connCount = 0;
          const aff = clanAffinity.get(ru.id);
          if (aff) aff.forEach(v => { connCount += v; });
          if (connCount > maxConnections) {
            maxConnections = connCount;
            bestClan = ru;
          }
        });
        const chosen = bestClan || Array.from(remainingClans)[0];
        orderedRootUnions.push(chosen);
        remainingClans.delete(chosen);
      } else {
        const lastClan = orderedRootUnions[orderedRootUnions.length - 1];
        const aff = clanAffinity.get(lastClan.id);
        let nextClan = null;
        let highestWeight = -1;
        if (aff) {
          remainingClans.forEach(ru => {
            const w = aff.get(ru.id) || 0;
            if (w > highestWeight) {
              highestWeight = w;
              nextClan = ru;
            }
          });
        }
        const chosen = nextClan || Array.from(remainingClans)[0];
        orderedRootUnions.push(chosen);
        remainingClans.delete(chosen);
      }
    }

    // Strategy 1: Spouse-Directional Sibling Sorting (Center the Unmarried)
    const getChildDirectionScore = (child, parentUnion) => {
      const childUnion = this.unions.find(cu => (cu.p1 === child.id || cu.p2 === child.id) && cu.id !== parentUnion.id);
      if (!childUnion) {
        return 0; // Unmarried -> Clustered in Center!
      }
      const spouseId = childUnion.p1 === child.id ? childUnion.p2 : childUnion.p1;
      const spouse = spouseId ? this.people[spouseId] : null;
      if (!spouse) return 1;

      // Check if spouse or spouse's parents are placed
      if (placedPeople.has(spouse.id)) {
        const parX = (this.people[parentUnion.p1]?.x || 0);
        return spouse.x < parX ? -1 : 1;
      }
      if (spouse.parents && spouse.parents.length > 0) {
        const spousePar = this.people[spouse.parents[0]];
        if (spousePar && placedPeople.has(spousePar.id)) {
          const parX = (this.people[parentUnion.p1]?.x || 0);
          return spousePar.x < parX ? -1 : 1;
        }
      }

      // Check clan order comparison
      const childClan = personClanMap.get(child.id);
      const spouseClan = personClanMap.get(spouse.id);
      if (childClan && spouseClan && childClan !== spouseClan) {
        const childClanIdx = orderedRootUnions.findIndex(ru => ru.id === childClan);
        const spouseClanIdx = orderedRootUnions.findIndex(ru => ru.id === spouseClan);
        if (childClanIdx !== -1 && spouseClanIdx !== -1) {
          return spouseClanIdx < childClanIdx ? -1 : 1;
        }
      }

      return 1; // Default married to right
    };

    const sortChildren = (children, parentUnion) => {
      return [...children].sort((a, b) => {
        const dirA = getChildDirectionScore(a, parentUnion);
        const dirB = getChildDirectionScore(b, parentUnion);
        if (dirA !== dirB) {
          return dirA - dirB; // -1 (Left), 0 (Center), +1 (Right)
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    };

    // Subtree Width Calculator (Bottom-up bounding width)
    const visitedWidth = new Set();
    const computeSubtreeWidth = (union) => {
      if (!union || visitedWidth.has(union.id)) return cardW * 2 + coupleGap;
      visitedWidth.add(union.id);

      const p1 = this.people[union.p1];
      const p2 = union.p2 ? this.people[union.p2] : null;
      const p1W = p1 ? (p1.cardW || cardW) : cardW;
      const p2W = p2 ? (p2.cardW || cardW) : 0;
      const unitW = p2 ? (p1W + p2W + coupleGap) : p1W;

      const rawChildren = (union.children || [])
        .map(cid => this.people[cid])
        .filter(Boolean);
      const validChildren = sortChildren(rawChildren, union);

      if (validChildren.length === 0) {
        return unitW;
      }

      let childrenTotalW = 0;
      validChildren.forEach((child, idx) => {
        // Check if child has a union
        const childUnion = this.unions.find(cu => (cu.p1 === child.id || cu.p2 === child.id) && cu.id !== union.id);
        let childW = child.cardW || cardW;
        if (childUnion) {
          const spouseId = childUnion.p1 === child.id ? childUnion.p2 : childUnion.p1;
          const spouse = spouseId ? this.people[spouseId] : null;
          const spouseHasOwnParents = spouse && spouse.parents.some(pid => this.people[pid]);
          if (!spouseHasOwnParents) {
            childW = computeSubtreeWidth(childUnion);
          } else {
            const spW = spouse ? (spouse.cardW || cardW) : cardW;
            childW = (child.cardW || cardW) + spW + coupleGap;
          }
        }
        childrenTotalW += childW;
        if (idx > 0) childrenTotalW += hGap;
      });

      return Math.max(unitW, childrenTotalW);
    };

    // Subtree Placement (Top-down within bounding slices)
    const placeBranch = (union, leftX, rightX, lineageColor) => {
      if (!union || placedUnions.has(union.id)) return;
      placedUnions.add(union.id);
      if (lineageColor) union.color = lineageColor;

      const p1 = this.people[union.p1];
      const p2 = union.p2 ? this.people[union.p2] : null;
      const availableW = rightX - leftX;
      const unionCenterX = leftX + availableW / 2;

      // Position parent card(s)
      let branchUnionX;
      if (p1 && p2) {
        const leftPartner = p1.gender === "female" ? p2 : p1;
        const rightPartner = p1.gender === "female" ? p1 : p2;
        const lpW = leftPartner.cardW || cardW;
        const rpW = rightPartner.cardW || cardW;

        if (!placedPeople.has(leftPartner.id)) {
          leftPartner.x = unionCenterX - (lpW + rpW + coupleGap) / 2;
          leftPartner.y = genYMap.get(leftPartner.gen) ?? (80 + leftPartner.gen * 120);
          placedPeople.add(leftPartner.id);
        }
        if (!placedPeople.has(rightPartner.id)) {
          rightPartner.x = leftPartner.x + lpW + coupleGap;
          rightPartner.y = genYMap.get(rightPartner.gen) ?? (80 + rightPartner.gen * 120);
          placedPeople.add(rightPartner.id);
        }
        branchUnionX = leftPartner.x + lpW + coupleGap / 2;
      } else if (p1) {
        const p1W = p1.cardW || cardW;
        if (!placedPeople.has(p1.id)) {
          p1.x = unionCenterX - p1W / 2;
          p1.y = genYMap.get(p1.gen) ?? (80 + p1.gen * 120);
          placedPeople.add(p1.id);
        }
        branchUnionX = p1.x + p1W / 2;
      }

      // Position children
      const rawChildren = (union.children || [])
        .map(cid => this.people[cid])
        .filter(Boolean);
      const validChildren = sortChildren(rawChildren, union);

      if (validChildren.length === 0) return;

      // Precalculate widths for each child's branch
      const childWidths = validChildren.map(child => {
        const childUnion = this.unions.find(cu => (cu.p1 === child.id || cu.p2 === child.id) && cu.id !== union.id);
        if (childUnion) {
          const spouseId = childUnion.p1 === child.id ? childUnion.p2 : childUnion.p1;
          const spouse = spouseId ? this.people[spouseId] : null;
          const spouseHasOwnParents = spouse && spouse.parents.some(pid => this.people[pid]);
          if (!spouseHasOwnParents) {
            return computeSubtreeWidth(childUnion);
          } else {
            return cardW * 2 + coupleGap;
          }
        }
        return cardW;
      });

      const totalChildrenW = childWidths.reduce((a, b) => a + b, 0) + (validChildren.length - 1) * hGap;
      let curChildX = (branchUnionX !== undefined ? branchUnionX : unionCenterX) - totalChildrenW / 2;

      validChildren.forEach((child, idx) => {
        const cw = childWidths[idx];
        const childSliceLeft = curChildX;
        const childSliceRight = curChildX + cw;

        const childUnion = this.unions.find(cu => (cu.p1 === child.id || cu.p2 === child.id) && cu.id !== union.id);
        if (childUnion && !placedUnions.has(childUnion.id)) {
          placeBranch(childUnion, childSliceLeft, childSliceRight, lineageColor);
        } else {
          if (!placedPeople.has(child.id)) {
            child.x = childSliceLeft + cw / 2 - (child.cardW || cardW) / 2;
            child.y = genYMap.get(child.gen) ?? (80 + child.gen * 120);
            placedPeople.add(child.id);
          }
        }

        curChildX += cw + hGap;
      });
    };

    // 3. Layout each Root Lineage with Dynamic Horizontal Spacing
    let currentStartX = 80;
    let colorIdx = 0;

    orderedRootUnions.forEach((ru, ruIdx) => {
      visitedWidth.clear();
      const subtreeW = computeSubtreeWidth(ru);
      const lineageColor = LINEAGE_PALETTE[colorIdx % LINEAGE_PALETTE.length];
      colorIdx++;

      placeBranch(ru, currentStartX, currentStartX + subtreeW, lineageColor);

      // Measure actual max X in this branch
      let branchMaxX = currentStartX + subtreeW;
      peopleList.forEach(p => {
        if (placedPeople.has(p.id) && p.x + (p.cardW || cardW) > branchMaxX) {
          branchMaxX = p.x + (p.cardW || cardW);
        }
      });

      // Dynamic Clan Spacing:
      // If this clan intermarries with the next clan, keep them closely connected (54px)
      // Otherwise, give a clean separation gap (78px) instead of a massive 260px void
      const nextRu = orderedRootUnions[ruIdx + 1];
      const hasIntermarriage = nextRu && (
        (clanAffinity.get(ru.id)?.get(nextRu.id) || 0) > 0 ||
        (clanAffinity.get(nextRu.id)?.get(ru.id) || 0) > 0
      );

      const dynamicClanGap = hasIntermarriage
        ? Math.max(48, Math.min(64, hGap + 10))
        : Math.max(64, Math.min(88, hGap * 1.5));

      currentStartX = branchMaxX + dynamicClanGap;
    });

    // 4. Handle Inter-Clan Marriages (cross-family unions)
    interClanUnions.forEach(iu => {
      const p1 = this.people[iu.p1];
      const p2 = this.people[iu.p2];
      if (!p1 || !p2) return;

      iu.color = LINEAGE_PALETTE[colorIdx % LINEAGE_PALETTE.length];
      colorIdx++;

      const p1Center = p1.x + (p1.cardW || cardW) / 2;
      const p2Center = p2.x + (p2.cardW || cardW) / 2;
      const unionCenterX = (p1Center + p2Center) / 2;

      const validChildren = (iu.children || []).map(cid => this.people[cid]).filter(Boolean);
      if (validChildren.length > 0) {
        const totalCW = validChildren.reduce((sum, c) => sum + (c.cardW || cardW), 0) + (validChildren.length - 1) * hGap;
        let cStartX = unionCenterX - totalCW / 2;
        validChildren.forEach(child => {
          if (!placedPeople.has(child.id)) {
            child.x = cStartX;
            child.y = genYMap.get(child.gen) ?? (80 + child.gen * 120);
            placedPeople.add(child.id);
          }
          cStartX += (child.cardW || cardW) + hGap;
        });
      }
    });

    // 5. Place any remaining people (orphans or unlinked people)
    peopleList.forEach(p => {
      if (!placedPeople.has(p.id)) {
        p.x = currentStartX;
        p.y = genYMap.get(p.gen) ?? (80 + p.gen * 120);
        placedPeople.add(p.id);
        currentStartX += (p.cardW || cardW) + hGap;
      }
    });

    // 6. Final Horizontal Collision Sweep (Guarantee cards on same gen never overlap)
    allGens.forEach(g => {
      const rowCards = peopleList.filter(p => p.gen === g).sort((a, b) => a.x - b.x);
      for (let i = 0; i < rowCards.length - 1; i++) {
        const c1 = rowCards[i];
        const c2 = rowCards[i + 1];
        const minSpacing = (c1.cardW || cardW) + 20;
        if (c2.x < c1.x + minSpacing) {
          const delta = (c1.x + minSpacing) - c2.x;
          for (let j = i + 1; j < rowCards.length; j++) {
            rowCards[j].x += delta;
          }
        }
      }
    });
  }

  /* ─────────────────────────── Recursive Descendant Hiding ─────────────────────────── */

  getHiddenElements() {
    const hiddenPeople = new Set();
    const hiddenUnions = new Set();

    const hideDescendants = (union) => {
      (union.children || []).forEach(childId => {
        hiddenPeople.add(childId);

        this.unions.forEach(childUnion => {
          if (childUnion.p1 === childId || childUnion.p2 === childId) {
            hiddenUnions.add(childUnion.id);
            const spouseId = childUnion.p1 === childId ? childUnion.p2 : childUnion.p1;
            const spouse = this.people[spouseId];

            if (spouse && (!spouse.parents || spouse.parents.length === 0)) {
              hiddenPeople.add(spouseId);
            }

            hideDescendants(childUnion);
          }
        });
      });
    };

    this.unions.forEach(u => {
      if (u.collapsed) {
        hideDescendants(u);
      }
    });

    this.unions.forEach(u => {
      if (hiddenPeople.has(u.p1) || (u.p2 && hiddenPeople.has(u.p2))) {
        hiddenUnions.add(u.id);
      }
    });

    return { hiddenPeople, hiddenUnions };
  }

  /* ─────────────────────────── Render Tree ─────────────────────────── */

  drawTree() {
    this.cardsLayer.empty();
    while (this.svgLayer.firstChild) {
      this.svgLayer.removeChild(this.svgLayer.firstChild);
    }

    const peopleList = Object.values(this.people);
    if (peopleList.length === 0) {
      const empty = this.cardsLayer.createDiv({ cls: "ft-empty-state" });
      empty.createDiv({ cls: "ft-empty-icon", text: "🌿" });
      empty.createDiv({ cls: "ft-empty-text", text: "No Family Tree Notes Found" });
      empty.createDiv({
        cls: "ft-empty-sub",
        text: `Ensure notes have property '${this.baseProperty}: ${this.baseFilterValue}' and relationship properties configured in settings.`
      });
      return;
    }

    const { hiddenPeople, hiddenUnions } = this.getHiddenElements();
    const cardW = this.plugin.settings.cardWidth || 154;
    const cardH = this.getEffectiveCardHeight();
    const rowH = this.plugin.settings.generationRowHeight || 200;
    const coupleGap = 38;

    // 1. Generation Guides
    const visibleGens = [...new Set(peopleList.filter(p => !hiddenPeople.has(p.id)).map(p => p.gen))].sort((a, b) => a - b);
    visibleGens.forEach(g => {
      const guide = this.cardsLayer.createDiv({ cls: "ft-gen-guide" });
      const gy = (this.genYMap && this.genYMap.get(g)) ?? (80 + g * 120);
      guide.style.top = (gy + 15) + "px";
      const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][g] || (g + 1);
      guide.createSpan({ text: `GEN ${roman}` });
      guide.createDiv({ cls: "ft-gen-line" });
    });

    // 2. Render Marriage Lines & Stepped Child Drops (Multi-Lane & Jumper Curves)
    // First, assign distinct vertical lanes per generation for unions with visible children
    const genLaneCounter = {};
    const genTotalLanes = {};
    this.unions.forEach(u => {
      if (hiddenUnions.has(u.id)) return;
      if (!u.children || u.children.length === 0 || u.collapsed) return;
      const visibleChildren = u.children.filter(cid => !hiddenPeople.has(cid));
      if (visibleChildren.length === 0) return;

      const p1 = this.people[u.p1];
      const g = p1 ? p1.gen : 0;
      if (genLaneCounter[g] === undefined) genLaneCounter[g] = 0;
      u.laneOnGen = genLaneCounter[g];
      genLaneCounter[g]++;
    });
    Object.keys(genLaneCounter).forEach(g => {
      genTotalLanes[g] = genLaneCounter[g];
    });

    const allVerticalSegments = [];
    const horizontalRenderQueue = [];
    const ringsRenderQueue = [];
    const togglesRenderQueue = [];

    // Pass 1: Layout all line geometries and register vertical segments
    this.unions.forEach((u, unionIdx) => {
      if (hiddenUnions.has(u.id)) return;
      const p1 = this.people[u.p1];
      const p2 = u.p2 ? this.people[u.p2] : null;
      if (!p1 || hiddenPeople.has(p1.id)) return;
      if (p2 && hiddenPeople.has(p2.id)) return;

      const strokeColor = u.color ? u.color.stroke : "#00f0ff";
      let unionX, unionY;

      if (p1 && p2) {
        const leftP = p1.x < p2.x ? p1 : p2;
        const rightP = p1.x < p2.x ? p2 : p1;
        const leftPW = leftP.cardW || cardW;
        const rightPW = rightP.cardW || cardW;

        const leftEdge = leftP.x + leftPW;
        const rightEdge = rightP.x;
        const gapBetween = rightEdge - leftEdge;
        const isAdjacent = Math.abs(leftP.y - rightP.y) < 30 && gapBetween <= coupleGap + 60;

        if (isAdjacent) {
          // Direct side-by-side marriage line between cards
          unionX = leftEdge + gapBetween / 2;
          unionY = leftP.y + cardH / 2;

          horizontalRenderQueue.push({
            x1: leftEdge,
            x2: rightEdge,
            y: unionY,
            strokeColor,
            className: "ft-marriage-line",
            unionId: u.id,
          });

          ringsRenderQueue.push({ cx: unionX, cy: unionY, r: 5, strokeColor });
        } else {
          // Distant / Inter-Clan Highway Corridor Route
          const corridorY = Math.max(leftP.y, rightP.y) + cardH + 10 + ((unionIdx % 2) * 10);
          const leftX = leftP.x + leftPW / 2;
          const rightX = rightP.x + rightPW / 2;

          allVerticalSegments.push({ x: leftX, yTop: leftP.y + cardH, yBottom: corridorY, unionId: u.id, strokeColor, className: "ft-marriage-line ft-marriage-distant" });
          allVerticalSegments.push({ x: rightX, yTop: rightP.y + cardH, yBottom: corridorY, unionId: u.id, strokeColor, className: "ft-marriage-line ft-marriage-distant" });

          horizontalRenderQueue.push({
            x1: leftX,
            x2: rightX,
            y: corridorY,
            strokeColor,
            className: "ft-marriage-line ft-marriage-distant",
            unionId: u.id,
          });

          unionX = (leftX + rightX) / 2;
          unionY = corridorY;
          ringsRenderQueue.push({ cx: unionX, cy: unionY, r: 5, strokeColor });
        }
      } else {
        // Single parent union — NO ring rendered at bottom of card
        unionX = p1.x + (p1.cardW || cardW) / 2;
        unionY = p1.y + cardH;
      }

      // Child drops
      if (u.children && u.children.length > 0 && !u.collapsed) {
        const visibleChildren = u.children
          .filter(cid => !hiddenPeople.has(cid))
          .map(cid => this.people[cid])
          .filter(Boolean);

        if (visibleChildren.length > 0) {
          const parentBottomY = (p2 ? Math.max(p1.y, p2.y) : p1.y) + cardH;
          const stemY1 = p2 ? unionY + 5 : p1.y + cardH;

          if (visibleChildren.length === 1) {
            // SINGLE CHILD: Draw ONE clean, perfectly straight vertical line!
            const onlyChild = visibleChildren[0];
            const childCenterX = onlyChild.x + (onlyChild.cardW || cardW) / 2;

            if (Math.abs(childCenterX - unionX) <= 6) {
              allVerticalSegments.push({
                x: unionX,
                yTop: stemY1,
                yBottom: onlyChild.y,
                unionId: u.id,
                strokeColor,
                className: "ft-tree-line",
              });
            } else {
              const stemDropY = parentBottomY + 24;
              allVerticalSegments.push({
                x: unionX,
                yTop: stemY1,
                yBottom: stemDropY,
                unionId: u.id,
                strokeColor,
                className: "ft-tree-line",
              });
              horizontalRenderQueue.push({
                x1: Math.min(unionX, childCenterX),
                x2: Math.max(unionX, childCenterX),
                y: stemDropY,
                strokeColor,
                className: "ft-tree-line",
                unionId: u.id,
              });
              allVerticalSegments.push({
                x: childCenterX,
                yTop: stemDropY,
                yBottom: onlyChild.y,
                unionId: u.id,
                strokeColor,
                className: "ft-tree-line",
              });
            }
          } else {
            // MULTIPLE CHILDREN: Multi-lane bus bar + drops
            const minChildY = Math.min(...visibleChildren.map(c => c.y));
            const availableGap = minChildY - parentBottomY;

            const totalLanes = genTotalLanes[p1.gen] || 1;
            const laneIdx = u.laneOnGen !== undefined ? u.laneOnGen : 0;
            const usableGap = Math.max(48, availableGap - 36);
            const laneStep = totalLanes > 1 ? Math.min(22, Math.max(16, usableGap / totalLanes)) : 18;
            const baseOffset = 24;
            const stemDropY = parentBottomY + baseOffset + (laneIdx * laneStep);

            // 1. Vertical stem from union down to bus bar
            allVerticalSegments.push({
              x: unionX,
              yTop: Math.min(stemY1, stemDropY),
              yBottom: Math.max(stemY1, stemDropY),
              unionId: u.id,
              strokeColor,
              className: "ft-tree-line",
            });

            // 2. Child connection points (top center of each child card)
            const childPoints = visibleChildren.map(c => ({
              x: c.x + (c.cardW || cardW) / 2,
              y: c.y,
            }));

            const minChildX = Math.min(...childPoints.map(cp => cp.x), unionX);
            const maxChildX = Math.max(...childPoints.map(cp => cp.x), unionX);

            // 3. Horizontal Bus Bar
            horizontalRenderQueue.push({
              x1: minChildX,
              x2: maxChildX,
              y: stemDropY,
              strokeColor,
              className: "ft-tree-line",
              unionId: u.id,
            });

            // 4. Downward drop lines to each child card
            childPoints.forEach(cp => {
              allVerticalSegments.push({
                x: cp.x,
                yTop: Math.min(stemDropY, cp.y),
                yBottom: Math.max(stemDropY, cp.y),
                unionId: u.id,
                strokeColor,
                className: "ft-tree-line",
              });
            });
          }
        }
      }

      // Collapse / Expand Toggle Button
      if (u.children && u.children.length > 0) {
        togglesRenderQueue.push({
          unionX,
          unionY: p2 ? unionY + 10 : p1.y + cardH + 12,
          strokeColor,
          u,
        });
      }
    });

    // Pass 2: Render All Vertical Lines First (Straight)
    allVerticalSegments.forEach(v => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", v.x);
      line.setAttribute("y1", v.yTop);
      line.setAttribute("x2", v.x);
      line.setAttribute("y2", v.yBottom);
      line.setAttribute("class", v.className || "ft-tree-line");
      line.setAttribute("stroke", v.strokeColor);
      line.style.stroke = v.strokeColor;
      this.svgLayer.appendChild(line);
    });

    // Pass 3: Render All Horizontal Lines with Upward Semicircular Jumper Bridges
    horizontalRenderQueue.forEach(h => {
      const startX = Math.min(h.x1, h.x2);
      const endX = Math.max(h.x1, h.x2);

      // Find all vertical lines from other families that intersect this horizontal line
      const crossings = [];
      allVerticalSegments.forEach(v => {
        if (v.unionId === h.unionId) return; // Same family lines don't need jumps
        if (v.x > startX + 2 && v.x < endX - 2) {
          if (h.y >= v.yTop && h.y <= v.yBottom) {
            crossings.push(Math.round(v.x));
          }
        }
      });

      // Deduplicate and sort crossings from left to right
      const uniqueCrossings = [...new Set(crossings)].sort((a, b) => a - b);

      const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathEl.setAttribute("class", h.className || "ft-tree-line");
      pathEl.setAttribute("stroke", h.strokeColor);
      pathEl.style.stroke = h.strokeColor;
      pathEl.setAttribute("fill", "none");

      if (uniqueCrossings.length === 0) {
        pathEl.setAttribute("d", `M ${startX} ${h.y} L ${endX} ${h.y}`);
      } else {
        const r = 6; // Arc radius
        let d = `M ${startX} ${h.y}`;
        let lastX = startX;

        uniqueCrossings.forEach(cx => {
          const arcStart = cx - r;
          const arcEnd = cx + r;
          if (arcStart > lastX) {
            d += ` L ${arcStart} ${h.y}`;
          }
          // Upward semicircular jumper bridge arc! (A rx ry x-axis-rotation large-arc sweep x y)
          d += ` A ${r} ${r} 0 0 1 ${arcEnd} ${h.y}`;
          lastX = arcEnd;
        });

        if (endX > lastX) {
          d += ` L ${endX} ${h.y}`;
        }

        pathEl.setAttribute("d", d);
      }

      this.svgLayer.appendChild(pathEl);
    });

    // Pass 4: Render Union Rings
    ringsRenderQueue.forEach(r => {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", r.cx);
      ring.setAttribute("cy", r.cy);
      ring.setAttribute("r", r.r);
      ring.setAttribute("class", "ft-union-ring");
      ring.setAttribute("stroke", r.strokeColor);
      ring.style.stroke = r.strokeColor;
      this.svgLayer.appendChild(ring);
    });

    // Pass 5: Render Collapse / Expand Toggle Buttons
    togglesRenderQueue.forEach(t => {
      const toggle = this.cardsLayer.createDiv({
        cls: `ft-collapse-toggle ${t.u.collapsed ? 'is-collapsed' : ''}`,
        attr: {
          title: t.u.collapsed
            ? `Click to expand branch (${t.u.children.length} direct children + descendants)`
            : `Click to collapse branch (${t.u.children.length} direct children + descendants)`
        }
      });
      toggle.style.left = (t.unionX - 10) + "px";
      toggle.style.top = t.unionY + "px";
      toggle.style.borderColor = t.strokeColor;
      toggle.style.color = t.strokeColor;
      toggle.setText(t.u.collapsed ? "+" : "−");

      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        t.u.collapsed = !t.u.collapsed;
        this.drawTree();
      });
    });

    // 3. Render Person Cards (Fixed positions, no node dragging)
    peopleList.forEach(p => {
      if (hiddenPeople.has(p.id)) return;

      const card = this.cardsLayer.createDiv({ cls: "ft-person-card" });
      card.setAttribute("data-person-id", p.id);
      card.style.left = p.x + "px";
      card.style.top = p.y + "px";
      card.style.width = (p.cardW || cardW) + "px";
      card.style.height = cardH + "px";

      if (this.activeHighlightId === p.id) {
        card.addClass("ft-card-highlighted");
      }

      // Gender badge
      const badgeCls = p.gender === "male" ? "ft-gender-male" : p.gender === "female" ? "ft-gender-female" : "ft-gender-neutral";
      card.createDiv({ cls: `ft-gender-badge ${badgeCls}` });

      const info = card.createDiv({ cls: "ft-card-info" });
      info.createSpan({ cls: "ft-card-name", text: p.name });

      if (this.selectedCardProps && this.selectedCardProps.length > 0) {
        const propsContainer = info.createDiv({ cls: "ft-card-props-list" });
        const selectedList = [...this.selectedCardProps];
        const fm = p.rawFrontmatter || {};
        const lowerKeyMap = {};
        Object.keys(fm).forEach(k => {
          lowerKeyMap[k.toLowerCase()] = k;
        });

        selectedList.forEach(prop => {
          let val = "";
          let displayKey = prop;
          if (prop === "gender") {
            displayKey = "Gender";
            if (p.gender && p.gender !== "neutral") {
              val = p.gender.charAt(0).toUpperCase() + p.gender.slice(1);
            }
          } else if (prop === "generation" || prop === "gen") {
            displayKey = "Gen";
            val = `Gen ${p.gen + 1}`;
          } else if (prop === "base") {
            displayKey = "Base";
            val = p.base || "";
          } else {
            const actualKey = lowerKeyMap[prop.toLowerCase()];
            if (actualKey) {
              displayKey = actualKey;
              val = formatPropertyValue(fm[actualKey]);
            }
          }

          if (val) {
            const row = propsContainer.createDiv({ cls: "ft-card-prop-row" });
            row.createSpan({ cls: "ft-card-prop-key", text: `${displayKey}:` });
            row.createSpan({ cls: "ft-card-prop-val", text: val });
          }
        });
      }

      // Hover floating tooltip
      card.addEventListener("mouseenter", (e) => this.showTooltip(p, e));
      card.addEventListener("mousemove", (e) => this.positionTooltip(e));
      card.addEventListener("mouseleave", () => this.hideTooltip());

      // Left-click: Open note in Obsidian (Read-Only navigation)
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        const file = this.app.vault.getAbstractFileByPath(p.file);
        if (file instanceof obsidian.TFile) {
          this.app.workspace.openLinkText(file.path, "", false);
        }
      });

      // Right-click: Context Menu
      card.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const menu = new obsidian.Menu();
        const file = this.app.vault.getAbstractFileByPath(p.file);

        menu.addItem(item => {
          item.setTitle("Open Note")
            .setIcon("file-text")
            .onClick(() => {
              if (file instanceof obsidian.TFile) {
                this.app.workspace.openLinkText(file.path, "", false);
              }
            });
        });

        menu.addItem(item => {
          item.setTitle("Open in New Tab")
            .setIcon("file-plus")
            .onClick(() => {
              if (file instanceof obsidian.TFile) {
                this.app.workspace.openLinkText(file.path, "", "tab");
              }
            });
        });

        menu.addItem(item => {
          item.setTitle("Open to the Right")
            .setIcon("split")
            .onClick(() => {
              if (file instanceof obsidian.TFile) {
                this.app.workspace.openLinkText(file.path, "", "split");
              }
            });
        });

        menu.showAtMouseEvent(e);
      });
    });
  }

  showTooltip(p, e) {
    const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][p.gen] || (p.gen + 1);
    const badge = this.tooltip.querySelector("#ftTtBadge");
    badge.className = `ft-legend-dot ${p.gender === "male" ? "male" : "female"}`;

    this.tooltip.querySelector("#ftTtName").textContent = p.name;
    this.tooltip.querySelector("#ftTtGen").textContent = `GEN ${roman}`;
    this.tooltip.querySelector("#ftTtFile").textContent = p.file.split("/").pop();
    this.tooltip.querySelector("#ftTtBase").textContent = p.base;
    this.tooltip.querySelector("#ftTtParents").textContent = p.parents.length > 0 ? p.parents.join(", ") : "None (Founding Ancestor)";
    this.tooltip.querySelector("#ftTtSpouse").textContent = p.spouses.length > 0 ? p.spouses.join(", ") : "None (Single)";

    if (p.siblings && p.siblings.length > 0) {
      const sibLabels = p.siblings.map(sibId => {
        const sib = this.people[sibId];
        if (!sib) return sibId;
        const role = sib.gender === "male" ? "Brother" : sib.gender === "female" ? "Sister" : "Sibling";
        return `${sib.name} (${role})`;
      });
      this.tooltip.querySelector("#ftTtSiblings").textContent = sibLabels.join(", ");
    } else {
      this.tooltip.querySelector("#ftTtSiblings").textContent = "None";
    }

    this.tooltip.querySelector("#ftTtChildren").textContent = p.children.length > 0 ? p.children.join(", ") : "None";

    this.tooltip.addClass("visible");
    this.positionTooltip(e);
  }

  positionTooltip(e) {
    const offset = 18;
    const ttW = 370;
    const ttH = 300;
    let left = e.clientX + offset;
    let top = e.clientY + offset;

    if (left + ttW > window.innerWidth) left = Math.max(10, e.clientX - ttW - 5);
    if (top + ttH > window.innerHeight) top = Math.max(10, e.clientY - ttH - 5);

    this.tooltip.style.left = left + "px";
    this.tooltip.style.top = top + "px";
  }

  hideTooltip() {
    this.tooltip.removeClass("visible");
  }
}

/* ═════════════════════════ UNIFIED SETTINGS TAB ═════════════════════════ */

class RelationsSuiteSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl: el } = this;
    const prevScroll = el.scrollTop;
    const parentScroll = el.parentElement ? el.parentElement.scrollTop : 0;
    el.empty();

    // ── Header & Quick Access ──
    new obsidian.Setting(el)
      .setName("Relations Suite")
      .setDesc("3 in 1 plugin suite featuring instant relationship property sync, interactive family tree view and interactive relations graph view.")
      .setHeading();

    new obsidian.Setting(el)
      .setName("Quick Launch Views")
      .setDesc("Open either of the interactive visual relationship explorer tabs.")
      .addButton(b => b.setButtonText("Open Family Tree View").setCta()
        .onClick(() => this.plugin.activateFamilyTreeView()))
      .addButton(b => b.setButtonText("Open Graph View")
        .onClick(() => this.plugin.activateGraphView()));

    // ══════════════════════════════════════════════════════════════════
    // RELATION SYNC & FAMILY PROPERTIES
    // ══════════════════════════════════════════════════════════════════
    el.createEl("h2", { text: "Relation Sync & Family Properties", cls: "setting-item-heading" });
    el.createEl("p", {
      text: "Configure your relationship properties here once. These properties are shared by both the background Sync Engine and the Family Tree Viewer.",
      cls: "setting-item-description"
    });

    /* ── Manual Sync ── */
    new obsidian.Setting(el)
      .setName("Manual Vault Sync")
      .setDesc("Scan existing notes and fill in all missing relation properties. Respects 'Included Folders'.")
      .addButton(b => b.setButtonText("Sync All Vault Relations Now").setCta()
        .onClick(() => this.plugin.syncAllVault()));

    /* ── Included Folders (Sync Scope) ── */
    const folderSetting = new obsidian.Setting(el)
      .setName("Included Folders (Sync Scope)")
      .setDesc("Scope: Sync applies ONLY to notes within these folders. If empty, sync applies across the entire vault.");
    const folderBox = folderSetting.controlEl.createDiv();
    new RPGPropertyPillSelector(
      folderBox,
      this.plugin.settings.includedFolders,
      this.app,
      async updatedList => {
        this.plugin.settings.includedFolders = updatedList;
        await this.plugin.saveSettings();
      },
      () => {
        return this.app.vault.getAllLoadedFiles()
          .filter(f => f instanceof obsidian.TFolder && f.path !== "/")
          .map(f => f.path)
          .sort();
      }
    );

    /* ── Gender Settings Box ── */
    const genderBox = el.createDiv({
      cls: "srs-container",
      attr: { style: "padding:10px;margin-bottom:15px;background:var(--background-secondary);border-radius:8px;" }
    });
    genderBox.createEl("h4", { text: "Gender Configuration (Enables Smart Automatic Linking)", attr: { style: "margin-top:0;" } });

    const getGenderVaultValues = () => {
      const gKey = (this.plugin.settings.genderProperty || "").trim();
      if (!gKey) return [];
      return getVaultBaseValues(this.app, gKey);
    };

    new obsidian.Setting(genderBox)
      .setName("Gender Property Name")
      .setDesc("Property in notes that specifies gender (e.g. gender).")
      .addText(t => {
        t.setValue(this.plugin.settings.genderProperty || "")
         .onChange(async v => {
           this.plugin.settings.genderProperty = v.trim();
           await this.plugin.saveSettings();
         });
        new VaultPropertySuggest(this.app, t.inputEl, async v => {
          this.plugin.settings.genderProperty = v.trim();
          await this.plugin.saveSettings();
        });
      });

    const maleSetting = new obsidian.Setting(genderBox)
      .setName("Male Values")
      .setDesc("Values representing male gender in vault notes (auto-recommended from vault notes).");
    const maleBox = maleSetting.controlEl.createDiv();
    new RPGPropertyPillSelector(
      maleBox,
      this.plugin.settings.maleValues,
      this.app,
      async updatedList => {
        this.plugin.settings.maleValues = updatedList;
        await this.plugin.saveSettings();
      },
      () => getGenderVaultValues()
    );

    const femaleSetting = new obsidian.Setting(genderBox)
      .setName("Female Values")
      .setDesc("Values representing female gender in vault notes (auto-recommended from vault notes).");
    const femaleBox = femaleSetting.controlEl.createDiv();
    new RPGPropertyPillSelector(
      femaleBox,
      this.plugin.settings.femaleValues,
      this.app,
      async updatedList => {
        this.plugin.settings.femaleValues = updatedList;
        await this.plugin.saveSettings();
      },
      () => getGenderVaultValues()
    );

    /* ── Family Relationship Properties (Shared across Suite) ── */
    const relPropBox = el.createDiv({
      cls: "srs-container",
      attr: { style: "padding:10px;margin-bottom:15px;background:var(--background-secondary);border-radius:8px;" }
    });
    relPropBox.createEl("h4", {
      text: "Family Relationship Properties",
      attr: { style: "margin-top:0;" }
    });
    relPropBox.createEl("p", {
      text: "Property names used across notes for family relations (e.g. father, mother). Shared by both Relation Sync and Family Tree Viewer.",
      cls: "setting-item-description"
    });

    const addSyncPropRow = (label, key) => {
      const s = new obsidian.Setting(relPropBox).setName(label);
      const pBox = s.controlEl.createDiv();
      const initial = Array.isArray(this.plugin.settings[key])
        ? this.plugin.settings[key]
        : (this.plugin.settings[key] ? [this.plugin.settings[key]] : []);
      new RPGPropertyPillSelector(
        pBox,
        initial,
        this.app,
        async updatedList => {
          this.plugin.settings[key] = updatedList;
          await this.plugin.saveSettings();
        },
        () => getAllVaultPropertyKeys(this.app)
      );
    };

    addSyncPropRow("Father Property",   "fatherProperty");
    addSyncPropRow("Mother Property",   "motherProperty");
    addSyncPropRow("Husband Property",  "husbandProperty");
    addSyncPropRow("Wife Property",     "wifeProperty");
    addSyncPropRow("Son Property",      "sonProperty");
    addSyncPropRow("Daughter Property", "daughterProperty");
    addSyncPropRow("Brother Property",  "brotherProperty");
    addSyncPropRow("Sister Property",   "sisterProperty");

    /* ── Auto Sibling Toggle ── */
    new obsidian.Setting(el)
      .setName("Auto Sibling Linking (Shared Parent)")
      .setDesc("Automatically link brothers and sisters when listed together under a parent note.")
      .addToggle(t => t.setValue(!!this.plugin.settings.autoLinkSiblings)
        .onChange(async v => {
          this.plugin.settings.autoLinkSiblings = v;
          await this.plugin.saveSettings();
          this.display();
        }));

    /* ── Auto Co-Parent Toggle ── */
    new obsidian.Setting(el)
      .setName("Auto Spouse Co-Parent Linking")
      .setDesc("Automatically link spouse as co-parent (father/mother) to all children on a parent note.")
      .addToggle(t => t.setValue(!!this.plugin.settings.autoLinkSpouseCoParent)
        .onChange(async v => {
          this.plugin.settings.autoLinkSpouseCoParent = v;
          await this.plugin.saveSettings();
          this.display();
        }));

    /* ── Relation Pairs ── */
    new obsidian.Setting(el)
      .setName("Custom Relation Pairs")
      .setDesc("Create custom forward ↔ inverse property rules (e.g. mentor ↔ student).")
      .addButton(b => b.setButtonText("+ Add Pair").setCta().onClick(async () => {
        this.plugin.settings.relations.unshift({ forward: "", inverse: "", enabled: true });
        await this.plugin.saveSettings();
        this.display();
      }));

    const pairsBox = el.createDiv({ cls: "srs-container" });
    if (!this.plugin.settings.relations?.length) {
      pairsBox.createDiv({ cls: "srs-empty", text: "No custom relation pairs configured." });
    } else {
      this.plugin.settings.relations.forEach((rel, i) => {
        const isOn = rel.enabled !== false;
        const row = pairsBox.createDiv({ cls: `srs-row ${isOn ? "" : "srs-row-disabled"}` });

        const btn = row.createEl("button", {
          cls: `srs-toggle-btn ${isOn ? "srs-toggle-active" : "srs-toggle-disabled"}`,
          title: isOn ? "Active (click to disable)" : "Disabled (click to enable)",
        });
        obsidian.setIcon(btn, isOn ? "check" : "circle");
        btn.style.setProperty("background-color", isOn ? "#2e7d32" : "rgba(255,255,255,0.05)", "important");
        btn.style.setProperty("color", isOn ? "#fff" : "#555", "important");
        btn.addEventListener("click", async () => {
          rel.enabled = !isOn;
          await this.plugin.saveSettings();
          this.display();
        });

        const fwd = row.createEl("input", { type: "text", placeholder: "", value: rel.forward || "" });
        fwd.addEventListener("input", async e => {
          rel.forward = e.target.value;
          await this.plugin.saveSettings();
        });
        new VaultPropertySuggest(this.app, fwd, async v => {
          rel.forward = v;
          await this.plugin.saveSettings();
        });

        row.createSpan({ cls: "srs-arrow", text: "↔" });

        const inv = row.createEl("input", { type: "text", placeholder: "", value: rel.inverse || "" });
        inv.addEventListener("input", async e => {
          rel.inverse = e.target.value;
          await this.plugin.saveSettings();
        });
        new VaultPropertySuggest(this.app, inv, async v => {
          rel.inverse = v;
          await this.plugin.saveSettings();
        });

        const del = row.createEl("button", { cls: "srs-delete-btn", title: "Delete" });
        obsidian.setIcon(del, "trash");
        del.addEventListener("click", async () => {
          this.plugin.settings.relations.splice(i, 1);
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }

    // ── Restore scroll position ──
    if (prevScroll > 0) el.scrollTop = prevScroll;
    if (parentScroll > 0 && el.parentElement) el.parentElement.scrollTop = parentScroll;
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (prevScroll > 0) el.scrollTop = prevScroll;
        if (parentScroll > 0 && el.parentElement) el.parentElement.scrollTop = parentScroll;
      });
    }
  }
}

/* ═════════════════════════ UNIFIED PLUGIN LIFECYCLE ═════════════════════════ */

class RelationsSuitePlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();

    // ── 1. Relation Sync Engine Setup ──
    this.writeQueue = new Map();
    this.flushPending = false;
    this.writeGuard = new Set();

    this.registerEvent(
      this.app.metadataCache.on("changed", file => {
        if (file instanceof obsidian.TFile && file.extension === "md") {
          this.onNoteChanged(file);
          this.onNoteCreated(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", file => {
        if (file instanceof obsidian.TFile && file.extension === "md") {
          setTimeout(() => this.onNoteCreated(file), 50);
          setTimeout(() => this.onNoteCreated(file), 300);
          setTimeout(() => this.onNoteCreated(file), 800);
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-open", file => {
        if (file instanceof obsidian.TFile && file.extension === "md") {
          setTimeout(() => this.onNoteCreated(file), 50);
          setTimeout(() => this.onNoteCreated(file), 300);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof obsidian.TFile && file.extension === "md") {
          this.onNoteRenamed(file, oldPath);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", file => {
        if (file instanceof obsidian.TFile && file.extension === "md") {
          setTimeout(() => this.onNoteCreated(file), 100);
        }
      })
    );

    this.addCommand({
      id: "srs-sync-all",
      name: "Sync All Vault Relations Now",
      callback: () => this.syncAllVault(),
    });

    // ── 2. Relation Graph Viewer Setup ──
    this.registerView(
      RELATION_GRAPH_VIEW_TYPE,
      leaf => new RelationGraphView(leaf, this)
    );

    this.addRibbonIcon("git-fork", "Relationship Path Graph", () => {
      this.activateGraphView();
    });

    this.addCommand({
      id: "open-relation-path-graph",
      name: "Open Relationship Path Graph",
      callback: () => this.activateGraphView(),
    });

    // ── 3. Family Tree Viewer Setup ──
    this.registerView(
      FAMILY_TREE_VIEW_TYPE,
      leaf => new FamilyTreeView(leaf, this)
    );

    this.addRibbonIcon("git-pull-request", "Open Family Tree Viewer", () => {
      this.activateFamilyTreeView();
    });

    this.addCommand({
      id: "open-family-tree-viewer",
      name: "Open Family Tree Viewer",
      callback: () => this.activateFamilyTreeView(),
    });

    // ── 4. Unified Settings Tab ──
    this.addSettingTab(new RelationsSuiteSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(RELATION_GRAPH_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(FAMILY_TREE_VIEW_TYPE);
  }

  async activateGraphView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(RELATION_GRAPH_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: RELATION_GRAPH_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async activateFamilyTreeView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(FAMILY_TREE_VIEW_TYPE)[0];
    if (!leaf) {
      const rightLeaf = workspace.getLeaf(true);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: FAMILY_TREE_VIEW_TYPE,
          active: true,
        });
        leaf = rightLeaf;
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  // Alias for backwards compatibility
  async activateView() {
    return this.activateFamilyTreeView();
  }

  getExcludedPropertiesList() {
    const raw = this.plugin ? this.plugin.settings.rpg_excludedProperties : (this.settings ? this.settings.rpg_excludedProperties : []);
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      return raw.split(",").map(s => s.trim()).filter(Boolean);
    }
    return DEFAULT_SETTINGS.rpg_excludedProperties;
  }

  async loadSettings() {
    const saved = await this.loadData() || {};
    if (typeof saved.includedFolders === "string") {
      saved.includedFolders = saved.includedFolders.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    }
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

    const arrayKeys = [
      "includedFolders", "maleValues", "femaleValues", "rpg_excludedProperties",
      "excludedProperties", "ft_excludeValues", "excludeValues", "ft_selectedCardProps",
      "selectedCardProps", "fatherProps", "motherProps", "husbandProps", "wifeProps",
      "sonProps", "daughterProps", "brotherProps", "sisterProps", "genderProps"
    ];
    for (const key of arrayKeys) {
      if (typeof this.settings[key] === "string") {
        this.settings[key] = this.settings[key].split(",").map(s => s.trim()).filter(Boolean);
      } else if (!Array.isArray(this.settings[key])) {
        this.settings[key] = [];
      }
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

/* ─── folder filter ─── */

  isIncluded(file) {
    const folders = (this.settings.includedFolders || [])
      .map(f => f.trim().replace(/^\/|\/$/g, "")).filter(Boolean);
    if (!folders.length) return true;
    return folders.some(f => file.path === f || file.path.startsWith(f + "/"));
  }

  /* ─── file resolver ─── */

  resolve(name, fromPath = "") {
    if (!name) return null;
    const f = this.app.metadataCache.getFirstLinkpathDest(name, fromPath);
    if (f instanceof obsidian.TFile) return f;
    const lo = bare(name).toLowerCase();
    return this.app.vault.getMarkdownFiles().find(x => x.basename.toLowerCase() === lo) || null;
  }

  /* ─── gender helper ─── */

  getGender(cache) {
    if (!cache || !cache.frontmatter) return "unknown";
    const gKey = (this.settings.genderProperty || "").trim().toLowerCase();
    if (!gKey) return "unknown";

    const realKey = Object.keys(cache.frontmatter).find(k => k.toLowerCase() === gKey);
    if (!realKey) return "unknown";

    const val = String(cache.frontmatter[realKey] || "").trim().toLowerCase();
    if (!val) return "unknown";

    const toList = v => Array.isArray(v) ? v.map(s => String(s).trim().toLowerCase()).filter(Boolean) : (typeof v === "string" ? v.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : []);
    const maleList = toList(this.settings.maleValues)
      ;
    const femaleList = toList(this.settings.femaleValues);

    if (maleList.includes(val)) return "male";
    if (femaleList.includes(val)) return "female";
    return "unknown";
  }

  /* ══ WRITE QUEUE (Batched Write Engine) ═════════════════════════ */

  enqueue(targetFile, propKey, sourceBasename) {
    if (!targetFile || !(targetFile instanceof obsidian.TFile)) return;
    if (!propKey || !sourceBasename) return;
    if (this.writeGuard.has(targetFile.path)) return;

    const name = bare(sourceBasename);
    if (!name) return;

    if (!this.writeQueue.has(targetFile.path))
      this.writeQueue.set(targetFile.path, new Map());
    const fm = this.writeQueue.get(targetFile.path);
    if (!fm.has(propKey)) fm.set(propKey, new Set());
    fm.get(propKey).add(name);

    if (!this.flushPending) {
      this.flushPending = true;
      Promise.resolve().then(() => this.flush());
    }
  }

  async flush() {
    this.flushPending = false;
    const snapshot = new Map(this.writeQueue);
    this.writeQueue.clear();

    for (const [filePath, propMap] of snapshot) {
      if (this.writeGuard.has(filePath)) continue;

      const tFile = this.app.vault.getAbstractFileByPath(filePath);
      if (!(tFile instanceof obsidian.TFile)) continue;

      this.writeGuard.add(filePath);
      try {
        await this.app.fileManager.processFrontMatter(tFile, fm => {
          for (const [propKey, names] of propMap) {
            const actualKey =
              Object.keys(fm).find(k => k.toLowerCase() === propKey.toLowerCase()) || propKey;

            for (const name of names) {
              const linkText = `[[${name}]]`;
              const lName = name.toLowerCase();

              const has = v => {
                if (!v) return false;
                if (typeof v === "string") return bare(v).toLowerCase() === lName;
                if (Array.isArray(v)) return v.some(i => typeof i === "string" && bare(i).toLowerCase() === lName);
                if (typeof v === "object") return bare(v.link || "").toLowerCase() === lName;
                return false;
              };

              const cur = fm[actualKey];
              if (cur == null) {
                fm[actualKey] = linkText;
              } else if (Array.isArray(cur)) {
                if (!cur.some(has)) cur.push(linkText);
              } else if (!has(cur)) {
                fm[actualKey] = [cur, linkText];
              }
            }
          }
        });
      } catch (_) {}

      // Force active leaf view to repaint properties panel instantly without page switching
      const activeLeaf = this.app.workspace.activeLeaf;
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && activeFile.path === filePath) {
        try {
          this.app.metadataCache.trigger("changed", tFile);
          if (activeLeaf && activeLeaf.view) {
            if (typeof activeLeaf.view.requestSave === "function") activeLeaf.view.requestSave();
            if (activeLeaf.view.previewMode && typeof activeLeaf.view.previewMode.rerender === "function") {
              activeLeaf.view.previewMode.rerender(true);
            }
          }
        } catch (_) {}
      }

      setTimeout(() => this.writeGuard.delete(filePath), 80);
    }
  }

  /* ─── event handlers ─── */

  onNoteChanged(file) {
    if (this.writeGuard.has(file.path)) return;
    if (!this.isIncluded(file)) return;
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return;
    this.runSync(file, cache);
  }

  async onNoteRenamed(file, oldPath) {
    if (!(file instanceof obsidian.TFile) || file.extension !== "md") return;
    const oldBasename = oldPath.split("/").pop().replace(/\.md$/i, "").trim();
    const newBasename = file.basename;
    if (!oldBasename || !newBasename || oldBasename.toLowerCase() === newBasename.toLowerCase()) return;

    const oldLower = oldBasename.toLowerCase();

    for (const src of this.app.vault.getMarkdownFiles()) {
      if (!this.isIncluded(src)) continue;
      const cache = this.app.metadataCache.getFileCache(src);
      if (!cache || !cache.frontmatter) continue;

      let fileNeedsUpdate = false;
      const fm = cache.frontmatter;

      for (const k of Object.keys(fm)) {
        if (k === "position") continue;
        const val = fm[k];
        if (!val) continue;

        const checkMatch = (item) => typeof item === "string" && bare(item).toLowerCase() === oldLower;
        if (Array.isArray(val) ? val.some(checkMatch) : checkMatch(val)) {
          fileNeedsUpdate = true;
          break;
        }
      }

      if (fileNeedsUpdate) {
        try {
          await this.app.fileManager.processFrontMatter(src, fmObj => {
            for (const k of Object.keys(fmObj)) {
              if (k === "position") continue;
              const v = fmObj[k];
              if (!v) continue;

              const replaceItem = (item) => {
                if (typeof item === "string" && bare(item).toLowerCase() === oldLower) {
                  return `[[${newBasename}]]`;
                }
                return item;
              };

              if (Array.isArray(v)) {
                fmObj[k] = v.map(replaceItem);
              } else if (typeof v === "string" && bare(v).toLowerCase() === oldLower) {
                fmObj[k] = `[[${newBasename}]]`;
              }
            }
          });
        } catch (_) {}
      }
    }

    setTimeout(() => this.onNoteCreated(file), 150);
  }

  onNoteCreated(targetFile) {
    for (const src of this.app.vault.getMarkdownFiles()) {
      if (src.path === targetFile.path) continue;
      if (!this.isIncluded(src)) continue;
      const cache = this.app.metadataCache.getFileCache(src);
      if (!cache || !cache.frontmatter) continue;

      this.runSync(src, cache);
    }
  }

  async syncAllVault() {
    const files = this.app.vault.getMarkdownFiles().filter(f => this.isIncluded(f));
    new obsidian.Notice(`Simple Relation Sync: scanning ${files.length} notes…`);
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache) this.runSync(file, cache);
    }
    await this.flush();
    new obsidian.Notice("Simple Relation Sync: done!");
  }

  /* ─── core sync engine ─── */

  runSync(sourceFile, cache) {
    this.applyPairs(sourceFile, cache);
    this.applyGenderSmartRelations(sourceFile, cache);
    if (this.settings.autoLinkSiblings)        this.applySiblings(sourceFile, cache);
    if (this.settings.autoLinkSpouseCoParent)  this.applyCoParent(sourceFile, cache);
  }

  applyPairs(source, cache) {
    for (const rel of (this.settings.relations || [])) {
      if (rel.enabled === false || !rel.forward || !rel.inverse) continue;
      for (const [srcKey, dstKey] of [[rel.forward, rel.inverse], [rel.inverse, rel.forward]]) {
        for (const name of linksUnderProp(cache, srcKey)) {
          const target = this.resolve(name, source.path);
          if (target && target.path !== source.path && this.isIncluded(target))
            this.enqueue(target, dstKey, source.basename);
        }
      }
    }
  }

  /* ─── Gender-Smart Automatic Relations Engine ─── */

  applyGenderSmartRelations(source, cache) {
    const S = this.settings;
    const srcGender = this.getGender(cache);

    const getFirst = v => Array.isArray(v) ? (v[0] || "").trim() : String(v || "").trim();
    const broKey  = getFirst(S.brotherProperty);
    const sisKey  = getFirst(S.sisterProperty);
    const fatKey  = getFirst(S.fatherProperty);
    const motKey  = getFirst(S.motherProperty);
    const husbKey = getFirst(S.husbandProperty);
    const wifeKey = getFirst(S.wifeProperty);
    const sonKey  = getFirst(S.sonProperty);
    const dauKey  = getFirst(S.daughterProperty);

    // 1. Sibling Linking
    const processSibling = (sourcePropKey) => {
      if (!sourcePropKey) return;
      for (const name of linksUnderProp(cache, sourcePropKey)) {
        const target = this.resolve(name, source.path);
        if (!target || target.path === source.path || !this.isIncluded(target)) continue;

        let targetProp = null;
        if (srcGender === "male") targetProp = broKey;
        else if (srcGender === "female") targetProp = sisKey;
        else targetProp = (sourcePropKey.toLowerCase() === broKey.toLowerCase()) ? broKey : sisKey;

        if (targetProp) this.enqueue(target, targetProp, source.basename);
      }
    };
    processSibling(broKey);
    processSibling(sisKey);

    // 2. Spouse Linking
    if (wifeKey && husbKey) {
      for (const name of linksUnderProp(cache, wifeKey)) {
        const target = this.resolve(name, source.path);
        if (target && target.path !== source.path && this.isIncluded(target))
          this.enqueue(target, husbKey, source.basename);
      }
      for (const name of linksUnderProp(cache, husbKey)) {
        const target = this.resolve(name, source.path);
        if (target && target.path !== source.path && this.isIncluded(target))
          this.enqueue(target, wifeKey, source.basename);
      }
    }

    // 3. Child -> Parent
    const processChildToParent = (sourceParentPropKey) => {
      if (!sourceParentPropKey) return;
      for (const name of linksUnderProp(cache, sourceParentPropKey)) {
        const targetParent = this.resolve(name, source.path);
        if (!targetParent || targetParent.path === source.path || !this.isIncluded(targetParent)) continue;

        let childPropOnParent = null;
        if (srcGender === "male") childPropOnParent = sonKey;
        else if (srcGender === "female") childPropOnParent = dauKey;
        else childPropOnParent = sonKey || dauKey;

        if (childPropOnParent) this.enqueue(targetParent, childPropOnParent, source.basename);
      }
    };
    processChildToParent(fatKey);
    processChildToParent(motKey);

    // 3b. Auto Link Parents as Spouses (Child note lists both Father & Mother)
    if (fatKey && motKey && wifeKey && husbKey) {
      const fatherNames = linksUnderProp(cache, fatKey);
      const motherNames = linksUnderProp(cache, motKey);
      for (const fName of fatherNames) {
        const fFile = this.resolve(fName, source.path);
        for (const mName of motherNames) {
          const mFile = this.resolve(mName, source.path);
          if (fFile && fFile.path !== source.path && this.isIncluded(fFile)) {
            this.enqueue(fFile, wifeKey, mName);
          }
          if (mFile && mFile.path !== source.path && this.isIncluded(mFile)) {
            this.enqueue(mFile, husbKey, fName);
          }
        }
      }
    }

    // 3c. Full Family Tree Transitive Graph (Child note connects its Siblings ↔ Parents & Siblings ↔ Siblings)
    const fatherNames = fatKey ? linksUnderProp(cache, fatKey) : [];
    const motherNames = motKey ? linksUnderProp(cache, motKey) : [];
    const brotherNames = broKey ? linksUnderProp(cache, broKey) : [];
    const sisterNames = sisKey ? linksUnderProp(cache, sisKey) : [];

    const hasParents = fatherNames.length || motherNames.length;
    const hasSiblings = brotherNames.length || sisterNames.length;

    if (hasParents && hasSiblings) {
      // Connect Father to Brothers & Sisters
      for (const fName of fatherNames) {
        const fFile = this.resolve(fName, source.path);
        for (const bName of brotherNames) {
          if (fFile && fFile.path !== source.path && this.isIncluded(fFile) && sonKey) {
            this.enqueue(fFile, sonKey, bName);
          }
          const bFile = this.resolve(bName, source.path);
          if (bFile && bFile.path !== source.path && this.isIncluded(bFile) && fatKey) {
            this.enqueue(bFile, fatKey, fName);
          }
        }
        for (const sName of sisterNames) {
          if (fFile && fFile.path !== source.path && this.isIncluded(fFile) && dauKey) {
            this.enqueue(fFile, dauKey, sName);
          }
          const sFile = this.resolve(sName, source.path);
          if (sFile && sFile.path !== source.path && this.isIncluded(sFile) && fatKey) {
            this.enqueue(sFile, fatKey, fName);
          }
        }
      }

      // Connect Mother to Brothers & Sisters
      for (const mName of motherNames) {
        const mFile = this.resolve(mName, source.path);
        for (const bName of brotherNames) {
          if (mFile && mFile.path !== source.path && this.isIncluded(mFile) && sonKey) {
            this.enqueue(mFile, sonKey, bName);
          }
          const bFile = this.resolve(bName, source.path);
          if (bFile && bFile.path !== source.path && this.isIncluded(bFile) && motKey) {
            this.enqueue(bFile, motKey, mName);
          }
        }
        for (const sName of sisterNames) {
          if (mFile && mFile.path !== source.path && this.isIncluded(mFile) && dauKey) {
            this.enqueue(mFile, dauKey, sName);
          }
          const sFile = this.resolve(sName, source.path);
          if (sFile && sFile.path !== source.path && this.isIncluded(sFile) && motKey) {
            this.enqueue(sFile, motKey, mName);
          }
        }
      }

      // Cross-link Brothers & Sisters to each other
      for (const bName of brotherNames) {
        const bFile = this.resolve(bName, source.path);
        if (bFile && bFile.path !== source.path && this.isIncluded(bFile)) {
          if (broKey) brotherNames.forEach(otherB => { if (otherB.toLowerCase() !== bName.toLowerCase()) this.enqueue(bFile, broKey, otherB); });
          if (sisKey) sisterNames.forEach(sName => this.enqueue(bFile, sisKey, sName));
        }
      }
      for (const sName of sisterNames) {
        const sFile = this.resolve(sName, source.path);
        if (sFile && sFile.path !== source.path && this.isIncluded(sFile)) {
          if (broKey) brotherNames.forEach(bName => this.enqueue(sFile, broKey, bName));
          if (sisKey) sisterNames.forEach(otherS => { if (otherS.toLowerCase() !== sName.toLowerCase()) this.enqueue(sFile, sisKey, otherS); });
        }
      }
    }

    // 4. Parent -> Child
    const processParentToChild = (sourceChildPropKey) => {
      if (!sourceChildPropKey) return;
      for (const name of linksUnderProp(cache, sourceChildPropKey)) {
        const targetChild = this.resolve(name, source.path);
        if (!targetChild || targetChild.path === source.path || !this.isIncluded(targetChild)) continue;

        let parentPropOnChild = null;
        if (srcGender === "male") parentPropOnChild = fatKey;
        else if (srcGender === "female") parentPropOnChild = motKey;
        else {
          const hasWife = wifeKey && linksUnderProp(cache, wifeKey).length > 0;
          const hasHusb = husbKey && linksUnderProp(cache, husbKey).length > 0;
          if (hasWife) parentPropOnChild = fatKey;
          else if (hasHusb) parentPropOnChild = motKey;
        }

        if (parentPropOnChild) this.enqueue(targetChild, parentPropOnChild, source.basename);
      }
    };
    processParentToChild(sonKey);
    processParentToChild(dauKey);
  }

  applySiblings(parentFile, cache) {
    const S = this.settings;
    const getFirst = v => Array.isArray(v) ? (v[0] || "").trim() : String(v || "").trim();
    const sonKey = getFirst(S.sonProperty);
    const dauKey = getFirst(S.daughterProperty);
    const broKey = getFirst(S.brotherProperty);
    const sisKey = getFirst(S.sisterProperty);

    const sonNames = sonKey ? linksUnderProp(cache, sonKey) : [];
    const dauNames = dauKey ? linksUnderProp(cache, dauKey) : [];
    if (!sonNames.length && !dauNames.length) return;

    const parentGender = this.getGender(cache);
    const wifeKey = getFirst(S.wifeProperty);
    const husbKey = getFirst(S.husbandProperty);
    const fatKey  = getFirst(S.fatherProperty);
    const motKey  = getFirst(S.motherProperty);

    let parentLabel = null;
    if (parentGender === "male") parentLabel = fatKey;
    else if (parentGender === "female") parentLabel = motKey;
    else if (wifeKey && linksUnderProp(cache, wifeKey).length > 0) parentLabel = fatKey;
    else if (husbKey && linksUnderProp(cache, husbKey).length > 0) parentLabel = motKey;

    for (const sName of sonNames) {
      const sFile = this.resolve(sName, parentFile.path);
      if (!sFile || !this.isIncluded(sFile)) continue;

      if (parentLabel) this.enqueue(sFile, parentLabel, parentFile.basename);
      if (broKey) sonNames.forEach(n => { if (n.toLowerCase() !== sFile.basename.toLowerCase()) this.enqueue(sFile, broKey, n); });
      if (sisKey) dauNames.forEach(n => this.enqueue(sFile, sisKey, n));
    }

    for (const dName of dauNames) {
      const dFile = this.resolve(dName, parentFile.path);
      if (!dFile || !this.isIncluded(dFile)) continue;

      if (parentLabel) this.enqueue(dFile, parentLabel, parentFile.basename);
      if (broKey) sonNames.forEach(n => this.enqueue(dFile, broKey, n));
      if (sisKey) dauNames.forEach(n => { if (n.toLowerCase() !== dFile.basename.toLowerCase()) this.enqueue(dFile, sisKey, n); });
    }
  }

  applyCoParent(parentFile, cache) {
    const S = this.settings;
    const getFirst = v => Array.isArray(v) ? (v[0] || "").trim() : String(v || "").trim();
    const fatKey  = getFirst(S.fatherProperty);
    const motKey  = getFirst(S.motherProperty);
    const husbKey = getFirst(S.husbandProperty);
    const wifeKey = getFirst(S.wifeProperty);
    const sonKey  = getFirst(S.sonProperty);
    const dauKey  = getFirst(S.daughterProperty);

    const sonNames = sonKey ? linksUnderProp(cache, sonKey) : [];
    const dauNames = dauKey ? linksUnderProp(cache, dauKey) : [];
    if (!sonNames.length && !dauNames.length) return;

    const wifeNames = wifeKey ? linksUnderProp(cache, wifeKey) : [];
    for (const wName of wifeNames) {
      const wifeFile = this.resolve(wName, parentFile.path);
      if (wifeFile && husbKey && this.isIncluded(wifeFile))
        this.enqueue(wifeFile, husbKey, parentFile.basename);

      for (const cName of sonNames) {
        const cFile = this.resolve(cName, parentFile.path);
        if (cFile && this.isIncluded(cFile)) {
          if (fatKey) this.enqueue(cFile, fatKey, parentFile.basename);
          if (motKey) this.enqueue(cFile, motKey, wName);
        }
        if (wifeFile && sonKey && this.isIncluded(wifeFile))
          this.enqueue(wifeFile, sonKey, cName);
      }
      for (const cName of dauNames) {
        const cFile = this.resolve(cName, parentFile.path);
        if (cFile && this.isIncluded(cFile)) {
          if (fatKey) this.enqueue(cFile, fatKey, parentFile.basename);
          if (motKey) this.enqueue(cFile, motKey, wName);
        }
        if (wifeFile && dauKey && this.isIncluded(wifeFile))
          this.enqueue(wifeFile, dauKey, cName);
      }
    }

    const husbNames = husbKey ? linksUnderProp(cache, husbKey) : [];
    for (const hName of husbNames) {
      const husbFile = this.resolve(hName, parentFile.path);
      if (husbFile && wifeKey && this.isIncluded(husbFile))
        this.enqueue(husbFile, wifeKey, parentFile.basename);

      for (const cName of sonNames) {
        const cFile = this.resolve(cName, parentFile.path);
        if (cFile && this.isIncluded(cFile)) {
          if (motKey) this.enqueue(cFile, motKey, parentFile.basename);
          if (fatKey) this.enqueue(cFile, fatKey, hName);
        }
        if (husbFile && sonKey && this.isIncluded(husbFile))
          this.enqueue(husbFile, sonKey, cName);
      }
      for (const cName of dauNames) {
        const cFile = this.resolve(cName, parentFile.path);
        if (cFile && this.isIncluded(cFile)) {
          if (motKey) this.enqueue(cFile, motKey, parentFile.basename);
          if (fatKey) this.enqueue(cFile, fatKey, hName);
        }
        if (husbFile && dauKey && this.isIncluded(husbFile))
          this.enqueue(husbFile, dauKey, cName);
      }
    }
  }
}

module.exports = RelationsSuitePlugin;
