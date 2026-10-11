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
  autoLinkSiblings: true,
  autoLinkSpouseCoParent: true,
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
  familyBranchSpacing: 90,
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
  if ((n.startsWith('"') && n.endsWith('"')) || (n.startsWith("'") && n.endsWith("'"))) {
    n = n.slice(1, -1).trim();
  }
  if (n.startsWith("[[") && n.endsWith("]]")) n = n.slice(2, -2);
  const p = n.indexOf("|"); if (p !== -1) n = n.slice(0, p);
  const h = n.indexOf("#"); if (h !== -1) n = n.slice(0, h);
  n = n.split("/").pop().split("\\").pop();
  return n.replace(/\.md$/i, "").trim();
}

function linksUnderProp(cache, propKey) {
  if (!cache || !propKey) return [];
  const lk = propKey.toLowerCase();
  const results = new Set();

  const fm = cache.frontmatter;
  if (fm) {
    const realKey = Object.keys(fm).find(k => k.toLowerCase() === lk);
    if (realKey && fm[realKey] != null) {
      const val = fm[realKey];
      const items = Array.isArray(val) ? val : [val];
      for (const item of items) {
        if (!item) continue;
        if (typeof item === "string") {
          const rx = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
          let m, found = false;
          while ((m = rx.exec(item)) !== null) { results.add(bare(m[1])); found = true; }
          if (!found) {
            const cleaned = bare(item);
            if (cleaned) results.add(cleaned);
          }
        } else if (typeof item === "object") {
          const n = bare(item.link || item.path || item.displayText || item.toFileName || item.original || "");
          if (n) results.add(n);
        }
      }
    }
    return [...results].filter(Boolean);
  }

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
    this.wrapperEl = containerEl;
    this.props = Array.isArray(initialProps) ? [...initialProps] : [];
    this.getAvailableProps = getAvailableProps;
    this.onChange = onChange;
    this.placeholderText = placeholderText;
    this.placeholderAdd = placeholderAdd;

    this.render();
  }

  render() {
    this.wrapperEl.empty();
    this.wrapperEl.removeClass("ft-pill-container");
    this.wrapperEl.addClass("ft-pill-wrapper");

    // Scrollable pill box container
    this.boxEl = this.wrapperEl.createDiv({ cls: "ft-pill-container" });

    // Render pill badges
    this.props.forEach((prop, idx) => {
      const pill = this.boxEl.createSpan({ cls: "ft-pill", text: prop });
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
    this.input = this.boxEl.createEl("input", {
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

      // Attach dropdown directly to wrapperEl (NOT inside the overflow-y auto boxEl!)
      dropdown = this.wrapperEl.createDiv({ cls: "ft-pill-dropdown" });
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

    this.boxEl.addEventListener("click", () => {
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
    this.activePathElements = [];
    this.hasRenderedOnce = false;

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
    this.draggedNodeEl = null;
    this.dragStartPos = { x: 0, y: 0 };
    this.dragOffset = null;
    this.explicitPinnedSet = new Set();
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

    requestAnimationFrame(() => this.resetView());
    setTimeout(() => this.resetView(), 100);

    let debounceTimer = null;
    const triggerAutoRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.updateGraph();
      }, 300);
    };

    this.registerEvent(this.app.metadataCache.on("changed", () => triggerAutoRefresh()));
    this.registerEvent(this.app.vault.on("create", () => triggerAutoRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => triggerAutoRefresh()));
    this.registerEvent(this.app.vault.on("rename", () => triggerAutoRefresh()));
  }

  onClose() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
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
    resetBtn.addEventListener("click", () => this.clearActivePath());

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
    resetZoomBtn.addEventListener("click", () => {
      this.wakeSimulation(0.4);
      this.resetView();
    });
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

    this.activePathGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.viewport.appendChild(this.activePathGroup);

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
      this.applyZoom(zoomFactor);
    });

    this.canvasWrapper.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      if (e.target.closest(".rpg-node")) return;
      this.isPanning = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      this.canvasWrapper.classList.add("is-panning");
    });

    window.addEventListener("mousemove", e => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
      } else if (this.draggedNode) {
        // Dragging a node in canvas space
        const p = this.screenToCanvasPoint(e.clientX, e.clientY);
        const offX = this.dragOffset ? this.dragOffset.x : 0;
        const offY = this.dragOffset ? this.dragOffset.y : 0;
        this.draggedNode.x = p.x - offX;
        this.draggedNode.y = p.y - offY;
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;
        if (this.draggedNodeEl) {
          this.draggedNodeEl.setAttribute("transform", `translate(${this.draggedNode.x}, ${this.draggedNode.y})`);
        }
        this.updateConnectedLinesForNode(this.draggedNode);
        this.wakeSimulation(0.4);
      }
    });

    window.addEventListener("mouseup", () => {
      this.isPanning = false;
      this.canvasWrapper.classList.remove("is-panning", "is-dragging");
      if (this.draggedNodeEl) {
        this.draggedNodeEl.classList.remove("is-dragging");
      }
      if (this.draggedNode) {
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;
        const droppedNode = this.draggedNode;
        this.draggedNode = null;
        this.draggedNodeEl = null;
        this.dragOffset = null;
        this.hideTooltip();
        this.unhighlightConnected();
        this.updateConnectedLinesForNode(droppedNode);
        this.wakeSimulation(0.35);
      }
    });

    this.canvasWrapper.addEventListener("mouseleave", () => {
      if (!this.draggedNode) {
        this.hideTooltip();
        this.unhighlightConnected();
      }
    });

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            this.resetView();
          }
        }
      });
      this.resizeObserver.observe(this.canvasWrapper);
    }
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
    const k = (this.baseKey || this.plugin.settings.rpg_basePropertyName || "base").toLowerCase();
    const targetVal = (this.selectedBaseVal || this.plugin.settings.rpg_defaultBaseValue || "").toLowerCase().trim();
    const result = [];

    const exclValues = [
      ...(this.plugin.settings.excludeValues || []),
      ...(this.plugin.settings.ft_excludeValues || [])
    ].map(v => bare(String(v || "")).toLowerCase().trim()).filter(Boolean);

    const matchBase = (b, filter) => {
      if (!b || !filter) return false;
      const bLower = b.toLowerCase().trim();
      const fLower = filter.toLowerCase().trim();
      if (bLower === fLower) return true;
      const bClean = bLower.replace(/\.md$/, "").replace(/\.base$/, "");
      const fClean = fLower.replace(/\.md$/, "").replace(/\.base$/, "");
      return bClean === fClean;
    };

    const exclProp = (this.plugin.settings.ft_excludePropertyName || this.plugin.settings.excludePropertyName || "").toLowerCase().trim();
    const exclPropVal = (this.plugin.settings.ft_excludePropertyValue || this.plugin.settings.excludePropertyValue || "").toLowerCase().trim();

    for (const f of this.app.vault.getMarkdownFiles()) {
      const bLo = f.basename.toLowerCase().trim();

      // Exclude files matching user-configured excluded values
      if (exclValues.includes(bLo)) continue;

      const cache = this.app.metadataCache.getFileCache(f);
      if (!cache || !cache.frontmatter) continue;
      const fm = cache.frontmatter;

      // Exclude files matching user-configured excluded property and values
      if (exclProp && exclProp !== "(none)") {
        const propKey = Object.keys(fm).find(pk => pk.toLowerCase() === exclProp);
        if (propKey && fm[propKey] != null) {
          const rawVals = Array.isArray(fm[propKey]) ? fm[propKey] : [fm[propKey]];
          const valMatches = rawVals.some(v => {
            const cleanVal = bare(typeof v === "object" ? (v.link || "") : String(v || "")).toLowerCase().trim();
            if (exclPropVal && cleanVal === exclPropVal) return true;
            if (exclValues.includes(cleanVal)) return true;
            return false;
          });
          if (valMatches) continue;
        }
      }

      // 6. Base property matching
      if (targetVal) {
        const realKey = Object.keys(fm).find(key => key.toLowerCase() === k);
        if (!realKey) continue;
        const v = fm[realKey];
        const items = Array.isArray(v) ? v : [v];
        const hasBase = items.some(item => {
          if (!item) return false;
          const bName = bare(typeof item === "object" ? (item.link || "") : String(item || ""));
          return matchBase(bName, targetVal);
        });
        if (!hasBase) continue;
      }

      result.push(f);
    }
    return result;
  }

  getExcludedPropertiesSet() {
    const list = this.plugin.getExcludedPropertiesList();
    const set = new Set(list.map(s => s.trim().toLowerCase()).filter(Boolean));
    const ftExclProp = (this.plugin.settings.ft_excludePropertyName || this.plugin.settings.excludePropertyName || "").toLowerCase().trim();
    if (ftExclProp && ftExclProp !== "(none)") set.add(ftExclProp);
    if (this.baseKey) set.add(this.baseKey.trim().toLowerCase());
    set.add("base");
    set.add("bases");
    set.add("tag");
    set.add("tags");
    set.add("template");
    set.add("templates");
    set.add("type");
    set.add("types");
    set.add("aliases");
    set.add("alias");
    set.add("position");
    return set;
  }

  /* ─── Graph Construction & Pathfinding (Point 1: Deduplication) ─── */

  buildGraphData() {
    const baseFiles = this.getFilesMatchingBase();
    const fileSet = new Map();
    baseFiles.forEach(f => fileSet.set(f.basename.toLowerCase(), f));

    const excluded = this.getExcludedPropertiesSet();
    const edges = [];
    const edgeKeySet = new Set();
    const degreeMap = new Map();
    baseFiles.forEach(f => degreeMap.set(f.basename.toLowerCase(), 0));

    // 1. Build edges from all non-excluded properties and calculate connectivity degree
    for (const f of baseFiles) {
      const cache = this.app.metadataCache.getFileCache(f);
      if (!cache || !cache.frontmatter) continue;

      for (const propKey of Object.keys(cache.frontmatter)) {
        if (propKey === "position") continue;
        if (excluded.has(propKey.toLowerCase())) continue;
        if (this.baseKey && propKey.toLowerCase() === this.baseKey.toLowerCase()) continue;

        const linkedNames = linksUnderProp(cache, propKey);
        for (const targetName of linkedNames) {
          const targetLower = targetName.toLowerCase();
          if (this.selectedBaseVal && targetLower === this.selectedBaseVal.toLowerCase()) continue;
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
              degreeMap.set(f.basename.toLowerCase(), (degreeMap.get(f.basename.toLowerCase()) || 0) + 1);
              degreeMap.set(targetLower, (degreeMap.get(targetLower) || 0) + 1);
            }
          }
        }
      }
    }

    // 2. Build deduplicated undirected edges for physics simulation
    const undirectedEdges = [];
    const undirectedEdgeSet = new Set();
    for (const edge of edges) {
      const u = edge.sourceId.toLowerCase();
      const v = edge.targetId.toLowerCase();
      const undirectedKey = u < v ? `${u}---${v}` : `${v}---${u}`;
      if (!undirectedEdgeSet.has(undirectedKey)) {
        undirectedEdgeSet.add(undirectedKey);
        undirectedEdges.push({ sourceId: edge.sourceId, targetId: edge.targetId });
      }
    }

    // 3. Sort files by degree descending: highest degree (hubs) placed at center (r ≈ 0),
    // lowest / zero degree (leaves/unconnected) placed on the outer boundary (r ≈ 260)
    const sortedFiles = [...baseFiles].sort((a, b) => {
      const degA = degreeMap.get(a.basename.toLowerCase()) || 0;
      const degB = degreeMap.get(b.basename.toLowerCase()) || 0;
      return degB - degA;
    });

    const nodes = [];
    const nodeMap = new Map();
    const existingNodeMap = (this.graphData && this.graphData.nodeMap) || new Map();
    const count = sortedFiles.length;

    sortedFiles.forEach((f, idx) => {
      const deg = degreeMap.get(f.basename.toLowerCase()) || 0;
      const existing = existingNodeMap.get(f.basename.toLowerCase());
      // Filled circular disc distribution: center r=0 for hubs, perimeter r=260 for leaves
      const phi = idx * 137.5 * (Math.PI / 180);
      const r = Math.sqrt((idx + 0.5) / Math.max(count, 1)) * 260;
      const initX = Math.cos(phi) * r;
      const initY = Math.sin(phi) * r;
      const node = {
        id: f.basename,
        file: f,
        deg: deg,
        x: existing && Number.isFinite(existing.x) ? existing.x : initX,
        y: existing && Number.isFinite(existing.y) ? existing.y : initY,
        vx: 0,
        vy: 0,
        isPinned: this.explicitPinnedSet ? this.explicitPinnedSet.has(f.basename.toLowerCase()) : false,
        isEndpoint: false,
        isIntermediate: false,
        isDimmed: false,
      };
      nodes.push(node);
      nodeMap.set(f.basename.toLowerCase(), node);
    });

    return { nodes, nodeMap, edges, undirectedEdges, edgeElements: [], nodeElements: [] };
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

    const findSingleShortestPath = (excludedEdges = new Set()) => {
      const q = [sLower];
      const pMap = new Map();
      pMap.set(sLower, null);

      while (q.length > 0) {
        const curr = q.shift();
        if (curr === eLower) break;
        const nbrs = adj.get(curr);
        if (!nbrs) continue;
        for (const nbr of nbrs.keys()) {
          const edgeKey1 = `${curr}---${nbr}`;
          const edgeKey2 = `${nbr}---${curr}`;
          if (excludedEdges.has(edgeKey1) || excludedEdges.has(edgeKey2)) continue;

          if (!pMap.has(nbr)) {
            pMap.set(nbr, curr);
            q.push(nbr);
          }
        }
      }

      if (!pMap.has(eLower)) return null;

      const pathNodes = [];
      let curr = eLower;
      while (curr !== null) {
        pathNodes.push(curr);
        curr = pMap.get(curr);
      }
      pathNodes.reverse();
      return pathNodes;
    };

    const pathToSteps = (nodeList) => {
      return nodeList.map((node, i) => {
        if (i === 0) return { node, edgeProp: null };
        const prev = nodeList[i - 1];
        const edgeInfo = adj.get(prev)?.get(node);
        const prop = (edgeInfo && (edgeInfo.forwardProps[0] || edgeInfo.reverseProps[0])) || "related";
        return { node, edgeProp: prop };
      });
    };

    // 1. Initial guaranteed shortest path (symmetric BFS)
    const initialNodes = findSingleShortestPath();
    if (!initialNodes) return [];

    const foundPaths = [pathToSteps(initialNodes)];
    const seenSequences = new Set([initialNodes.join("->")]);
    const candidatePaths = [];

    // 2. Discover alternative paths (Yen's K-Shortest Path approach)
    for (let k = 0; k < foundPaths.length && foundPaths.length < 10; k++) {
      const currentPathNodes = foundPaths[k].map(step => step.node);

      for (let i = 0; i < currentPathNodes.length - 1; i++) {
        const u = currentPathNodes[i];
        const v = currentPathNodes[i + 1];
        const excludedEdges = new Set([`${u}---${v}`, `${v}---${u}`]);

        const altNodes = findSingleShortestPath(excludedEdges);
        if (altNodes) {
          const seq = altNodes.join("->");
          if (!seenSequences.has(seq)) {
            seenSequences.add(seq);
            candidatePaths.push(altNodes);
          }
        }
      }

      candidatePaths.sort((a, b) => a.length - b.length);
      while (candidatePaths.length > 0 && foundPaths.length < 10) {
        const nextBest = candidatePaths.shift();
        foundPaths.push(pathToSteps(nextBest));
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

    if (!this.graphData || !this.graphData.nodes || !this.graphData.nodes.length) {
      this.graphData = this.buildGraphData();
      this.renderGraph();
    }

    this.paths = this.findPaths(this.graphData, this.personA, this.personB);
    this.currentPathIndex = 0;

    if (!this.paths.length) {
      this.pathLabelEl.setText(`No connection found between "${this.personA}" and "${this.personB}".`);
      this.breadcrumbEl.empty();
      this.prevBtn.disabled = true;
      this.nextBtn.disabled = true;
      this.highlightActivePathOnExistingGraph();
    } else {
      this.updatePathDisplay();
      this.highlightActivePathOnExistingGraph();
    }
  }

  changePath(delta) {
    if (!this.paths.length) return;
    this.currentPathIndex = (this.currentPathIndex + delta + this.paths.length) % this.paths.length;
    this.updatePathDisplay();
    this.highlightActivePathOnExistingGraph();
  }

  clearActivePath() {
    this.personA = "";
    this.personB = "";
    if (this.personAInput) this.personAInput.value = "";
    if (this.personBInput) this.personBInput.value = "";
    this.paths = [];
    this.currentPathIndex = 0;

    if (this.pathLabelEl) {
      this.pathLabelEl.setText("Select Person A & B to trace relationship.");
    }
    if (this.breadcrumbEl) {
      this.breadcrumbEl.empty();
    }
    if (this.prevBtn) this.prevBtn.disabled = true;
    if (this.nextBtn) this.nextBtn.disabled = true;

    this.highlightActivePathOnExistingGraph();
  }

  updatePathDisplay() {
    const total = this.paths.length;
    const idx = this.currentPathIndex;
    const isShortest = (idx === 0 && total > 1) ? " (Shortest)" : "";
    this.pathLabelEl.setText(`Path ${idx + 1} of ${total}${isShortest}`);

    this.prevBtn.disabled = total <= 1;
    this.nextBtn.disabled = total <= 1;

    // Breadcrumb
    this.breadcrumbEl.empty();
    const activePath = this.paths[idx];
    if (activePath) {
      activePath.forEach((step, i) => {
        if (i > 0) {
          const edgeSpan = this.breadcrumbEl.createSpan({ cls: "rpg-breadcrumb-edge" });
          edgeSpan.setText(` ── ${step.edgeProp} ➔ `);
        }
        const nodeSpan = this.breadcrumbEl.createSpan({ cls: "rpg-breadcrumb-node" });
        const origNode = this.graphData && this.graphData.nodeMap ? this.graphData.nodeMap.get(step.node) : null;
        nodeSpan.setText(origNode ? origNode.id : step.node);
      });
    }
  }

  updateGraph() {
    this.graphData = this.buildGraphData();
    if (this.personA && this.personB) {
      this.paths = this.findPaths(this.graphData, this.personA, this.personB);
      if (this.paths.length) {
        this.currentPathIndex = Math.min(Math.max(this.currentPathIndex || 0, 0), this.paths.length - 1);
        this.updatePathDisplay();
      } else {
        this.currentPathIndex = 0;
        this.pathLabelEl.setText(`No connection found between "${this.personA}" and "${this.personB}".`);
        this.breadcrumbEl.empty();
        this.prevBtn.disabled = true;
        this.nextBtn.disabled = true;
      }
    }
    this.renderGraph();
  }

  /* ─── SVG Rendering & Silky-Smooth Animation Loop (Point 3) ─── */

  renderGraph() {
    this.unhighlightConnected();
    const { nodes, nodeMap, edges } = this.graphData;
    this.edgesGroup.innerHTML = "";
    if (this.activePathGroup) this.activePathGroup.innerHTML = "";
    this.nodesGroup.innerHTML = "";
    this.graphData.edgeElements = [];
    this.graphData.nodeElements = [];
    this.activePathElements = [];

    if (!nodes.length) {
      this.emptyState.style.display = "block";
      this.emptyState.setText(`No notes found in Base "${this.selectedBaseVal}".`);
      return;
    }
    this.emptyState.style.display = "none";

    // Only pre-relax if this is the very first render and nodes aren't pinned yet
    const anyPinned = nodes.some(n => n.isPinned);
    if (!this.hasRenderedOnce && !anyPinned) {
      for (let step = 0; step < 80; step++) {
        const relaxAlpha = Math.max(0.02, 1 - (step / 80));
        this.computePhysics(relaxAlpha);
      }
      this.hasRenderedOnce = true;
      this.resetView();
    } else {
      this.hasRenderedOnce = true;
    }

    // ── 1. Render Background Edges ──
    for (const edge of edges) {
      const srcNode = nodeMap.get(edge.sourceId.toLowerCase());
      const tgtNode = nodeMap.get(edge.targetId.toLowerCase());
      if (!srcNode || !tgtNode) continue;
      if (!Number.isFinite(srcNode.x) || !Number.isFinite(srcNode.y) || !Number.isFinite(tgtNode.x) || !Number.isFinite(tgtNode.y)) continue;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", srcNode.x);
      line.setAttribute("y1", srcNode.y);
      line.setAttribute("x2", tgtNode.x);
      line.setAttribute("y2", tgtNode.y);
      line.setAttribute("stroke", "var(--graph-line, #94a3b8)");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-opacity", "0.85");
      line.style.stroke = "var(--graph-line, #94a3b8)";
      line.style.strokeWidth = "2px";
      line.style.opacity = "0.85";
      line.classList.add("rpg-edge-bg");
      this.edgesGroup.appendChild(line);

      this.graphData.edgeElements.push({ line, textEl: null, srcNode, tgtNode, isActive: false });
    }

    // Calculate degree map for native Obsidian-style node sizing
    const degreeMap = new Map();
    for (const node of nodes) degreeMap.set(node.id.toLowerCase(), 0);
    for (const edge of edges) {
      const u = edge.sourceId.toLowerCase();
      const v = edge.targetId.toLowerCase();
      if (degreeMap.has(u)) degreeMap.set(u, degreeMap.get(u) + 1);
      if (degreeMap.has(v)) degreeMap.set(v, degreeMap.get(v) + 1);
    }

    // ── 2. Render Nodes ──
    for (const node of nodes) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add("rpg-node", "rpg-node-bg");
      g.setAttribute("transform", `translate(${node.x}, ${node.y})`);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.textContent = node.id;

      const deg = degreeMap.get(node.id.toLowerCase()) || 0;
      node.deg = deg;
      const baseR = Math.min(16.0, Math.max(7.5, 6.5 + Math.sqrt(deg) * 2.2));

      circle.setAttribute("r", baseR);
      circle.setAttribute("fill", "var(--graph-node, #e2e8f0)");
      circle.setAttribute("stroke", "var(--background-primary, #18181b)");
      circle.setAttribute("stroke-width", "1.5");
      circle.setAttribute("opacity", "0.95");
      text.setAttribute("y", baseR + 10);

      g.appendChild(circle);
      g.appendChild(text);

      // Node Interactions: Left-click and move drags, Right-click opens context menu, Double-click opens note
      g.addEventListener("mousedown", e => {
        if (e.button === 0) {
          e.preventDefault();
          e.stopPropagation();
          this.draggedNode = node;
          this.draggedNodeEl = g;
          this.dragStartPos = { x: e.clientX, y: e.clientY };
          const p = this.screenToCanvasPoint(e.clientX, e.clientY);
          this.dragOffset = { x: p.x - node.x, y: p.y - node.y };
          node.vx = 0;
          node.vy = 0;
          this.canvasWrapper.classList.add("is-dragging");
          g.classList.add("is-dragging");
          this.wakeSimulation(0.4);
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

      g.addEventListener("mouseenter", e => {
        if (!this.draggedNode) {
          this.showTooltip(node, e);
          this.highlightConnected(node);
        }
      });
      g.addEventListener("mousemove", e => this.moveTooltip(e));
      g.addEventListener("mouseleave", () => {
        if (this.draggedNode === node) return;
        this.hideTooltip();
        this.unhighlightConnected();
      });

      this.nodesGroup.appendChild(g);
      this.graphData.nodeElements.push({ g, circle, text, node, baseR });
    }

    // Highlight any active path without scattering
    this.highlightActivePathOnExistingGraph();
  }

  highlightActivePathOnExistingGraph() {
    if (!this.graphData || !this.graphData.nodes || !this.graphData.nodes.length) return;

    const { nodes, nodeMap, nodeElements } = this.graphData;
    const activePath = (this.paths && this.paths[this.currentPathIndex]) || null;
    const pathNodeSet = new Set();

    if (activePath) {
      activePath.forEach(s => pathNodeSet.add(s.node.toLowerCase()));
    }

    const sLower = (this.personA || "").toLowerCase().trim();
    const eLower = (this.personB || "").toLowerCase().trim();
    const hasActiveFilter = !!(sLower && eLower && activePath && activePath.length > 0);

    // 1. Update node classes and visual styling
    for (const el of (nodeElements || [])) {
      const nLower = el.node.id.toLowerCase();
      const baseR = el.baseR || 10;

      el.g.classList.remove("rpg-node-endpoint", "rpg-node-intermediate", "rpg-node-dimmed", "rpg-node-bg");

      if (hasActiveFilter) {
        if (nLower === sLower || nLower === eLower) {
          el.node.isEndpoint = true;
          el.node.isIntermediate = false;
          el.node.isDimmed = false;
          el.g.classList.add("rpg-node-endpoint");

          const r = Math.max(10.0, baseR + 3.0);
          el.circle.setAttribute("r", r);
          el.circle.setAttribute("fill", "#00f0ff");
          el.circle.setAttribute("stroke", "#ffffff");
          el.circle.setAttribute("stroke-width", "2.5");
          el.circle.setAttribute("filter", "drop-shadow(0 0 8px #00f0ff)");
          el.circle.style.opacity = "1";
          el.text.setAttribute("y", r + 10);
          el.text.style.opacity = "1";
        } else if (pathNodeSet.has(nLower)) {
          el.node.isEndpoint = false;
          el.node.isIntermediate = true;
          el.node.isDimmed = false;
          el.g.classList.add("rpg-node-intermediate");

          const r = Math.max(8.5, baseR + 2.0);
          el.circle.setAttribute("r", r);
          el.circle.setAttribute("fill", "#818cf8");
          el.circle.setAttribute("stroke", "#c7d2fe");
          el.circle.setAttribute("stroke-width", "2");
          el.circle.setAttribute("filter", "drop-shadow(0 0 5px rgba(129, 140, 248, 0.7))");
          el.circle.style.opacity = "1";
          el.text.setAttribute("y", r + 10);
          el.text.style.opacity = "1";
        } else {
          el.node.isEndpoint = false;
          el.node.isIntermediate = false;
          el.node.isDimmed = true;
          el.g.classList.add("rpg-node-bg", "rpg-node-dimmed");

          el.circle.setAttribute("r", baseR);
          el.circle.setAttribute("fill", "var(--graph-node, #e2e8f0)");
          el.circle.setAttribute("stroke", "var(--background-primary, #18181b)");
          el.circle.setAttribute("stroke-width", "1.5");
          el.circle.removeAttribute("filter");
          el.text.setAttribute("y", baseR + 10);
        }
      } else {
        // No active path: reset all to normal
        el.node.isEndpoint = false;
        el.node.isIntermediate = false;
        el.node.isDimmed = false;
        el.g.classList.add("rpg-node-bg");

        el.circle.setAttribute("r", baseR);
        el.circle.setAttribute("fill", "var(--graph-node, #e2e8f0)");
        el.circle.setAttribute("stroke", "var(--background-primary, #18181b)");
        el.circle.setAttribute("stroke-width", "1.5");
        el.circle.removeAttribute("filter");
        el.circle.style.opacity = "0.95";
        el.text.setAttribute("y", baseR + 10);
        el.text.style.opacity = "0.92";
      }
    }

    // 2. Clear and rebuild active path lines in activePathGroup
    if (this.activePathGroup) {
      this.activePathGroup.innerHTML = "";
      if (this.viewport && this.activePathGroup.parentNode === this.viewport) {
        this.viewport.appendChild(this.activePathGroup);
      }
    }
    this.activePathElements = [];

    if (hasActiveFilter && activePath && activePath.length > 1) {
      for (let i = 0; i < activePath.length - 1; i++) {
        const u = activePath[i].node.toLowerCase();
        const v = activePath[i + 1].node.toLowerCase();
        const srcNode = nodeMap.get(u);
        const tgtNode = nodeMap.get(v);
        if (!srcNode || !tgtNode) continue;
        if (!Number.isFinite(srcNode.x) || !Number.isFinite(srcNode.y) || !Number.isFinite(tgtNode.x) || !Number.isFinite(tgtNode.y)) continue;

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
        this.activePathGroup.appendChild(haloLine);

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
        this.activePathGroup.appendChild(activeLine);

        // Relationship label on the line
        const propText = activePath[i + 1].edgeProp || "";
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
        textEl.textContent = propText;
        this.activePathGroup.appendChild(textEl);

        this.activePathElements.push({
          haloLine,
          activeLine,
          textEl,
          srcNode,
          tgtNode,
          propText
        });
      }
    }
  }

  updateConnectedLinesForNode(node) {
    if (!node) return;
    const nid = node.id.toLowerCase();

    // 1. Update background edges
    if (this.graphData && this.graphData.edgeElements) {
      for (const el of this.graphData.edgeElements) {
        if (!el.srcNode || !el.tgtNode) continue;
        if (el.srcNode.id.toLowerCase() === nid) {
          el.line.setAttribute("x1", node.x);
          el.line.setAttribute("y1", node.y);
        } else if (el.tgtNode.id.toLowerCase() === nid) {
          el.line.setAttribute("x2", node.x);
          el.line.setAttribute("y2", node.y);
        }
      }
    }

    // 2. Update active path glowing lines & text labels
    if (this.activePathElements && this.activePathElements.length) {
      for (const el of this.activePathElements) {
        if (!el.srcNode || !el.tgtNode) continue;
        const isSrc = el.srcNode.id.toLowerCase() === nid;
        const isTgt = el.tgtNode.id.toLowerCase() === nid;
        if (isSrc || isTgt) {
          if (isSrc) {
            el.haloLine.setAttribute("x1", node.x);
            el.haloLine.setAttribute("y1", node.y);
            el.activeLine.setAttribute("x1", node.x);
            el.activeLine.setAttribute("y1", node.y);
          }
          if (isTgt) {
            el.haloLine.setAttribute("x2", node.x);
            el.haloLine.setAttribute("y2", node.y);
            el.activeLine.setAttribute("x2", node.x);
            el.activeLine.setAttribute("y2", node.y);
          }
          if (el.textEl) {
            const midX = (el.srcNode.x + el.tgtNode.x) / 2;
            const midY = (el.srcNode.y + el.tgtNode.y) / 2;
            el.textEl.setAttribute("x", midX);
            el.textEl.setAttribute("y", midY - 8);
          }
        }
      }
    }
  }

  computePhysics(alpha) {
    const { nodes, nodeMap, edges, undirectedEdges } = this.graphData;
    if (!nodes || !nodes.length) return;

    const repulseStrength = 36000;
    const springLen = 150;
    const springK = 0.045;
    const gravity = 0.005;
    const minCollisionDist = 75;
    const maxRepulseDist = 420;

    // 1. All-pairs Coulomb repulsion with local neighborhood cutoff (prevents outward hollow ballooning)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distSq = dx * dx + dy * dy;
        let dist = Math.sqrt(distSq);
        if (!dist || dist < 0.1) {
          dx = (Math.random() - 0.5) || 1;
          dy = (Math.random() - 0.5) || 1;
          distSq = dx * dx + dy * dy;
          dist = Math.sqrt(distSq);
        }

        // Soft collision buffer if nodes get too close to prevent overlapping circles and text labels
        if (dist < minCollisionDist) {
          const push = (minCollisionDist - dist) * 0.45 * alpha;
          const px = (dx / dist) * push;
          const py = (dy / dist) * push;
          if (a !== this.draggedNode && !a.isPinned) { a.vx -= px; a.vy -= py; }
          if (b !== this.draggedNode && !b.isPinned) { b.vx += px; b.vy += py; }
        }

        // Smooth neighborhood Coulomb repulsion
        if (dist < maxRepulseDist) {
          const force = (repulseStrength / (distSq + 200)) * alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (a !== this.draggedNode && !a.isPinned) { a.vx -= fx; a.vy -= fy; }
          if (b !== this.draggedNode && !b.isPinned) { b.vx += fx; b.vy += fy; }
        }
      }
    }

    // 2. Spring attraction along connected relations (CORRECT PHYSICS: pulls connected nodes together!)
    const physicsEdges = undirectedEdges || edges;
    for (const e of physicsEdges) {
      const a = nodeMap.get(e.sourceId.toLowerCase());
      const b = nodeMap.get(e.targetId.toLowerCase());
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (!dist || dist < 0.001) continue;

      const displacement = dist - springLen;
      const force = displacement * springK * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      // a is pulled towards b (+fx, +fy), b is pulled towards a (-fx, -fy)
      if (a !== this.draggedNode && !a.isPinned) { a.vx += fx; a.vy += fy; }
      if (b !== this.draggedNode && !b.isPinned) { b.vx -= fx; b.vy -= fy; }
    }

    // 3. Degree-weighted radial center gravity & velocity damping (Hubs in center, leaves on outer rim, circular shape)
    const maxDeg = Math.max(...nodes.map(n => n.deg || 0), 1);
    for (const n of nodes) {
      if (n === this.draggedNode || n.isPinned) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }

      // Ensure no NaN / Infinity
      if (!Number.isFinite(n.x) || Number.isNaN(n.x)) { n.x = 0; n.vx = 0; }
      if (!Number.isFinite(n.y) || Number.isNaN(n.y)) { n.y = 0; n.vy = 0; }

      const deg = n.deg || 0;
      const degRatio = deg / maxDeg; // 0 for unconnected, up to 1.0 for top hub

      // Degree-weighted center gravity:
      // High-degree hubs experience strong central gravity pulling them to the core (0, 0)
      // Unconnected and low-degree nodes experience minimal inward pull so repulsion pushes them to the periphery
      const nodeGravity = gravity * (0.12 + 1.48 * degRatio);
      n.vx -= n.x * nodeGravity * alpha;
      n.vy -= n.y * nodeGravity * alpha;

      const distFromOrigin = Math.sqrt(n.x * n.x + n.y * n.y) || 1;

      // Unconnected notes (deg === 0): gently float out to the outer ring (r >= 220)
      if (deg === 0 && distFromOrigin < 220) {
        const pushOut = (220 - distFromOrigin) * 0.03 * alpha;
        n.vx += (n.x / distFromOrigin) * pushOut;
        n.vy += (n.y / distFromOrigin) * pushOut;
      }

      // Safe outer boundary dampening (maintains balanced circular shape like native Obsidian graph)
      const maxRadius = 380;
      if (distFromOrigin > maxRadius) {
        const pull = (distFromOrigin - maxRadius) * 0.16 * alpha;
        n.vx -= (n.x / distFromOrigin) * pull;
        n.vy -= (n.y / distFromOrigin) * pull;
      }

      // Clamp max velocity for silky smoothness
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      const maxSpeed = 12;
      if (speed > maxSpeed) {
        n.vx = (n.vx / speed) * maxSpeed;
        n.vy = (n.vy / speed) * maxSpeed;
      }

      n.x += n.vx * 0.88;
      n.y += n.vy * 0.88;
      n.vx *= 0.82;
      n.vy *= 0.82;
    }
  }

  wakeSimulation(alphaBoost = 0.3) {
    this.alpha = Math.max(this.alpha || 0, alphaBoost);
    if (!this.animFrameId) {
      this.animFrameId = requestAnimationFrame(this.stepSimulation.bind(this));
    }
  }

  stepSimulation() {
    if (this.alpha <= 0.005 && !this.draggedNode) {
      this.animFrameId = null;
      return;
    }

    // Keep simulation lively while dragging so connected nodes react in real time
    if (this.draggedNode) {
      this.alpha = Math.max(this.alpha, 0.35);
    }

    this.computePhysics(this.alpha);

    const { nodeElements, edgeElements } = this.graphData;

    // 4. Update SVG positions smoothly
    if (nodeElements && nodeElements.length) {
      for (const el of nodeElements) {
        el.g.setAttribute("transform", `translate(${el.node.x}, ${el.node.y})`);
      }
    }

    if (edgeElements && edgeElements.length) {
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
    }

    // Update active path glowing lines during simulation
    if (this.activePathElements && this.activePathElements.length) {
      for (const el of this.activePathElements) {
        if (!el.srcNode || !el.tgtNode) continue;
        el.haloLine.setAttribute("x1", el.srcNode.x);
        el.haloLine.setAttribute("y1", el.srcNode.y);
        el.haloLine.setAttribute("x2", el.tgtNode.x);
        el.haloLine.setAttribute("y2", el.tgtNode.y);

        el.activeLine.setAttribute("x1", el.srcNode.x);
        el.activeLine.setAttribute("y1", el.srcNode.y);
        el.activeLine.setAttribute("x2", el.tgtNode.x);
        el.activeLine.setAttribute("y2", el.tgtNode.y);

        if (el.textEl) {
          const midX = (el.srcNode.x + el.tgtNode.x) / 2;
          const midY = (el.srcNode.y + el.tgtNode.y) / 2;
          el.textEl.setAttribute("x", midX);
          el.textEl.setAttribute("y", midY - 8);
        }
      }
    }

    // Decay energy smoothly
    if (!this.draggedNode) {
      this.alpha *= 0.95;
    }

    this.animFrameId = requestAnimationFrame(this.stepSimulation.bind(this));
  }

  getClusterBounds() {
    const nodes = (this.graphData && this.graphData.nodes) || [];
    const validNodes = nodes.filter(n => Number.isFinite(n.x) && Number.isFinite(n.y));
    if (!validNodes.length) {
      return { minX: -100, maxX: 100, minY: -100, maxY: 100, midX: 0, midY: 0, width: 200, height: 200 };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of validNodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    return {
      minX, maxX, minY, maxY,
      midX: (minX + maxX) / 2,
      midY: (minY + maxY) / 2,
      width: Math.max(maxX - minX, 120),
      height: Math.max(maxY - minY, 120)
    };
  }

  resetView() {
    if (!this.canvasWrapper) return;
    const rect = this.canvasWrapper.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : (this.canvasWrapper.clientWidth || 800);
    const height = rect.height > 0 ? rect.height : (this.canvasWrapper.clientHeight || 600);
    if (width <= 0 || height <= 0) return;

    const bounds = this.getClusterBounds();
    const padding = 90;
    const boundW = bounds.width + padding * 2;
    const boundH = bounds.height + padding * 2;

    const scaleX = width / boundW;
    const scaleY = height / boundH;
    this.zoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.5);

    // Keep cluster center exactly at the viewport center
    this.panX = (width / 2) - (bounds.midX * this.zoom);
    this.panY = (height / 2) - (bounds.midY * this.zoom);
    this.updateTransform();
  }

  autoFitView(nodes = null, activePath = null) {
    this.resetView();
  }

  applyZoom(factor) {
    this.zoom = Math.min(Math.max(this.zoom * factor, 0.15), 4.0);

    const rect = this.canvasWrapper.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : (this.canvasWrapper.clientWidth || 800);
    const height = rect.height > 0 ? rect.height : (this.canvasWrapper.clientHeight || 600);
    const bounds = this.getClusterBounds();

    // Zooming scales with the dots cluster staying in the center
    this.panX = (width / 2) - (bounds.midX * this.zoom);
    this.panY = (height / 2) - (bounds.midY * this.zoom);
    this.updateTransform();
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

    // 3. Pin / Unpin node position
    menu.addItem(item => {
      item.setTitle(node.isPinned ? "Unpin position" : "Pin position")
        .setIcon(node.isPinned ? "pin-off" : "pin")
        .onClick(() => {
          node.isPinned = !node.isPinned;
          if (node.isPinned) {
            this.explicitPinnedSet.add(node.id.toLowerCase());
          } else {
            this.explicitPinnedSet.delete(node.id.toLowerCase());
            this.wakeSimulation(0.35);
          }
        });
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

    // 1. Gather all directly connected neighbor IDs from graph edges
    const targetId = (node.id || "").toLowerCase();
    const neighborIds = new Set();
    const outgoingEdgeProps = new Set();
    const edges = (this.graphData && this.graphData.edges) || [];

    for (const e of edges) {
      const src = (e.sourceId || "").toLowerCase();
      const tgt = (e.targetId || "").toLowerCase();
      if (src === targetId) {
        neighborIds.add(tgt);
        if (e.propKey) outgoingEdgeProps.add(e.propKey.toLowerCase());
      } else if (tgt === targetId) {
        neighborIds.add(src);
      }
    }

    // 2. Classify properties: direct relationships vs remaining
    const directProps = [];
    const remainingProps = [];

    const allKeys = Object.keys(fm).filter(k => k.toLowerCase() !== "position");

    const cleanLink = (s) => {
      if (s == null) return "";
      if (typeof s === "string") {
        return s.replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, "$1").trim();
      }
      if (typeof s === "object") {
        return s.displayText || s.link || s.original || JSON.stringify(s);
      }
      return String(s);
    };

    const formatVal = (val) => {
      if (val == null) return "";
      if (Array.isArray(val)) {
        return val.map(cleanLink).filter(Boolean).join(", ");
      }
      return cleanLink(val);
    };

    for (const k of allKeys) {
      const val = fm[k];
      const formatted = formatVal(val);
      // Skip empty properties (no empty daughter/husband rows)
      if (!formatted || formatted.trim() === "") continue;

      const kLower = k.toLowerCase();
      const linkedNames = linksUnderProp(cache, k);
      const connectsToNeighbor = linkedNames.some(name => neighborIds.has((name || "").toLowerCase()));
      const isDirectEdgeProp = outgoingEdgeProps.has(kLower);

      if (connectsToNeighbor || isDirectEdgeProp) {
        directProps.push({ key: k, val: formatted, isDirect: true });
      } else {
        remainingProps.push({ key: k, val: formatted, isDirect: false });
      }
    }

    // Sort remaining props: put base properties near the bottom
    remainingProps.sort((a, b) => {
      const aIsBase = a.key.toLowerCase().includes("base");
      const bIsBase = b.key.toLowerCase().includes("base");
      if (aIsBase && !bIsBase) return 1;
      if (!aIsBase && bIsBase) return -1;
      return a.key.localeCompare(b.key, undefined, { sensitivity: "base" });
    });

    const displayProps = [...directProps, ...remainingProps].slice(0, 10);

    // Determine badge text
    let badgeText = `${neighborIds.size} LINKS`;
    const sLower = (this.personA || "").toLowerCase();
    const eLower = (this.personB || "").toLowerCase();
    if (targetId === sLower) badgeText = "PERSON A";
    else if (targetId === eLower) badgeText = "PERSON B";
    else if (node.isIntermediate) badgeText = "PATH";

    let rowsHtml = "";
    if (displayProps.length === 0) {
      rowsHtml = `<div class="rpg-tt-row"><span class="rpg-tt-key">Properties:</span><span class="rpg-tt-val" style="color: #64748b; font-style: italic;">None</span></div>`;
    } else {
      for (const item of displayProps) {
        const isBase = item.key.toLowerCase().includes("base");
        const keyCls = item.isDirect ? "rpg-tt-key rpg-tt-key-direct" : "rpg-tt-key";
        const valCls = isBase ? "rpg-tt-val rpg-tt-val-base" : "rpg-tt-val";
        rowsHtml += `
          <div class="rpg-tt-row">
            <span class="${keyCls}">${item.key}:</span>
            <span class="${valCls}" title="${item.val}">${item.val}</span>
          </div>
        `;
      }
    }

    this.tooltip.innerHTML = `
      <div class="rpg-tt-header">
        <div class="rpg-tt-title">
          <span class="rpg-tt-dot"></span>
          <span class="rpg-tt-name">${node.id}</span>
        </div>
        <span class="rpg-tt-badge">${badgeText}</span>
      </div>
      <div class="rpg-tt-body">
        ${rowsHtml}
      </div>
      <div class="rpg-tt-footer">
        <span>Obsidian Note (Read-Only)</span>
        <span class="rpg-tt-hint">Click to Open</span>
      </div>
    `;

    // Clear any previous coordinates and display docked in the right corner of canvas
    this.tooltip.style.left = "";
    this.tooltip.style.top = "";
    this.tooltip.style.display = "block";
    this.tooltip.addClass("visible");
  }

  moveTooltip(event) {
    // Docked in the right corner of the canvas (Inspector Panel)
  }

  hideTooltip() {
    this.tooltip.removeClass("visible");
    this.tooltip.style.display = "none";
  }

  /* ─── Connected Node Highlighting & Non-Connected Dimming (Native Obsidian Graph Feel) ─── */

  highlightConnected(node) {
    if (!this.graphData || !node) return;
    const targetId = (node.id || "").toLowerCase();
    const neighborIds = new Set();
    const edges = this.graphData.edges || [];

    for (const e of edges) {
      const src = (e.sourceId || "").toLowerCase();
      const tgt = (e.targetId || "").toLowerCase();
      if (src === targetId) {
        neighborIds.add(tgt);
      } else if (tgt === targetId) {
        neighborIds.add(src);
      }
    }

    // 1. Highlight focused node, slightly highlight direct neighbors, and dim non-connected nodes
    const nodeElements = this.graphData.nodeElements || [];
    for (const el of nodeElements) {
      const nid = (el.node.id || "").toLowerCase();
      if (nid === targetId) {
        el.g.classList.add("rpg-node-hover-focus");
        el.g.classList.remove("rpg-node-hover-neighbor", "rpg-node-dimmed");
      } else if (neighborIds.has(nid)) {
        el.g.classList.add("rpg-node-hover-neighbor");
        el.g.classList.remove("rpg-node-hover-focus", "rpg-node-dimmed");
      } else {
        el.g.classList.add("rpg-node-dimmed");
        el.g.classList.remove("rpg-node-hover-focus", "rpg-node-hover-neighbor");
      }
    }

    // 2. Highlight directly connected edges and dim non-connected edges
    const edgeElements = this.graphData.edgeElements || [];
    for (const el of edgeElements) {
      const src = el.srcNode ? (el.srcNode.id || "").toLowerCase() : "";
      const tgt = el.tgtNode ? (el.tgtNode.id || "").toLowerCase() : "";
      const isConnected = (src === targetId && neighborIds.has(tgt)) || (tgt === targetId && neighborIds.has(src));

      if (isConnected) {
        el.line.classList.add("rpg-edge-hover-highlight");
        el.line.classList.remove("rpg-edge-dimmed");
        if (el.textEl) {
          el.textEl.classList.add("rpg-edge-text-highlight");
          el.textEl.classList.remove("rpg-edge-text-dimmed");
        }
      } else {
        el.line.classList.add("rpg-edge-dimmed");
        el.line.classList.remove("rpg-edge-hover-highlight");
        if (el.textEl) {
          el.textEl.classList.add("rpg-edge-text-dimmed");
          el.textEl.classList.remove("rpg-edge-text-highlight");
        }
      }
    }
  }

  unhighlightConnected() {
    if (this.graphData && this.graphData.nodeElements) {
      for (const el of this.graphData.nodeElements) {
        el.g.classList.remove("rpg-node-hover-focus", "rpg-node-hover-neighbor", "rpg-node-dimmed");
      }
    }
    if (this.graphData && this.graphData.edgeElements) {
      for (const el of this.graphData.edgeElements) {
        el.line.classList.remove("rpg-edge-hover-highlight", "rpg-edge-dimmed");
        if (el.textEl) {
          el.textEl.classList.remove("rpg-edge-text-highlight", "rpg-edge-text-dimmed");
        }
      }
    }
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

    let debounceTimer = null;
    const triggerAutoRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.populatePropSelect();
        this.populateValueSelect();
        this.populateExcludePropSelect();
        this.loadAndRenderTree();
      }, 300);
    };

    this.registerEvent(this.app.metadataCache.on("changed", () => triggerAutoRefresh()));
    this.registerEvent(this.app.vault.on("create", () => triggerAutoRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => triggerAutoRefresh()));
    this.registerEvent(this.app.vault.on("rename", () => triggerAutoRefresh()));
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

    // Row 2: Search Person & Card Properties (Left) | Action Buttons & Legend (Right)
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

    // Right Group: Universal Reset, Zoom, Refresh & Legend
    const rightGrp2 = row2.createDiv({ cls: "ft-toolbar-right" });

    // Universal Reset View Button
    const resetBtn = rightGrp2.createEl("button", {
      cls: "ft-btn",
      attr: { title: "Universal Reset: Restore all collapsed branches, reset zoom and pan" },
    });
    resetBtn.innerHTML = "<span>⟲</span> Reset View";
    resetBtn.addEventListener("click", () => this.universalReset());

    // Zoom Controls
    const zoomGrp = rightGrp2.createDiv({ cls: "ft-btn-group" });
    const zoomOutBtn = zoomGrp.createEl("button", { cls: "ft-btn-sm", text: "−" });
    zoomOutBtn.addEventListener("click", () => this.applyZoom(0.85));

    this.zoomDisplay = zoomGrp.createSpan({ cls: "ft-zoom-readout", text: "100%" });

    const zoomInBtn = zoomGrp.createEl("button", { cls: "ft-btn-sm", text: "+" });
    zoomInBtn.addEventListener("click", () => this.applyZoom(1.15));

    // Refresh Button
    const refreshBtn = rightGrp2.createEl("button", {
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

    rightGrp2.createDiv({ cls: "ft-divider-v" });

    // Legend
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
        <div class="ft-tt-row"><span class="ft-tt-key">Base:</span><span class="ft-tt-val ft-tt-val-base" id="ftTtBase">None</span></div>
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

  /* ─────────────────────────── Person Note & Base Matching Helpers ─────────────────────────── */

  isPersonNode(file, cache) {
    if (!file || !(file instanceof obsidian.TFile) || file.extension !== "md") return false;
    const bLo = file.basename.toLowerCase().trim();

    const exclVals = [
      ...(this.excludeValues || []),
      ...(this.plugin.settings.excludeValues || []),
      ...(this.plugin.settings.ft_excludeValues || [])
    ].map(v => bare(String(v || "")).toLowerCase().trim()).filter(Boolean);

    if (exclVals.includes(bLo)) return false;

    if (!cache || !cache.frontmatter) return false;
    const fm = cache.frontmatter;

    const exclProp = (this.excludeProperty || this.plugin.settings.ft_excludePropertyName || this.plugin.settings.excludePropertyName || "").toLowerCase().trim();
    const exclPropVal = (this.plugin.settings.ft_excludePropertyValue || this.plugin.settings.excludePropertyValue || "").toLowerCase().trim();

    if (exclProp && exclProp !== "(none)") {
      const realEp = Object.keys(fm).find(x => x.toLowerCase() === exclProp);
      if (realEp && fm[realEp] != null) {
        const rawVal = fm[realEp];
        const arr = Array.isArray(rawVal) ? rawVal : [rawVal];
        const vals = arr.map(x => bare(typeof x === "object" ? (x.link || "") : String(x || "")).toLowerCase().trim()).filter(Boolean);
        if (vals.some(v => (exclPropVal && v === exclPropVal) || exclVals.includes(v))) {
          return false;
        }
      }
    }

    return true;
  }

  getFilesMatchingBase() {
    const baseProp = (this.baseProperty || "base").toLowerCase();
    const filterVal = (this.baseFilterValue || "ALL").trim();
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const result = [];

    const matchBase = (b, filter) => {
      if (!b || !filter) return false;
      const bLower = b.toLowerCase().trim();
      const fLower = filter.toLowerCase().trim();
      if (bLower === fLower) return true;
      const bClean = bLower.replace(/\.md$/, "").replace(/\.base$/, "");
      const fClean = fLower.replace(/\.md$/, "").replace(/\.base$/, "");
      return bClean === fClean;
    };

    for (const f of markdownFiles) {
      const cache = this.app.metadataCache.getFileCache(f);
      if (!this.isPersonNode(f, cache)) continue;

      const fm = cache.frontmatter;
      const bKey = Object.keys(fm).find(k => k.toLowerCase() === baseProp);
      const bRaw = bKey ? fm[bKey] : null;

      let fileBases = [];
      if (bRaw) {
        const arr = Array.isArray(bRaw) ? bRaw : [bRaw];
        fileBases = arr.map(x => bare(typeof x === "string" ? x : (x.link || ""))).filter(Boolean);
      }

      if (baseProp && filterVal && filterVal !== "ALL") {
        if (!fileBases.some(b => matchBase(b, filterVal))) {
          continue;
        }
      }

      result.push({ file: f, cache, fileBases });
    }
    return result;
  }

  /* ─────────────────────────── Data Parsing (Strictly Read-Only) ─────────────────────────── */

  loadAndRenderTree() {
    try {
      const getPropKeys = (syncKey, ftKey, fallbacks = []) => {
        const sVal = this.plugin.settings[syncKey];
        const fVal = this.plugin.settings[ftKey];
        const val = (sVal && sVal.length > 0) ? sVal : fVal;
        const list = parsePropList(val);
        if (list.length > 0) return list;
        return fallbacks;
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

      const filterVal = (this.baseFilterValue || "ALL").trim();
      const matchingEntries = this.getFilesMatchingBase();
      const peopleMap = {};

      // 1. First pass: Collect all person notes matching base filter & NOT matching exclude property + value
      for (const entry of matchingEntries) {
        const f = entry.file;
        const cache = entry.cache;
        const fm = cache.frontmatter;
        const fileBases = entry.fileBases;
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

      // Filter relations so they only reference people that actually exist in peopleMap
      Object.values(peopleMap).forEach(p => {
        p.fathers = p.fathers.filter(fid => !!peopleMap[fid]);
        p.mothers = p.mothers.filter(mid => !!peopleMap[mid]);
        p.parents = [...new Set([...p.fathers, ...p.mothers])];
        p.husbands = p.husbands.filter(hid => !!peopleMap[hid]);
        p.wifes = p.wifes.filter(wid => !!peopleMap[wid]);
        p.spouses = [...new Set([...p.husbands, ...p.wifes])];
        p.sons = p.sons.filter(sid => !!peopleMap[sid]);
        p.daughters = p.daughters.filter(did => !!peopleMap[did]);
        p.children = [...new Set([...p.sons, ...p.daughters])];
        p.brothers = p.brothers.filter(bid => !!peopleMap[bid]);
        p.sisters = p.sisters.filter(sid => !!peopleMap[sid]);
        p.siblings = [...new Set([...p.brothers, ...p.sisters])];
      });

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
          if (!peopleMap[spId]) return;
          const key = [p.id, spId].sort().join("___");
          if (!processedCouples.has(key)) {
            processedCouples.add(key);
            const p1 = p.gender === "female" ? spId : p.id;
            const p2 = p.gender === "female" ? p.id : spId;

            const sharedChildren = (peopleMap[p1]?.children || []).filter(c =>
              (peopleMap[p2]?.children || []).includes(c) ||
              (peopleMap[c]?.parents && peopleMap[c].parents.includes(p1) && peopleMap[c].parents.includes(p2))
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
        } else if (p.fathers.length > 0 || p.mothers.length > 0) {
          // Single parent whose partner is excluded or missing from dataset
          const singlePar = p.fathers[0] || p.mothers[0];
          const uId = `u_${singlePar}`;
          if (!unionMap.has(uId)) {
            const color = LINEAGE_PALETTE[unionCount % LINEAGE_PALETTE.length];
            unionCount++;
            unionMap.set(uId, {
              id: uId,
              p1: singlePar,
              p2: null,
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
          } else {
            const u = unionMap.get(uId);
            p.children.forEach(cid => {
              if (!u.children.includes(cid)) u.children.push(cid);
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
    const decentFamilyGap = (typeof this.plugin.settings.familyBranchSpacing === "number" &&
      this.plugin.settings.familyBranchSpacing > 0 &&
      this.plugin.settings.familyBranchSpacing < 200)
      ? this.plugin.settings.familyBranchSpacing
      : 80;
    const familyGap = decentFamilyGap;

    // 1. Generation Assignment (Depth Propagation rooted strictly by descent)
    peopleList.forEach(p => { p.gen = 0; });

    // Pass 1: Strict ancestral descent depth (DAG from roots to descendants)
    let changed = true;
    let depthIterations = 0;
    while (changed && depthIterations < 50) {
      changed = false;
      depthIterations++;
      peopleList.forEach(p => {
        const knownParents = p.parents.filter(id => this.people[id]);
        if (knownParents.length > 0) {
          const maxParGen = Math.max(...knownParents.map(id => this.people[id].gen));
          if (p.gen !== maxParGen + 1) {
            p.gen = maxParGen + 1;
            changed = true;
          }
        }
      });
    }

    // Pass 2: In-laws with NO known parents take their spouse's generation level
    peopleList.forEach(p => {
      const knownParents = p.parents.filter(id => this.people[id]);
      if (knownParents.length === 0 && p.spouses.length > 0) {
        const knownSpouseGens = p.spouses
          .filter(id => this.people[id])
          .map(id => this.people[id].gen);
        if (knownSpouseGens.length > 0) {
          p.gen = Math.min(...knownSpouseGens);
        }
      }
    });

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
    const computeSubtreeWidth = (union) => {
      const visited = new Set();
      const calcW = (u) => {
        if (!u || visited.has(u.id)) return cardW * 2 + coupleGap;
        visited.add(u.id);

        const p1 = this.people[u.p1];
        const p2 = u.p2 ? this.people[u.p2] : null;
        const p1W = p1 ? (p1.cardW || cardW) : cardW;
        const p2W = p2 ? (p2.cardW || cardW) : 0;
        const unitW = p2 ? (p1W + p2W + coupleGap) : p1W;

        const rawChildren = (u.children || [])
          .map(cid => this.people[cid])
          .filter(Boolean)
          .filter(child => !placedPeople.has(child.id));
        const validChildren = sortChildren(rawChildren, u);

        if (validChildren.length === 0) {
          return unitW;
        }

        let childrenTotalW = 0;
        validChildren.forEach((child, idx) => {
          const childUnion = this.unions.find(cu => (cu.p1 === child.id || cu.p2 === child.id) && cu.id !== u.id);
          let childW = child.cardW || cardW;
          if (childUnion && !placedUnions.has(childUnion.id)) {
            const spouseId = childUnion.p1 === child.id ? childUnion.p2 : childUnion.p1;
            const spouse = spouseId ? this.people[spouseId] : null;
            const spouseHasOwnParents = spouse && spouse.parents.some(pid => this.people[pid]);
            if (!spouseHasOwnParents) {
              childW = calcW(childUnion);
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
      return calcW(union);
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
      if (p1 && p2) {
        let leftPartner = p1.gender === "female" ? p2 : p1;
        let rightPartner = p1.gender === "female" ? p1 : p2;

        // Smart partner orientation based on clans/lineage:
        // Place partner from earlier clan on the left, later clan on the right
        const clan1 = personClanMap.get(p1.id);
        const clan2 = personClanMap.get(p2.id);
        const c1Idx = orderedRootUnions.findIndex(ru => ru.id === clan1);
        const c2Idx = orderedRootUnions.findIndex(ru => ru.id === clan2);

        if (c1Idx !== -1 && c2Idx !== -1 && c1Idx !== c2Idx) {
          if (c1Idx < c2Idx) {
            leftPartner = p1;
            rightPartner = p2;
          } else {
            leftPartner = p2;
            rightPartner = p1;
          }
        }

        const lpW = leftPartner.cardW || cardW;
        const rpW = rightPartner.cardW || cardW;
        const coupleW = lpW + rpW + coupleGap;

        if (!placedPeople.has(leftPartner.id) && !placedPeople.has(rightPartner.id)) {
          leftPartner.x = unionCenterX - coupleW / 2;
          leftPartner.y = genYMap.get(leftPartner.gen) ?? (80 + leftPartner.gen * 120);
          placedPeople.add(leftPartner.id);

          rightPartner.x = leftPartner.x + lpW + coupleGap;
          rightPartner.y = genYMap.get(rightPartner.gen) ?? (80 + rightPartner.gen * 120);
          placedPeople.add(rightPartner.id);
        } else if (placedPeople.has(leftPartner.id) && !placedPeople.has(rightPartner.id)) {
          rightPartner.x = leftPartner.x + lpW + coupleGap;
          rightPartner.y = genYMap.get(rightPartner.gen) ?? (80 + rightPartner.gen * 120);
          placedPeople.add(rightPartner.id);
        } else if (!placedPeople.has(leftPartner.id) && placedPeople.has(rightPartner.id)) {
          leftPartner.x = rightPartner.x - lpW - coupleGap;
          leftPartner.y = genYMap.get(leftPartner.gen) ?? (80 + leftPartner.gen * 120);
          placedPeople.add(leftPartner.id);
        }
      } else if (p1) {
        const p1W = p1.cardW || cardW;
        if (!placedPeople.has(p1.id)) {
          p1.x = unionCenterX - p1W / 2;
          p1.y = genYMap.get(p1.gen) ?? (80 + p1.gen * 120);
          placedPeople.add(p1.id);
        }
      }

      // Position children
      const rawChildren = (union.children || [])
        .map(cid => this.people[cid])
        .filter(Boolean)
        .filter(child => !placedPeople.has(child.id));
      const validChildren = sortChildren(rawChildren, union);

      if (validChildren.length === 0) return;

      // Precalculate widths for each child's branch
      const childWidths = validChildren.map(child => {
        const childUnion = this.unions.find(cu => (cu.p1 === child.id || cu.p2 === child.id) && cu.id !== union.id);
        if (childUnion && !placedUnions.has(childUnion.id)) {
          const spouseId = childUnion.p1 === child.id ? childUnion.p2 : childUnion.p1;
          const spouse = spouseId ? this.people[spouseId] : null;
          const spouseHasOwnParents = spouse && spouse.parents.some(pid => this.people[pid]);
          if (!spouseHasOwnParents) {
            return computeSubtreeWidth(childUnion);
          } else {
            return (child.cardW || cardW) + (spouse ? (spouse.cardW || cardW) : cardW) + coupleGap;
          }
        }
        return (child.cardW || cardW);
      });

      const totalChildrenW = childWidths.reduce((a, b) => a + b, 0) + (validChildren.length - 1) * hGap;
      let curChildX = unionCenterX - totalChildrenW / 2;

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
      // Otherwise, give a clean separation gap (78px) instead of a massive void
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
              const childDropX = childCenterX;

              allVerticalSegments.push({
                x: unionX,
                yTop: stemY1,
                yBottom: stemDropY,
                unionId: u.id,
                strokeColor,
                className: "ft-tree-line",
              });
              horizontalRenderQueue.push({
                x1: Math.min(unionX, childDropX),
                x2: Math.max(unionX, childDropX),
                y: stemDropY,
                strokeColor,
                className: "ft-tree-line",
                unionId: u.id,
              });
              allVerticalSegments.push({
                x: childDropX,
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
            const childPoints = visibleChildren
              .filter(c => c && Number.isFinite(c.x))
              .map(c => ({
                id: c.id,
                x: c.x + (c.cardW || cardW) / 2,
                y: c.y,
              }));

            if (childPoints.length > 0) {
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
          const vyMin = Math.min(v.yTop, v.yBottom);
          const vyMax = Math.max(v.yTop, v.yBottom);
          if (h.y >= vyMin && h.y <= vyMax) {
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
    const rect = this.contentEl.getBoundingClientRect();
    const ttW = this.tooltip.offsetWidth || 360;
    const ttH = this.tooltip.offsetHeight || 280;

    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Make the box appear right below the cursor
    let left = cursorX - 10;
    let top = cursorY + 18;

    // Keep completely inside container bounds so it never gets chopped
    if (left + ttW > rect.width - 15) {
      left = rect.width - ttW - 15;
    }
    if (left < 15) {
      left = 15;
    }

    if (top + ttH > rect.height - 15) {
      // Flip above cursor if it would overflow the bottom
      top = Math.max(15, cursorY - ttH - 12);
    }

    this.tooltip.style.left = `${Math.round(left)}px`;
    this.tooltip.style.top = `${Math.round(top)}px`;
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
        if (!Array.isArray(this.plugin.settings.relations)) {
          this.plugin.settings.relations = [];
        }
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

        const fwd = row.createEl("input", { type: "text", placeholder: "forward property", value: rel.forward || "" });
        fwd.addEventListener("input", async e => {
          rel.forward = e.target.value;
          await this.plugin.saveSettings();
        });
        new VaultPropertySuggest(this.app, fwd, async v => {
          rel.forward = v;
          await this.plugin.saveSettings();
        });

        row.createSpan({ cls: "srs-arrow", text: "↔" });

        const inv = row.createEl("input", { type: "text", placeholder: "inverse property", value: rel.inverse || "" });
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
    this.removeQueue = new Map();
    this.flushPending = false;
    this.writeGuard = new Set();
    this.fileRelationsSnapshot = new Map();
    this.tombstones = new Map();
    this.recentlyCreatedNotes = new Map();

    if (this.app.workspace.layoutReady) {
      this.initRelationsSnapshot();
    } else {
      this.app.workspace.onLayoutReady(() => {
        this.initRelationsSnapshot();
      });
    }

    this.registerEvent(
      this.app.metadataCache.on("changed", file => {
        if (file instanceof obsidian.TFile && file.extension === "md") {
          if (this.writeGuard.has(file.path)) return;
          this.onNoteChanged(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", file => {
        if (file instanceof obsidian.TFile && file.extension === "md") {
          if (this.writeGuard.has(file.path)) return;
          setTimeout(() => {
            if (!this.writeGuard.has(file.path)) {
              this.onNoteChanged(file);
            }
          }, 200);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", file => {
        if (file instanceof obsidian.TFile && file.extension === "md") {
          if (this.recentlyCreatedNotes) {
            this.recentlyCreatedNotes.set(file.path, Date.now() + 10000);
          }
          setTimeout(() => this.onNoteCreated(file), 50);
          setTimeout(() => this.onNoteCreated(file), 250);
          setTimeout(() => this.onNoteCreated(file), 600);
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-open", file => {
        if (file instanceof obsidian.TFile && file.extension === "md") {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache) {
            const s = this.extractRelationsSnapshot(file, cache);
            if (s) this.fileRelationsSnapshot.set(file.path, s);
          }
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
      "sonProps", "daughterProps", "brotherProps", "sisterProps", "genderProps",
      "fatherProperty", "motherProperty", "husbandProperty", "wifeProperty",
      "sonProperty", "daughterProperty", "brotherProperty", "sisterProperty"
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
    this.initRelationsSnapshot();
  }

/* ─── folder filter ─── */

  isIncluded(file) {
    if (!file || !(file instanceof obsidian.TFile) || file.extension !== "md") return false;

    const normPath = file.path.replace(/\\/g, "/").toLowerCase();
    const bLo = file.basename.toLowerCase().trim();

    // 1. Excluded values and properties filter from settings
    const exclVals = [
      ...(this.settings.excludeValues || []),
      ...(this.settings.ft_excludeValues || [])
    ].map(v => bare(String(v || "")).toLowerCase().trim()).filter(Boolean);
    if (exclVals.includes(bLo)) return false;

    const cache = this.app.metadataCache.getFileCache(file);
    if (cache && cache.frontmatter) {
      const fm = cache.frontmatter;
      const exclProp = (this.settings.ft_excludePropertyName || this.settings.excludePropertyName || "").toLowerCase().trim();
      const exclPropVal = (this.settings.ft_excludePropertyValue || this.settings.excludePropertyValue || "").toLowerCase().trim();
      if (exclProp && exclProp !== "(none)") {
        const realEp = Object.keys(fm).find(x => x.toLowerCase() === exclProp);
        if (realEp && fm[realEp] != null) {
          const rawVal = fm[realEp];
          const arr = Array.isArray(rawVal) ? rawVal : [rawVal];
          const vals = arr.map(x => bare(typeof x === "object" ? (x.link || "") : String(x || "")).toLowerCase().trim()).filter(Boolean);
          if (vals.some(v => (exclPropVal && v === exclPropVal) || exclVals.includes(v))) {
            return false;
          }
        }
      }
    }

    const customKeys = (this.settings.relations || [])
      .filter(r => r.enabled !== false && r.forward && r.inverse)
      .flatMap(r => [r.forward.toLowerCase().trim(), r.inverse.toLowerCase().trim()]);

    const userFamilyKeys = [
      ...this.getPropList(this.settings.fatherProperty),
      ...this.getPropList(this.settings.motherProperty),
      ...this.getPropList(this.settings.husbandProperty),
      ...this.getPropList(this.settings.wifeProperty),
      ...this.getPropList(this.settings.sonProperty),
      ...this.getPropList(this.settings.daughterProperty),
      ...this.getPropList(this.settings.brotherProperty),
      ...this.getPropList(this.settings.sisterProperty),
      ...this.getPropList(this.settings.fatherProps),
      ...this.getPropList(this.settings.motherProps),
      ...this.getPropList(this.settings.husbandProps),
      ...this.getPropList(this.settings.wifeProps),
      ...this.getPropList(this.settings.sonProps),
      ...this.getPropList(this.settings.daughterProps),
      ...this.getPropList(this.settings.brotherProps),
      ...this.getPropList(this.settings.sisterProps),
    ].map(k => k.toLowerCase().trim()).filter(Boolean);
    const defaultRelKeys = ["father", "mother", "husband", "wife", "son", "daughter", "brother", "sister"];
    const allConfiguredRelationKeys = new Set([...userFamilyKeys, ...customKeys, ...defaultRelKeys]);

    // 2. Folder filter: If includedFolders is configured, notes inside those folders are included
    const folders = (this.settings.includedFolders || [])
      .map(f => f.trim().replace(/^\/|\/$/g, "").replace(/\\/g, "/").toLowerCase()).filter(Boolean);
    if (folders.some(f => normPath === f || normPath.startsWith(f + "/"))) return true;

    // 3. Also include any note outside includedFolders if it defines relation properties
    if (cache && cache.frontmatter) {
      const fm = cache.frontmatter;
      const hasRelProps = Object.keys(fm).some(k => {
        const lk = k.toLowerCase().trim();
        return allConfiguredRelationKeys.has(lk);
      });
      if (hasRelProps) return true;
    }

    // 4. Also include if this note is referenced as a relation by any snapshot in the vault
    if (this.fileRelationsSnapshot) {
      for (const [_, snap] of this.fileRelationsSnapshot) {
        if ((snap.fathers || []).includes(bLo) || (snap.mothers || []).includes(bLo) ||
            (snap.sons || []).includes(bLo) || (snap.daughters || []).includes(bLo) ||
            (snap.brothers || []).includes(bLo) || (snap.sisters || []).includes(bLo) ||
            (snap.husbands || []).includes(bLo) || (snap.wives || []).includes(bLo)) {
          return true;
        }
        for (const c of (snap.custom || [])) {
          if ((c.forwardTargets || []).includes(bLo) || (c.inverseTargets || []).includes(bLo)) {
            return true;
          }
        }
      }
    }

    // 5. Direct vault check: if any note in the vault references this note in family or custom properties
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path === file.path) continue;
      if (exclVals.includes(f.basename.toLowerCase().trim())) continue;
      const fc = this.app.metadataCache.getFileCache(f);
      if (!fc || !fc.frontmatter) continue;
      for (const k of Object.keys(fc.frontmatter)) {
        const lk = k.toLowerCase().trim();
        if (allConfiguredRelationKeys.has(lk)) {
          if (linksUnderProp(fc, k).some(x => bare(x).toLowerCase() === bLo)) return true;
        }
      }
    }

    if (!folders.length) return true;
    return false;
  }

  /* ─── file resolver ─── */

  resolve(name, fromPath = "") {
    if (!name) return null;
    const clean = bare(name);
    if (!clean) return null;
    const f = this.app.metadataCache.getFirstLinkpathDest(clean, fromPath);
    if (f instanceof obsidian.TFile) return f;
    const lo = clean.toLowerCase();
    return this.app.vault.getMarkdownFiles().find(x => x.basename.toLowerCase() === lo) || null;
  }

  /* ─── gender helper ─── */

  getGender(cache) {
    if (!cache || !cache.frontmatter) return "unknown";
    const propCandidates = [
      ...this.getPropList(this.settings.genderProperty),
      ...this.getPropList(this.settings.genderProps),
      "gender", "sex"
    ].map(s => s.toLowerCase());

    let realKey = null;
    for (const cand of propCandidates) {
      realKey = Object.keys(cache.frontmatter).find(k => k.toLowerCase() === cand);
      if (realKey) break;
    }
    if (!realKey) return "unknown";

    const rawVal = cache.frontmatter[realKey];
    const rawItems = Array.isArray(rawVal) ? rawVal : [rawVal];

    const toList = v => {
      if (Array.isArray(v)) return v.map(s => String(s || "").trim().toLowerCase()).filter(Boolean);
      if (typeof v === "string") return v.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      return [];
    };
    let maleList = toList(this.settings.maleValues);
    let femaleList = toList(this.settings.femaleValues);
    if (!maleList.length) maleList = ["male", "m", "man", "boy"];
    if (!femaleList.length) femaleList = ["female", "f", "woman", "girl"];

    for (const item of rawItems) {
      if (item === undefined || item === null) continue;
      const clean = bare(String(item)).trim().toLowerCase();
      if (!clean) continue;
      // Exact letter-to-letter equality matching
      if (femaleList.includes(clean)) return "female";
      if (maleList.includes(clean)) return "male";
    }
    return "unknown";
  }

  getFileGender(fileOrName, fromPath = "") {
    if (!fileOrName) return "unknown";
    let file = fileOrName;
    let name = "";
    if (typeof fileOrName === "string") {
      name = bare(fileOrName).toLowerCase();
      file = this.resolve(fileOrName, fromPath);
    } else if (fileOrName instanceof obsidian.TFile) {
      name = fileOrName.basename.toLowerCase();
    }

    const S = this.settings;
    const getPropListUnified = (k1, k2, fallbacks = []) => {
      const list = [...this.getPropList(S[k1]), ...this.getPropList(S[k2])];
      if (list.length > 0) return [...new Set(list)];
      return fallbacks;
    };
    const fatKeys  = getPropListUnified("fatherProperty", "fatherProps", ["father"]);
    const motKeys  = getPropListUnified("motherProperty", "motherProps", ["mother"]);
    const husbKeys = getPropListUnified("husbandProperty", "husbandProps", ["husband"]);
    const wifeKeys = getPropListUnified("wifeProperty", "wifeProps", ["wife"]);
    const sonKeys  = getPropListUnified("sonProperty", "sonProps", ["son"]);
    const dauKeys  = getPropListUnified("daughterProperty", "daughterProps", ["daughter"]);
    const broKeys  = getPropListUnified("brotherProperty", "brotherProps", ["brother"]);
    const sisKeys  = getPropListUnified("sisterProperty", "sisterProps", ["sister"]);

    if (file && file instanceof obsidian.TFile) {
      const cache = this.app.metadataCache.getFileCache(file);
      const directGender = this.getGender(cache);
      if (directGender !== "unknown") return directGender;

      // Infer from spouse properties on the note itself
      if (cache && cache.frontmatter) {
        const fm = cache.frontmatter;
        const hasWife = Object.keys(fm).some(k => wifeKeys.some(wk => wk.toLowerCase() === k.toLowerCase()) && linksUnderProp(cache, k).length > 0);
        const hasHusb = Object.keys(fm).some(k => husbKeys.some(hk => hk.toLowerCase() === k.toLowerCase()) && linksUnderProp(cache, k).length > 0);
        if (hasWife && !hasHusb) return "male";
        if (hasHusb && !hasWife) return "female";
      }
    }

    // Infer from relations across the vault in snapshot
    if (name && this.fileRelationsSnapshot) {
      for (const [_, snap] of this.fileRelationsSnapshot) {
        if ((snap.sons || []).includes(name) || (snap.brothers || []).includes(name) || (snap.fathers || []).includes(name) || (snap.husbands || []).includes(name)) {
          return "male";
        }
        if ((snap.daughters || []).includes(name) || (snap.sisters || []).includes(name) || (snap.mothers || []).includes(name) || (snap.wives || []).includes(name)) {
          return "female";
        }
      }
    }

    // Direct vault cache scan fallback across all gender-specific relationship properties
    if (name) {
      const maleKeys = [...sonKeys, ...broKeys, ...fatKeys, ...husbKeys];
      const femaleKeys = [...dauKeys, ...sisKeys, ...motKeys, ...wifeKeys];

      for (const f of this.app.vault.getMarkdownFiles()) {
        const c = this.app.metadataCache.getFileCache(f);
        if (!c || !c.frontmatter) continue;
        for (const k of maleKeys) {
          if (linksUnderProp(c, k).some(x => bare(x).toLowerCase() === name)) return "male";
        }
        for (const k of femaleKeys) {
          if (linksUnderProp(c, k).some(x => bare(x).toLowerCase() === name)) return "female";
        }
      }
    }

    return "unknown";
  }

  /* ══ SNAPSHOT & REMOVAL ENGINE (Bi-Directional Unlinking) ═════════════════════════ */

  getPropList(prop) {
    if (Array.isArray(prop)) return prop.map(s => String(s || "").trim()).filter(Boolean);
    if (typeof prop === "string") return prop.split(",").map(s => s.trim()).filter(Boolean);
    return [];
  }

  getPrimaryProp(prop) {
    const list = this.getPropList(prop);
    return list[0] || "";
  }

  extractRelationsSnapshot(file, cache) {
    if (!cache || !cache.frontmatter) return null;
    const S = this.settings;

    const getPropKeys = (k1, k2, fallbackNames = []) => {
      const list = [...this.getPropList(S[k1]), ...this.getPropList(S[k2])];
      if (list.length > 0) {
        return new Set(list.map(s => s.toLowerCase().trim()).filter(Boolean));
      }
      return new Set((fallbackNames || []).map(s => s.toLowerCase().trim()).filter(Boolean));
    };

    const fatKeys  = getPropKeys("fatherProperty", "fatherProps", ["father"]);
    const motKeys  = getPropKeys("motherProperty", "motherProps", ["mother"]);
    const husbKeys = getPropKeys("husbandProperty", "husbandProps", ["husband"]);
    const wifeKeys = getPropKeys("wifeProperty", "wifeProps", ["wife"]);
    const sonKeys  = getPropKeys("sonProperty", "sonProps", ["son"]);
    const dauKeys  = getPropKeys("daughterProperty", "daughterProps", ["daughter"]);
    const broKeys  = getPropKeys("brotherProperty", "brotherProps", ["brother"]);
    const sisKeys  = getPropKeys("sisterProperty", "sisterProps", ["sister"]);

    const getNamesForKeys = (keys) => {
      const names = new Set();
      for (const k of keys) {
        for (const n of linksUnderProp(cache, k)) {
          const b = bare(n).toLowerCase();
          if (b) names.add(b);
        }
      }
      return [...names];
    };

    const custom = [];
    for (const rel of (S.relations || [])) {
      if (rel.enabled === false || !rel.forward || !rel.inverse) continue;
      const fwd = rel.forward.trim();
      const inv = rel.inverse.trim();
      if (!fwd || !inv) continue;
      custom.push({
        forward: fwd,
        inverse: inv,
        forwardTargets: linksUnderProp(cache, fwd).map(n => bare(n).toLowerCase()).filter(Boolean),
        inverseTargets: linksUnderProp(cache, inv).map(n => bare(n).toLowerCase()).filter(Boolean)
      });
    }

    return {
      fathers: getNamesForKeys(fatKeys),
      mothers: getNamesForKeys(motKeys),
      husbands: getNamesForKeys(husbKeys),
      wives: getNamesForKeys(wifeKeys),
      sons: getNamesForKeys(sonKeys),
      daughters: getNamesForKeys(dauKeys),
      brothers: getNamesForKeys(broKeys),
      sisters: getNamesForKeys(sisKeys),
      custom
    };
  }

  initRelationsSnapshot() {
    this.fileRelationsSnapshot.clear();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.isIncluded(file)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache) {
        const snap = this.extractRelationsSnapshot(file, cache);
        if (snap) this.fileRelationsSnapshot.set(file.path, snap);
      }
    }
  }

  shareOtherParent(childA, childB, fromPath, excludedParentName) {
    const fileA = this.resolve(childA, fromPath);
    const fileB = this.resolve(childB, fromPath);
    if (!fileA || !fileB) return false;

    const snapA = this.fileRelationsSnapshot.get(fileA.path) || (this.extractRelationsSnapshot(fileA, this.app.metadataCache.getFileCache(fileA)) || { fathers: [], mothers: [] });
    const snapB = this.fileRelationsSnapshot.get(fileB.path) || (this.extractRelationsSnapshot(fileB, this.app.metadataCache.getFileCache(fileB)) || { fathers: [], mothers: [] });

    const ex = bare(excludedParentName).toLowerCase();
    const parentsA = new Set([...(snapA.fathers || []), ...(snapA.mothers || [])].filter(p => p !== ex));
    const parentsB = new Set([...(snapB.fathers || []), ...(snapB.mothers || [])].filter(p => p !== ex));

    for (const p of parentsA) {
      if (parentsB.has(p)) return true;
    }
    return false;
  }

  hasSharedChildrenRemaining(parentAName, parentBName, excludedChildName, fromPath = "") {
    const pAFile = this.resolve(parentAName, fromPath);
    const pBFile = this.resolve(parentBName, fromPath);
    const pAName = (pAFile ? pAFile.basename : bare(parentAName)).toLowerCase();
    const pBName = (pBFile ? pBFile.basename : bare(parentBName)).toLowerCase();
    const exName = bare(excludedChildName).toLowerCase();

    // 1. Check all child files in snapshot: any child note listing both pA and pB as parents
    for (const [path, snap] of this.fileRelationsSnapshot) {
      const childFile = this.app.vault.getAbstractFileByPath(path);
      if (!childFile || !(childFile instanceof obsidian.TFile)) continue;
      if (childFile.basename.toLowerCase() === exName) continue;

      const snapParents = [...(snap.fathers || []), ...(snap.mothers || [])].map(n => bare(n).toLowerCase());
      if (snapParents.includes(pAName) && snapParents.includes(pBName)) {
        return true;
      }
    }

    // 2. Also check parent notes directly: children listed on parentA vs children listed on parentB
    if (pAFile && pBFile) {
      const snapA = this.fileRelationsSnapshot.get(pAFile.path) || this.extractRelationsSnapshot(pAFile, this.app.metadataCache.getFileCache(pAFile));
      const snapB = this.fileRelationsSnapshot.get(pBFile.path) || this.extractRelationsSnapshot(pBFile, this.app.metadataCache.getFileCache(pBFile));
      if (snapA && snapB) {
        const childrenA = new Set([...(snapA.sons || []), ...(snapA.daughters || [])].map(n => bare(n).toLowerCase()).filter(n => n !== exName));
        const childrenB = [...(snapB.sons || []), ...(snapB.daughters || [])].map(n => bare(n).toLowerCase()).filter(n => n !== exName);
        for (const cb of childrenB) {
          if (childrenA.has(cb)) return true;
        }
      }
    }

    return false;
  }

  /* ══ WRITE & REMOVE QUEUE (Batched Dual-Direction Engine) ═════════════════════════ */

  addTombstone(nameA, nameB, durationMs = 2000) {
    if (!nameA || !nameB) return;
    const a = bare(nameA).toLowerCase();
    const b = bare(nameB).toLowerCase();
    if (!a || !b) return;
    const expiresAt = Date.now() + durationMs;
    this.tombstones.set(`${a}::${b}`, expiresAt);
    this.tombstones.set(`${b}::${a}`, expiresAt);
  }

  removeTombstone(nameA, nameB) {
    if (!nameA || !nameB) return;
    const a = bare(nameA).toLowerCase();
    const b = bare(nameB).toLowerCase();
    this.tombstones.delete(`${a}::${b}`);
    this.tombstones.delete(`${b}::${a}`);
  }

  clearTombstonesFor(name) {
    if (!name || !this.tombstones) return;
    const clean = bare(name).toLowerCase();
    for (const key of [...this.tombstones.keys()]) {
      if (key.startsWith(clean + "::") || key.endsWith("::" + clean)) {
        this.tombstones.delete(key);
      }
    }
  }

  isRecentlyCreated(path) {
    if (!path || !this.recentlyCreatedNotes) return false;
    const exp = this.recentlyCreatedNotes.get(path);
    if (!exp) return false;
    if (Date.now() > exp) {
      this.recentlyCreatedNotes.delete(path);
      return false;
    }
    return true;
  }

  isTombstoned(nameA, nameB) {
    if (!nameA || !nameB) return false;
    const a = bare(nameA).toLowerCase();
    const b = bare(nameB).toLowerCase();
    const key = `${a}::${b}`;
    const exp = this.tombstones.get(key);
    if (!exp) return false;
    if (Date.now() > exp) {
      this.tombstones.delete(key);
      return false;
    }
    return true;
  }

  enqueue(targetFile, propKey, sourceBasename) {
    if (!targetFile || !(targetFile instanceof obsidian.TFile)) return;
    if (!propKey || !sourceBasename) return;

    const name = bare(sourceBasename);
    if (!name) return;

    // Never link a note to itself!
    if (targetFile.basename.toLowerCase() === name.toLowerCase()) return;

    // Ghost / Loop Prevention: Never add back a recently deleted relationship!
    if (this.isTombstoned(targetFile.basename, name)) return;

    // Never add back a link that is queued for removal under this property on this file
    const remFm = this.removeQueue.get(targetFile.path);
    if (remFm) {
      for (const [remKey, remSet] of remFm) {
        if (remKey.toLowerCase() === propKey.toLowerCase() && remSet.has(name.toLowerCase())) return;
      }
    }

    // Strict Gender Integrity Guard:
    // If the person being linked (name) has an explicit gender, ensure propKey strictly matches that gender!
    const S = this.settings;
    const getPropListUnified = (k1, k2, fallbacks = []) => {
      const list = [...this.getPropList(S[k1]), ...this.getPropList(S[k2])];
      if (list.length > 0) return [...new Set(list)];
      return fallbacks;
    };
    const fatKeys  = getPropListUnified("fatherProperty", "fatherProps", ["father"]);
    const motKeys  = getPropListUnified("motherProperty", "motherProps", ["mother"]);
    const husbKeys = getPropListUnified("husbandProperty", "husbandProps", ["husband"]);
    const wifeKeys = getPropListUnified("wifeProperty", "wifeProps", ["wife"]);
    const sonKeys  = getPropListUnified("sonProperty", "sonProps", ["son"]);
    const dauKeys  = getPropListUnified("daughterProperty", "daughterProps", ["daughter"]);
    const broKeys  = getPropListUnified("brotherProperty", "brotherProps", ["brother"]);
    const sisKeys  = getPropListUnified("sisterProperty", "sisterProps", ["sister"]);

    const fatKey = fatKeys[0] || "";
    const motKey = motKeys[0] || "";
    const husbKey = husbKeys[0] || "";
    const wifeKey = wifeKeys[0] || "";
    const sonKey = sonKeys[0] || "";
    const dauKey = dauKeys[0] || "";
    const broKey = broKeys[0] || "";
    const sisKey = sisKeys[0] || "";

    const personGender = this.getFileGender(name, targetFile.path);
    if (personGender === "female") {
      if (fatKeys.some(k => k.toLowerCase() === propKey.toLowerCase())) {
        propKey = motKey || propKey;
      } else if (husbKeys.some(k => k.toLowerCase() === propKey.toLowerCase())) {
        propKey = wifeKey || propKey;
      } else if (sonKeys.some(k => k.toLowerCase() === propKey.toLowerCase())) {
        propKey = dauKey || propKey;
      } else if (broKeys.some(k => k.toLowerCase() === propKey.toLowerCase())) {
        propKey = sisKey || propKey;
      }
    } else if (personGender === "male") {
      if (motKeys.some(k => k.toLowerCase() === propKey.toLowerCase())) {
        propKey = fatKey || propKey;
      } else if (wifeKeys.some(k => k.toLowerCase() === propKey.toLowerCase())) {
        propKey = husbKey || propKey;
      } else if (dauKeys.some(k => k.toLowerCase() === propKey.toLowerCase())) {
        propKey = sonKey || propKey;
      } else if (sisKeys.some(k => k.toLowerCase() === propKey.toLowerCase())) {
        propKey = broKey || propKey;
      }
    }

    // Match propKey to existing frontmatter key if targetFile already defines it
    const cache = this.app.metadataCache.getFileCache(targetFile);
    if (cache && cache.frontmatter) {
      const matchKeyInGroup = (keys) => {
        if (keys.some(k => k.toLowerCase() === propKey.toLowerCase())) {
          const found = Object.keys(cache.frontmatter).find(k => keys.some(gk => gk.toLowerCase() === k.toLowerCase()));
          if (found) propKey = found;
        }
      };
      matchKeyInGroup(fatKeys);
      matchKeyInGroup(motKeys);
      matchKeyInGroup(husbKeys);
      matchKeyInGroup(wifeKeys);
      matchKeyInGroup(sonKeys);
      matchKeyInGroup(dauKeys);
      matchKeyInGroup(broKeys);
      matchKeyInGroup(sisKeys);
    }

    // Opposing Gender Role Mutual Exclusivity Guard:
    // A person cannot be in both opposing roles on the same note!
    // When adding a role that conflicts with an opposing role, enqueue removal of the outdated opposing role.
    const existingQueue = this.writeQueue.get(targetFile.path);
    const nameLo = name.toLowerCase();

    let opposingKeys = null;
    const pLoKey = propKey.toLowerCase();
    if (fatKeys.some(k => k.toLowerCase() === pLoKey)) opposingKeys = motKeys;
    else if (motKeys.some(k => k.toLowerCase() === pLoKey)) opposingKeys = fatKeys;
    else if (husbKeys.some(k => k.toLowerCase() === pLoKey)) opposingKeys = wifeKeys;
    else if (wifeKeys.some(k => k.toLowerCase() === pLoKey)) opposingKeys = husbKeys;
    else if (broKeys.some(k => k.toLowerCase() === pLoKey)) opposingKeys = sisKeys;
    else if (sisKeys.some(k => k.toLowerCase() === pLoKey)) opposingKeys = broKeys;
    else if (sonKeys.some(k => k.toLowerCase() === pLoKey)) opposingKeys = dauKeys;
    else if (dauKeys.some(k => k.toLowerCase() === pLoKey)) opposingKeys = sonKeys;

    if (opposingKeys && opposingKeys.length > 0) {
      if (existingQueue) {
        for (const [qKey, qSet] of existingQueue) {
          if (opposingKeys.some(k => k.toLowerCase() === qKey.toLowerCase())) {
            for (const item of [...qSet]) {
              if (bare(item).toLowerCase() === nameLo) {
                qSet.delete(item);
              }
            }
          }
        }
      }
      if (cache && cache.frontmatter) {
        for (const oppKey of opposingKeys) {
          if (linksUnderProp(cache, oppKey).some(x => bare(x).toLowerCase() === nameLo)) {
            if (!this.removeQueue.has(targetFile.path))
              this.removeQueue.set(targetFile.path, new Map());
            const fmRem = this.removeQueue.get(targetFile.path);
            if (!fmRem.has(oppKey)) fmRem.set(oppKey, new Set());
            fmRem.get(oppKey).add(nameLo);
            this.removeTombstone(targetFile.basename, name);
          }
        }
      }
    }

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

  enqueueRemoval(targetFile, propKey, sourceBasename) {
    if (!targetFile || !(targetFile instanceof obsidian.TFile)) return;
    if (!propKey || !sourceBasename) return;

    const name = bare(sourceBasename);
    if (!name) return;

    // Add tombstone immediately to prevent any re-addition
    this.addTombstone(targetFile.basename, name);

    if (!this.removeQueue.has(targetFile.path))
      this.removeQueue.set(targetFile.path, new Map());
    const fm = this.removeQueue.get(targetFile.path);
    if (!fm.has(propKey)) fm.set(propKey, new Set());
    fm.get(propKey).add(name.toLowerCase());

    // Also strip from writeQueue if it was pending addition
    const writeFm = this.writeQueue.get(targetFile.path);
    if (writeFm) {
      for (const [_, namesSet] of writeFm) {
        for (const queued of [...namesSet]) {
          if (bare(queued).toLowerCase() === name.toLowerCase()) {
            namesSet.delete(queued);
          }
        }
      }
    }

    if (!this.flushPending) {
      this.flushPending = true;
      Promise.resolve().then(() => this.flush());
    }
  }

  async flush() {
    this.flushPending = false;
    const writeSnapshot = new Map(this.writeQueue);
    this.writeQueue.clear();
    const removeSnapshot = new Map(this.removeQueue);
    this.removeQueue.clear();

    const affectedFiles = new Set([...writeSnapshot.keys(), ...removeSnapshot.keys()]);

    for (const filePath of affectedFiles) {
      const tFile = this.app.vault.getAbstractFileByPath(filePath);
      if (!(tFile instanceof obsidian.TFile)) continue;

      const propAdds = writeSnapshot.get(filePath);
      const propRems = removeSnapshot.get(filePath);

      // Clean out any conflicting adds that were queued for removal or tombstoned
      if (propAdds) {
        for (const [addKey, addNames] of propAdds) {
          for (const name of [...addNames]) {
            const cleanName = bare(name).toLowerCase();
            if (this.isTombstoned(tFile.basename, cleanName)) {
              addNames.delete(name);
              continue;
            }
            if (propRems) {
              for (const [remKey, remNames] of propRems) {
                if (remKey.toLowerCase() === addKey.toLowerCase() && remNames.has(cleanName)) {
                  addNames.delete(name);
                  break;
                }
              }
            }
          }
        }
      }

      this.writeGuard.add(filePath);
      try {
        await this.app.fileManager.processFrontMatter(tFile, fm => {
          // 1. Process Removals First
          if (propRems) {
            for (const [propKey, namesToRemove] of propRems) {
              const actualKey =
                Object.keys(fm).find(k => k.toLowerCase() === propKey.toLowerCase());
              if (!actualKey || fm[actualKey] == null) continue;

              const lowerNames = new Set([...namesToRemove].map(n => bare(n).toLowerCase()));
              const isMatch = (val) => {
                if (!val) return false;
                if (typeof val === "string") return lowerNames.has(bare(val).toLowerCase());
                if (typeof val === "object") {
                  const target = val.link || val.path || val.name || val.displayText || "";
                  return lowerNames.has(bare(target).toLowerCase());
                }
                return false;
              };

              const cur = fm[actualKey];
              if (Array.isArray(cur)) {
                const filtered = cur.filter(item => !isMatch(item) && item != null && (typeof item !== "string" || item.trim() !== ""));
                fm[actualKey] = filtered.length === 0 ? [] : filtered;
              } else if (isMatch(cur)) {
                fm[actualKey] = null;
              }
            }
          }

          // 2. Process Additions
          if (propAdds) {
            for (const [propKey, names] of propAdds) {
              const actualKey =
                Object.keys(fm).find(k => k.toLowerCase() === propKey.toLowerCase()) || propKey;

              for (const name of names) {
                if (this.isTombstoned(tFile.basename, name)) continue;
                const linkText = `[[${name}]]`;
                const lName = name.toLowerCase();

                const has = v => {
                  if (!v) return false;
                  if (typeof v === "string") return bare(v).toLowerCase() === lName;
                  if (Array.isArray(v)) return v.some(i => typeof i === "string" && bare(i).toLowerCase() === lName);
                  if (typeof v === "object") return bare(v.link || v.path || v.name || "").toLowerCase() === lName;
                  return false;
                };

                const cur = fm[actualKey];
                if (cur == null || (typeof cur === "string" && !cur.trim())) {
                  fm[actualKey] = linkText;
                } else if (Array.isArray(cur)) {
                  const cleanArr = cur.filter(item => item != null && (typeof item !== "string" || item.trim() !== ""));
                  if (!cleanArr.some(has)) cleanArr.push(linkText);
                  fm[actualKey] = cleanArr;
                } else if (!has(cur)) {
                  fm[actualKey] = [cur, linkText];
                }
              }
            }
          }

          const newSnap = this.extractRelationsSnapshot(tFile, { frontmatter: fm });
          if (newSnap) this.fileRelationsSnapshot.set(filePath, newSnap);
        });
      } catch (_) {}

      setTimeout(() => this.writeGuard.delete(filePath), 1000);
    }
  }

  /* ─── Reciprocal & Transitive Removal Logic ─── */

  removeMatchingLinks(targetFile, allowedKeySet, nameToRemove) {
    if (!targetFile || !(targetFile instanceof obsidian.TFile)) return;
    const lName = bare(nameToRemove).toLowerCase();
    if (!lName) return;

    this.addTombstone(targetFile.basename, nameToRemove);

    const cache = this.app.metadataCache.getFileCache(targetFile);
    const fm = cache ? cache.frontmatter : null;

    if (fm) {
      for (const k of Object.keys(fm)) {
        if (k === "position") continue;
        if (allowedKeySet && allowedKeySet.size > 0 && !allowedKeySet.has(k.toLowerCase())) continue;
        const links = linksUnderProp(cache, k);
        if (links.some(n => bare(n).toLowerCase() === lName)) {
          this.enqueueRemoval(targetFile, k, nameToRemove);
        }
      }
    } else if (allowedKeySet && allowedKeySet.size > 0) {
      for (const k of allowedKeySet) {
        this.enqueueRemoval(targetFile, k, nameToRemove);
      }
    }
  }

  applyRemovals(source, oldSnap, newSnap, cache) {
    const S = this.settings;
    const diffRemoved = (oldList, newList) => (oldList || []).filter(x => !(newList || []).includes(x));

    const getPropKeys = (k1, k2, fallbackNames = []) => {
      const list = [...this.getPropList(S[k1]), ...this.getPropList(S[k2])];
      if (list.length > 0) {
        return new Set(list.map(s => s.toLowerCase().trim()).filter(Boolean));
      }
      return new Set((fallbackNames || []).map(s => s.toLowerCase().trim()).filter(Boolean));
    };

    const fatKeys  = getPropKeys("fatherProperty", "fatherProps", ["father"]);
    const motKeys  = getPropKeys("motherProperty", "motherProps", ["mother"]);
    const parentKeys = new Set([...fatKeys, ...motKeys]);

    const husbKeys = getPropKeys("husbandProperty", "husbandProps", ["husband"]);
    const wifeKeys = getPropKeys("wifeProperty", "wifeProps", ["wife"]);
    const spouseKeys = new Set([...husbKeys, ...wifeKeys]);

    const sonKeys  = getPropKeys("sonProperty", "sonProps", ["son"]);
    const dauKeys  = getPropKeys("daughterProperty", "daughterProps", ["daughter"]);
    const childKeys = new Set([...sonKeys, ...dauKeys]);

    const broKeys  = getPropKeys("brotherProperty", "brotherProps", ["brother"]);
    const sisKeys  = getPropKeys("sisterProperty", "sisterProps", ["sister"]);
    const siblingKeys = new Set([...broKeys, ...sisKeys]);

    // 1. Custom Pairs Removal
    for (const rel of (this.settings.relations || [])) {
      if (rel.enabled === false || !rel.forward || !rel.inverse) continue;
      const fLo = rel.forward.toLowerCase().trim();
      const iLo = rel.inverse.toLowerCase().trim();
      if (!fLo || !iLo) continue;
      const oldRel = (oldSnap.custom || []).find(r => r.forward.toLowerCase().trim() === fLo && r.inverse.toLowerCase().trim() === iLo) || { forwardTargets: [], inverseTargets: [] };
      const newRel = (newSnap.custom || []).find(r => r.forward.toLowerCase().trim() === fLo && r.inverse.toLowerCase().trim() === iLo) || { forwardTargets: [], inverseTargets: [] };
      for (const targetName of diffRemoved(oldRel.forwardTargets, newRel.forwardTargets)) {
        const target = this.resolve(targetName, source.path);
        if (target && target.path !== source.path) {
          this.removeMatchingLinks(target, new Set([iLo]), source.basename);
          this.addTombstone(target.basename, source.basename);
        }
      }
      if (fLo !== iLo) {
        for (const targetName of diffRemoved(oldRel.inverseTargets, newRel.inverseTargets)) {
          const target = this.resolve(targetName, source.path);
          if (target && target.path !== source.path) {
            this.removeMatchingLinks(target, new Set([fLo]), source.basename);
            this.addTombstone(target.basename, source.basename);
          }
        }
      }
    }

    // 2. Spouse Removal (Husband / Wife) - unlinks spouses from each other
    const removedWives = diffRemoved(oldSnap.wives, newSnap.wives).filter(wName => {
      const wLo = bare(wName).toLowerCase();
      return !(newSnap.husbands || []).some(x => bare(x).toLowerCase() === wLo);
    });
    for (const wName of removedWives) {
      const cleanW = bare(wName);
      const target = this.resolve(cleanW, source.path);
      if (target && target.path !== source.path) {
        this.removeMatchingLinks(target, spouseKeys, source.basename);
        this.removeMatchingLinks(source, spouseKeys, target.basename);
        this.addTombstone(target.basename, source.basename);
      } else {
        this.removeMatchingLinks(source, spouseKeys, cleanW);
        this.addTombstone(cleanW, source.basename);
      }
    }
    const removedHusbands = diffRemoved(oldSnap.husbands, newSnap.husbands).filter(hName => {
      const hLo = bare(hName).toLowerCase();
      return !(newSnap.wives || []).some(x => bare(x).toLowerCase() === hLo);
    });
    for (const hName of removedHusbands) {
      const cleanH = bare(hName);
      const target = this.resolve(cleanH, source.path);
      if (target && target.path !== source.path) {
        this.removeMatchingLinks(target, spouseKeys, source.basename);
        this.removeMatchingLinks(source, spouseKeys, target.basename);
        this.addTombstone(target.basename, source.basename);
      } else {
        this.removeMatchingLinks(source, spouseKeys, cleanH);
        this.addTombstone(cleanH, source.basename);
      }
    }

    // 3. Child Removal from Parent (e.g. Parent removed Child)
    const rawRemovedChildren = [
      ...diffRemoved(oldSnap.sons, newSnap.sons),
      ...diffRemoved(oldSnap.daughters, newSnap.daughters)
    ];
    const removedChildren = rawRemovedChildren.filter(cName => {
      const cLo = bare(cName).toLowerCase();
      const stillInSons = (newSnap.sons || []).some(x => bare(x).toLowerCase() === cLo);
      const stillInDaughters = (newSnap.daughters || []).some(x => bare(x).toLowerCase() === cLo);
      return !stillInSons && !stillInDaughters;
    });

    for (const cName of removedChildren) {
      const cleanC = bare(cName);
      const targetChild = this.resolve(cleanC, source.path);
      const childCache = targetChild ? this.app.metadataCache.getFileCache(targetChild) : null;
      const childSnap = (targetChild && childCache) ? this.extractRelationsSnapshot(targetChild, childCache) : null;

      // Immediately tombstone parent <-> child
      this.addTombstone(source.basename, cleanC);

      // 3a. In child note: remove source from parent properties
      if (targetChild && targetChild.path !== source.path) {
        this.removeMatchingLinks(targetChild, parentKeys, source.basename);
      }
      this.removeMatchingLinks(source, childKeys, cleanC);

      // 3b. Find co-parents
      const coParents = new Set([
        ...(oldSnap.wives || []), ...(newSnap.wives || []),
        ...(oldSnap.husbands || []), ...(newSnap.husbands || [])
      ]);
      if (childSnap) {
        (childSnap.mothers || []).forEach(m => coParents.add(bare(m)));
        (childSnap.fathers || []).forEach(f => coParents.add(bare(f)));
      }
      for (const [snapPath, snap] of this.fileRelationsSnapshot) {
        if ((snap.sons || []).includes(cleanC.toLowerCase()) || (snap.daughters || []).includes(cleanC.toLowerCase())) {
          const f = this.app.vault.getAbstractFileByPath(snapPath);
          if (f && f instanceof obsidian.TFile && f.basename.toLowerCase() !== source.basename.toLowerCase()) {
            coParents.add(f.basename);
          }
        }
      }
      coParents.delete(source.basename);
      coParents.delete(source.basename.toLowerCase());
      coParents.delete(cleanC);
      coParents.delete(cleanC.toLowerCase());

      // Remove child from all co-parents' child properties, and co-parents from child
      for (const cpName of coParents) {
        const cleanCP = bare(cpName);
        this.addTombstone(cleanCP, cleanC);
        const cpFile = this.resolve(cleanCP, source.path);
        if (cpFile && cpFile.path !== source.path) {
          this.removeMatchingLinks(cpFile, childKeys, cleanC);
        }
        if (targetChild) {
          this.removeMatchingLinks(targetChild, parentKeys, cpFile ? cpFile.basename : cleanCP);
        }
        // If parents share NO other children, separate them as spouses
        if (!this.hasSharedChildrenRemaining(source.basename, cpFile ? cpFile.basename : cleanCP, cleanC, source.path)) {
          this.removeMatchingLinks(source, spouseKeys, cpFile ? cpFile.basename : cleanCP);
          if (cpFile) this.removeMatchingLinks(cpFile, spouseKeys, source.basename);
          this.addTombstone(source.basename, cpFile ? cpFile.basename : cleanCP);
        }
      }

      // 3c. Sibling Cleanup: Remove child from all sibling notes, and siblings from child
      const allSiblings = new Set([
        ...(oldSnap.sons || []), ...(newSnap.sons || []),
        ...(oldSnap.daughters || []), ...(newSnap.daughters || [])
      ]);
      if (childSnap) {
        (childSnap.brothers || []).forEach(b => allSiblings.add(bare(b)));
        (childSnap.sisters || []).forEach(s => allSiblings.add(bare(s)));
      }
      for (const cpName of coParents) {
        const cpFile = this.resolve(cpName, source.path);
        if (cpFile) {
          const cpCache = this.app.metadataCache.getFileCache(cpFile);
          const cpSnap = cpCache ? this.extractRelationsSnapshot(cpFile, cpCache) : null;
          if (cpSnap) {
            (cpSnap.sons || []).forEach(n => allSiblings.add(bare(n)));
            (cpSnap.daughters || []).forEach(n => allSiblings.add(bare(n)));
          }
        }
      }
      for (const [snapPath, snap] of this.fileRelationsSnapshot) {
        if ((snap.brothers || []).includes(cleanC.toLowerCase()) || (snap.sisters || []).includes(cleanC.toLowerCase())) {
          const f = this.app.vault.getAbstractFileByPath(snapPath);
          if (f && f instanceof obsidian.TFile) allSiblings.add(f.basename);
        }
      }
      allSiblings.delete(cleanC);
      allSiblings.delete(cleanC.toLowerCase());
      allSiblings.delete(source.basename);
      allSiblings.delete(source.basename.toLowerCase());

      for (const sibName of allSiblings) {
        const cleanSib = bare(sibName);
        this.addTombstone(cleanSib, cleanC);
        const sibFile = this.resolve(cleanSib, source.path);
        if (sibFile) {
          this.removeMatchingLinks(sibFile, siblingKeys, cleanC);
          if (targetChild) {
            this.removeMatchingLinks(targetChild, siblingKeys, sibFile.basename);
          }
        }
      }
    }

    // 4. Parent Removal from Child (e.g. Child removed Parent)
    const rawRemovedParents = [
      ...diffRemoved(oldSnap.fathers, newSnap.fathers),
      ...diffRemoved(oldSnap.mothers, newSnap.mothers)
    ];
    const removedParents = rawRemovedParents.filter(pName => {
      const pLo = bare(pName).toLowerCase();
      const stillInFathers = (newSnap.fathers || []).some(x => bare(x).toLowerCase() === pLo);
      const stillInMothers = (newSnap.mothers || []).some(x => bare(x).toLowerCase() === pLo);
      return !stillInFathers && !stillInMothers;
    });

    for (const pName of removedParents) {
      const cleanP = bare(pName);
      const targetParent = this.resolve(cleanP, source.path);
      const pCache = targetParent ? this.app.metadataCache.getFileCache(targetParent) : null;
      const pSnap = (targetParent && pCache) ? this.extractRelationsSnapshot(targetParent, pCache) : null;

      // Immediately tombstone child <-> parent
      this.addTombstone(source.basename, cleanP);

      // 4a. In parent note: remove child (source) from child properties
      if (targetParent && targetParent.path !== source.path) {
        this.removeMatchingLinks(targetParent, childKeys, source.basename);
      }
      this.removeMatchingLinks(source, parentKeys, cleanP);

      // 4b. Find co-parents
      const coParents = new Set([
        ...(pSnap?.wives || []), ...(pSnap?.husbands || []),
        ...(oldSnap.fathers || []), ...(newSnap.fathers || []),
        ...(oldSnap.mothers || []), ...(newSnap.mothers || [])
      ]);
      for (const [snapPath, snap] of this.fileRelationsSnapshot) {
        if ((snap.sons || []).includes(source.basename.toLowerCase()) || (snap.daughters || []).includes(source.basename.toLowerCase())) {
          const f = this.app.vault.getAbstractFileByPath(snapPath);
          if (f && f instanceof obsidian.TFile && f.basename.toLowerCase() !== cleanP.toLowerCase()) {
            coParents.add(f.basename);
          }
        }
      }
      coParents.delete(cleanP);
      coParents.delete(cleanP.toLowerCase());
      coParents.delete(source.basename);
      coParents.delete(source.basename.toLowerCase());

      for (const cpName of coParents) {
        const cleanCP = bare(cpName);
        this.addTombstone(source.basename, cleanCP);
        const cpFile = this.resolve(cleanCP, source.path);
        if (cpFile && cpFile.path !== source.path) {
          // Remove child from co-parent note
          this.removeMatchingLinks(cpFile, childKeys, source.basename);
        }
        // Auto-delink co-parent from child note
        this.removeMatchingLinks(source, parentKeys, cpFile ? cpFile.basename : cleanCP);
        // If parents share NO other children, separate them as spouses
        if (!this.hasSharedChildrenRemaining(cleanP, cpFile ? cpFile.basename : cleanCP, source.basename, source.path)) {
          if (targetParent) this.removeMatchingLinks(targetParent, spouseKeys, cpFile ? cpFile.basename : cleanCP);
          if (cpFile) this.removeMatchingLinks(cpFile, spouseKeys, targetParent ? targetParent.basename : cleanP);
          this.addTombstone(cleanP, cpFile ? cpFile.basename : cleanCP);
        }
      }

      // 4c. Sibling Cleanup
      const allSiblings = new Set([
        ...(pSnap?.sons || []), ...(pSnap?.daughters || []),
        ...(oldSnap.brothers || []), ...(newSnap.brothers || []),
        ...(oldSnap.sisters || []), ...(newSnap.sisters || [])
      ]);
      for (const cpName of coParents) {
        const cpFile = this.resolve(cpName, source.path);
        if (cpFile) {
          const cpCache = this.app.metadataCache.getFileCache(cpFile);
          const cpSnap = cpCache ? this.extractRelationsSnapshot(cpFile, cpCache) : null;
          if (cpSnap) {
            (cpSnap.sons || []).forEach(n => allSiblings.add(bare(n)));
            (cpSnap.daughters || []).forEach(n => allSiblings.add(bare(n)));
          }
        }
      }
      allSiblings.delete(source.basename);
      allSiblings.delete(source.basename.toLowerCase());

      for (const sibName of allSiblings) {
        const cleanSib = bare(sibName);
        this.addTombstone(source.basename, cleanSib);
        const sibFile = this.resolve(cleanSib, source.path);
        if (sibFile) {
          this.removeMatchingLinks(sibFile, siblingKeys, source.basename);
          this.removeMatchingLinks(source, siblingKeys, sibFile.basename);
        }
      }
    }

    // 5. Sibling Removal from Sibling (Option A: Full Family Detachment)
    const rawRemovedSiblings = [
      ...diffRemoved(oldSnap.brothers, newSnap.brothers),
      ...diffRemoved(oldSnap.sisters, newSnap.sisters)
    ];
    const removedSiblings = rawRemovedSiblings.filter(sibName => {
      const sLo = bare(sibName).toLowerCase();
      const stillInBrothers = (newSnap.brothers || []).some(x => bare(x).toLowerCase() === sLo);
      const stillInSisters = (newSnap.sisters || []).some(x => bare(x).toLowerCase() === sLo);
      return !stillInBrothers && !stillInSisters;
    });

    for (const sibName of removedSiblings) {
      const cleanSib = bare(sibName);
      const targetSib = this.resolve(cleanSib, source.path);
      const sibCache = targetSib ? this.app.metadataCache.getFileCache(targetSib) : null;
      const sibSnap = (targetSib && sibCache) ? this.extractRelationsSnapshot(targetSib, sibCache) : null;

      // Immediately tombstone sibling <-> sibling
      this.addTombstone(source.basename, cleanSib);

      // 5a. Remove from source and vice versa
      if (targetSib && targetSib.path !== source.path) {
        this.removeMatchingLinks(targetSib, siblingKeys, source.basename);
        this.removeMatchingLinks(source, siblingKeys, targetSib.basename);
      } else {
        this.removeMatchingLinks(source, siblingKeys, cleanSib);
      }

      // 5b. Find all parents of the family
      const parents = new Set([
        ...(oldSnap.fathers || []), ...(newSnap.fathers || []),
        ...(oldSnap.mothers || []), ...(newSnap.mothers || [])
      ]);
      if (sibSnap) {
        (sibSnap.fathers || []).forEach(f => parents.add(bare(f)));
        (sibSnap.mothers || []).forEach(m => parents.add(bare(m)));
      }
      for (const [snapPath, snap] of this.fileRelationsSnapshot) {
        if ((snap.sons || []).includes(cleanSib.toLowerCase()) || (snap.daughters || []).includes(cleanSib.toLowerCase())) {
          const f = this.app.vault.getAbstractFileByPath(snapPath);
          if (f && f instanceof obsidian.TFile) parents.add(f.basename);
        }
      }
      parents.delete(cleanSib);
      parents.delete(cleanSib.toLowerCase());
      parents.delete(source.basename);
      parents.delete(source.basename.toLowerCase());

      // 5c. Remove detached sibling from all parents, and all parents from detached sibling
      for (const pName of parents) {
        const cleanP = bare(pName);
        this.addTombstone(cleanP, cleanSib);
        const pFile = this.resolve(cleanP, source.path);
        if (pFile) {
          this.removeMatchingLinks(pFile, childKeys, cleanSib);
          if (targetSib) {
            this.removeMatchingLinks(targetSib, parentKeys, pFile.basename);
          }
        }
      }

      // 5d. Remove detached sibling from other siblings, and other siblings from detached sibling
      const otherSiblings = new Set([
        ...(oldSnap.brothers || []), ...(newSnap.brothers || []),
        ...(oldSnap.sisters || []), ...(newSnap.sisters || [])
      ]);
      if (sibSnap) {
        (sibSnap.brothers || []).forEach(b => otherSiblings.add(bare(b)));
        (sibSnap.sisters || []).forEach(s => otherSiblings.add(bare(s)));
      }
      otherSiblings.delete(cleanSib);
      otherSiblings.delete(cleanSib.toLowerCase());
      otherSiblings.delete(source.basename);
      otherSiblings.delete(source.basename.toLowerCase());

      for (const otherName of otherSiblings) {
        const cleanOther = bare(otherName);
        this.addTombstone(cleanOther, cleanSib);
        const otherFile = this.resolve(cleanOther, source.path);
        if (otherFile && otherFile.path !== source.path) {
          this.removeMatchingLinks(otherFile, siblingKeys, cleanSib);
          if (targetSib) {
            this.removeMatchingLinks(targetSib, siblingKeys, otherFile.basename);
          }
        }
      }

      // 5e. If parents shared only this child, check if remaining parents have shared children
      const pList = [...parents];
      for (let i = 0; i < pList.length; i++) {
        for (let j = i + 1; j < pList.length; j++) {
          const p1 = pList[i];
          const p2 = pList[j];
          const cleanP1 = bare(p1);
          const cleanP2 = bare(p2);
          if (!this.hasSharedChildrenRemaining(cleanP1, cleanP2, cleanSib, source.path)) {
            const f1 = this.resolve(cleanP1, source.path);
            const f2 = this.resolve(cleanP2, source.path);
            if (f1) this.removeMatchingLinks(f1, spouseKeys, f2 ? f2.basename : cleanP2);
            if (f2) this.removeMatchingLinks(f2, spouseKeys, f1 ? f1.basename : cleanP1);
            this.addTombstone(cleanP1, cleanP2);
          }
        }
      }
    }
  }

  /* ─── event handlers ─── */

  onNoteChanged(file) {
    if (this.writeGuard.has(file.path)) return false;
    if (!this.isIncluded(file)) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return false;
    const oldSnap = this.fileRelationsSnapshot.get(file.path);
    const newSnap = this.extractRelationsSnapshot(file, cache);

    let hasRemovals = false;
    let hasAdditions = false;

    if (oldSnap && newSnap) {
      const checkRemoved = (oldList, newList) => (oldList || []).some(x => !(newList || []).includes(x));
      const checkAdded = (oldList, newList) => (newList || []).some(x => !(oldList || []).includes(x));

      hasRemovals = checkRemoved(oldSnap.fathers, newSnap.fathers) ||
                    checkRemoved(oldSnap.mothers, newSnap.mothers) ||
                    checkRemoved(oldSnap.husbands, newSnap.husbands) ||
                    checkRemoved(oldSnap.wives, newSnap.wives) ||
                    checkRemoved(oldSnap.sons, newSnap.sons) ||
                    checkRemoved(oldSnap.daughters, newSnap.daughters) ||
                    checkRemoved(oldSnap.brothers, newSnap.brothers) ||
                    checkRemoved(oldSnap.sisters, newSnap.sisters);

      hasAdditions = checkAdded(oldSnap.fathers, newSnap.fathers) ||
                     checkAdded(oldSnap.mothers, newSnap.mothers) ||
                     checkAdded(oldSnap.husbands, newSnap.husbands) ||
                     checkAdded(oldSnap.wives, newSnap.wives) ||
                     checkAdded(oldSnap.sons, newSnap.sons) ||
                     checkAdded(oldSnap.daughters, newSnap.daughters) ||
                     checkAdded(oldSnap.brothers, newSnap.brothers) ||
                     checkAdded(oldSnap.sisters, newSnap.sisters);

      for (const rel of (this.settings.relations || [])) {
        if (rel.enabled === false || !rel.forward || !rel.inverse) continue;
        const fLo = rel.forward.toLowerCase().trim();
        const iLo = rel.inverse.toLowerCase().trim();
        if (!fLo || !iLo) continue;
        const oldRel = (oldSnap.custom || []).find(r => r.forward.toLowerCase().trim() === fLo && r.inverse.toLowerCase().trim() === iLo) || { forwardTargets: [], inverseTargets: [] };
        const newRel = (newSnap.custom || []).find(r => r.forward.toLowerCase().trim() === fLo && r.inverse.toLowerCase().trim() === iLo) || { forwardTargets: [], inverseTargets: [] };
        if (checkRemoved(oldRel.forwardTargets, newRel.forwardTargets) || (fLo !== iLo && checkRemoved(oldRel.inverseTargets, newRel.inverseTargets))) hasRemovals = true;
        if (checkAdded(oldRel.forwardTargets, newRel.forwardTargets) || (fLo !== iLo && checkAdded(oldRel.inverseTargets, newRel.inverseTargets))) hasAdditions = true;
      }

      // If user explicitly added a relation, remove any existing tombstone for it
      if (hasAdditions) {
        const diffAdd = (oldList, newList) => (newList || []).filter(x => !(oldList || []).includes(x));
        const allAdded = [
          ...diffAdd(oldSnap.fathers, newSnap.fathers),
          ...diffAdd(oldSnap.mothers, newSnap.mothers),
          ...diffAdd(oldSnap.husbands, newSnap.husbands),
          ...diffAdd(oldSnap.wives, newSnap.wives),
          ...diffAdd(oldSnap.sons, newSnap.sons),
          ...diffAdd(oldSnap.daughters, newSnap.daughters),
          ...diffAdd(oldSnap.brothers, newSnap.brothers),
          ...diffAdd(oldSnap.sisters, newSnap.sisters)
        ];
        for (const rel of (this.settings.relations || [])) {
          if (rel.enabled === false || !rel.forward || !rel.inverse) continue;
          const fLo = rel.forward.toLowerCase().trim();
          const iLo = rel.inverse.toLowerCase().trim();
          if (!fLo || !iLo) continue;
          const oldRel = (oldSnap.custom || []).find(r => r.forward.toLowerCase().trim() === fLo && r.inverse.toLowerCase().trim() === iLo) || { forwardTargets: [], inverseTargets: [] };
          const newRel = (newSnap.custom || []).find(r => r.forward.toLowerCase().trim() === fLo && r.inverse.toLowerCase().trim() === iLo) || { forwardTargets: [], inverseTargets: [] };
          allAdded.push(...diffAdd(oldRel.forwardTargets, newRel.forwardTargets));
          if (fLo !== iLo) {
            allAdded.push(...diffAdd(oldRel.inverseTargets, newRel.inverseTargets));
          }
        }
        this.clearTombstonesFor(file.basename);
        for (const addedName of allAdded) {
          this.clearTombstonesFor(addedName);
        }
        const connectedFamily = [
          ...(newSnap.fathers || []),
          ...(newSnap.mothers || []),
          ...(newSnap.husbands || []),
          ...(newSnap.wives || []),
          ...(newSnap.sons || []),
          ...(newSnap.daughters || []),
          ...(newSnap.brothers || []),
          ...(newSnap.sisters || [])
        ];
        for (const cName of connectedFamily) {
          this.clearTombstonesFor(cName);
        }
      }

      // If note was created recently (within 10s), template application or initial setup must not unlink family:
      if (this.isRecentlyCreated(file.path)) {
        hasRemovals = false;
        setTimeout(() => {
          this.reconcileFamilyUnit(file.basename);
          this.flush();
        }, 100);
      }

      if (hasRemovals) {
        this.applyRemovals(file, oldSnap, newSnap, cache);
        this.flush();
      }

    }

    if (newSnap) {
      this.fileRelationsSnapshot.set(file.path, newSnap);
    }

    // Only runSync if new relations were added (or first load). Never runSync on pure property removals!
    if (!oldSnap || hasAdditions) {
      this.runSync(file, cache);
      if (hasAdditions && oldSnap && newSnap) {
        const diffAdd = (oldList, newList) => (newList || []).filter(x => !(oldList || []).includes(x));
        const allAdded = [
          ...diffAdd(oldSnap.fathers, newSnap.fathers),
          ...diffAdd(oldSnap.mothers, newSnap.mothers),
          ...diffAdd(oldSnap.husbands, newSnap.husbands),
          ...diffAdd(oldSnap.wives, newSnap.wives),
          ...diffAdd(oldSnap.sons, newSnap.sons),
          ...diffAdd(oldSnap.daughters, newSnap.daughters),
          ...diffAdd(oldSnap.brothers, newSnap.brothers),
          ...diffAdd(oldSnap.sisters, newSnap.sisters)
        ];
        for (const addedName of allAdded) {
          this.reconcileFamilyUnit(addedName);
        }
      }
    }

    return hasRemovals;
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

  async onNoteCreated(targetFile) {
    if (!targetFile || !(targetFile instanceof obsidian.TFile) || targetFile.extension !== "md") return;
    const targetName = bare(targetFile.basename).toLowerCase();
    if (!targetName) return;

    this.clearTombstonesFor(targetFile.basename);

    const targetCache = this.app.metadataCache.getFileCache(targetFile);
    if (targetCache) {
      const snap = this.extractRelationsSnapshot(targetFile, targetCache);
      if (snap) this.fileRelationsSnapshot.set(targetFile.path, snap);
    }

    this.reconcileFamilyUnit(targetFile.basename);

    // Reconcile all notes that link to targetFile.basename (Blindspot 2)
    const referrers = new Set();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path === targetFile.path || !this.isIncluded(file)) continue;
      const c = this.app.metadataCache.getFileCache(file);
      if (!c || !c.frontmatter) continue;
      for (const k of Object.keys(c.frontmatter)) {
        if (k === "position") continue;
        if (linksUnderProp(c, k).some(n => bare(n).toLowerCase() === targetName)) {
          referrers.add(file.basename);
          break;
        }
      }
    }
    for (const refName of referrers) {
      this.clearTombstonesFor(refName);
      this.reconcileFamilyUnit(refName);
    }

    this.applyPairs(targetFile, targetCache);

    await this.flush();
  }

  async syncAllVault() {
    const files = this.app.vault.getMarkdownFiles().filter(f => this.isIncluded(f));
    new obsidian.Notice(`Simple Relation Sync: scanning ${files.length} notes…`);
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache) this.runSync(file, cache);
    }
    await this.flush();
    this.initRelationsSnapshot();
    new obsidian.Notice("Simple Relation Sync: done!");
  }

  /* ─── core sync engine ─── */

  runSync(sourceFile, cache) {
    this.applyPairs(sourceFile, cache);
    this.reconcileFamilyUnit(sourceFile.basename);
  }

  applyPairs(source, cache) {
    if (!source || !(source instanceof obsidian.TFile)) return;
    const activeRelations = (this.settings.relations || []).filter(
      rel => rel.enabled !== false && rel.forward && rel.inverse && rel.forward.trim() && rel.inverse.trim()
    );
    if (activeRelations.length === 0) return;

    const sourceNameLo = bare(source.basename).toLowerCase();

    // 1. Outgoing custom relations from source
    if (cache && cache.frontmatter) {
      for (const rel of activeRelations) {
        const fwd = rel.forward.trim();
        const inv = rel.inverse.trim();

        for (const name of linksUnderProp(cache, fwd)) {
          const target = this.resolve(name, source.path);
          if (target && target.path !== source.path && (this.isIncluded(target) || this.isIncluded(source)))
            this.enqueue(target, inv, source.basename);
        }

        if (fwd.toLowerCase() !== inv.toLowerCase()) {
          for (const name of linksUnderProp(cache, inv)) {
            const target = this.resolve(name, source.path);
            if (target && target.path !== source.path && (this.isIncluded(target) || this.isIncluded(source)))
              this.enqueue(target, fwd, source.basename);
          }
        }
      }
    }

    // 2. Incoming custom relations to source from vault notes (Blindspots 9 & 10)
    for (const otherFile of this.app.vault.getMarkdownFiles()) {
      if (otherFile.path === source.path) continue;
      if (!this.isIncluded(otherFile) && !this.isIncluded(source)) continue;
      const oCache = this.app.metadataCache.getFileCache(otherFile);
      if (!oCache || !oCache.frontmatter) continue;

      for (const rel of activeRelations) {
        const fwd = rel.forward.trim();
        const inv = rel.inverse.trim();

        if (linksUnderProp(oCache, fwd).some(n => bare(n).toLowerCase() === sourceNameLo)) {
          this.enqueue(source, inv, otherFile.basename);
        }
        if (fwd.toLowerCase() !== inv.toLowerCase()) {
          if (linksUnderProp(oCache, inv).some(n => bare(n).toLowerCase() === sourceNameLo)) {
            this.enqueue(source, fwd, otherFile.basename);
          }
        }
      }
    }
  }

  /* ─── Unified Nuclear Family Unit Reconciliation Engine ─── */

  reconcileFamilyUnit(personName) {
    if (!personName) return;
    const cleanP = bare(personName);
    const pLo = cleanP.toLowerCase();
    if (!pLo) return;

    const S = this.settings;
    const getPropListUnified = (k1, k2, fallbacks = []) => {
      const list = [...this.getPropList(S[k1]), ...this.getPropList(S[k2])];
      if (list.length > 0) return [...new Set(list)];
      return fallbacks;
    };

    const fatKeys  = getPropListUnified("fatherProperty", "fatherProps", ["father"]);
    const motKeys  = getPropListUnified("motherProperty", "motherProps", ["mother"]);
    const husbKeys = getPropListUnified("husbandProperty", "husbandProps", ["husband"]);
    const wifeKeys = getPropListUnified("wifeProperty", "wifeProps", ["wife"]);
    const sonKeys  = getPropListUnified("sonProperty", "sonProps", ["son"]);
    const dauKeys  = getPropListUnified("daughterProperty", "daughterProps", ["daughter"]);
    const broKeys  = getPropListUnified("brotherProperty", "brotherProps", ["brother"]);
    const sisKeys  = getPropListUnified("sisterProperty", "sisterProps", ["sister"]);

    const fatKey = fatKeys[0] || "";
    const motKey = motKeys[0] || "";
    const husbKey = husbKeys[0] || "";
    const wifeKey = wifeKeys[0] || "";
    const sonKey = sonKeys[0] || "";
    const dauKey = dauKeys[0] || "";
    const broKey = broKeys[0] || "";
    const sisKey = sisKeys[0] || "";

    const pFile = this.resolve(cleanP);
    const pCache = pFile ? this.app.metadataCache.getFileCache(pFile) : null;
    const pGender = this.getFileGender(pFile || cleanP);

    // ── CLUSTER A: When person is a CHILD (reconcile parents, co-parents, and siblings) ──
    const fathers = new Set();
    const mothers = new Set();
    const siblings = new Set();
    siblings.add(cleanP);

    // 1. Direct parents & siblings on person's note
    if (pCache && pCache.frontmatter) {
      for (const fk of fatKeys) linksUnderProp(pCache, fk).forEach(n => fathers.add(bare(n)));
      for (const mk of motKeys) linksUnderProp(pCache, mk).forEach(n => mothers.add(bare(n)));
      for (const bk of broKeys) linksUnderProp(pCache, bk).forEach(n => siblings.add(bare(n)));
      for (const sk of sisKeys) linksUnderProp(pCache, sk).forEach(n => siblings.add(bare(n)));
    }

    // 2. Vault notes listing person as son/daughter or brother/sister
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.isIncluded(file)) continue;
      const c = this.app.metadataCache.getFileCache(file);
      if (!c || !c.frontmatter) continue;

      let listsAsSon = false;
      let listsAsDau = false;
      for (const sk of sonKeys) {
        if (linksUnderProp(c, sk).some(x => bare(x).toLowerCase() === pLo)) listsAsSon = true;
      }
      for (const dk of dauKeys) {
        if (linksUnderProp(c, dk).some(x => bare(x).toLowerCase() === pLo)) listsAsDau = true;
      }

      if (listsAsSon || listsAsDau) {
        const fg = this.getFileGender(file);
        if (fg === "male") fathers.add(file.basename);
        else if (fg === "female") mothers.add(file.basename);
        else {
          if (wifeKeys.some(k => linksUnderProp(c, k).length > 0)) fathers.add(file.basename);
          else if (husbKeys.some(k => linksUnderProp(c, k).length > 0)) mothers.add(file.basename);
          else if (mothers.has(file.basename)) {
            // Already identified as mother
          } else if (fathers.has(file.basename)) {
            // Already identified as father
          } else if (fathers.size > 0 && !fathers.has(file.basename)) {
            mothers.add(file.basename);
          } else if (mothers.size > 0 && !mothers.has(file.basename)) {
            fathers.add(file.basename);
          } else {
            fathers.add(file.basename);
          }
        }
      }

      // Check if file lists person as brother or sister
      for (const bk of [...broKeys, ...sisKeys]) {
        if (linksUnderProp(c, bk).some(x => bare(x).toLowerCase() === pLo)) {
          siblings.add(file.basename);
        }
      }
    }

    // Iterative Transitive Loop for Cluster A (Blindspots 3, 4, 7, 11)
    for (let pass = 0; pass < 5; pass++) {
      const prevFathersCount = fathers.size;
      const prevMothersCount = mothers.size;
      const prevSiblingsCount = siblings.size;

      // 2b. Inherit parents and peer siblings from siblings (in-memory)
      if (this.settings.autoLinkSiblings !== false) {
        for (const sibName of [...siblings]) {
          if (bare(sibName).toLowerCase() === pLo) continue;
          const sLo = bare(sibName).toLowerCase();
          const sFile = this.resolve(sibName);
          if (sFile) {
            const sc = this.app.metadataCache.getFileCache(sFile);
            if (sc && sc.frontmatter) {
              for (const fk of fatKeys) linksUnderProp(sc, fk).forEach(n => fathers.add(bare(n)));
              for (const mk of motKeys) linksUnderProp(sc, mk).forEach(n => mothers.add(bare(n)));
              for (const bk of broKeys) linksUnderProp(sc, bk).forEach(n => siblings.add(bare(n)));
              for (const sk of sisKeys) linksUnderProp(sc, sk).forEach(n => siblings.add(bare(n)));
            }
          }
          for (const [snapPath, snap] of this.fileRelationsSnapshot) {
            if ((snap.sons || []).includes(sLo) || (snap.daughters || []).includes(sLo)) {
              const p = this.app.vault.getAbstractFileByPath(snapPath);
              if (p && p instanceof obsidian.TFile) {
                const fg = this.getFileGender(p);
                if (fg === "female") mothers.add(p.basename);
                else if (fg === "male") fathers.add(p.basename);
                else if (mothers.has(p.basename)) {}
                else if (fathers.has(p.basename)) {}
                else if (fathers.size > 0 && !fathers.has(p.basename)) mothers.add(p.basename);
                else if (mothers.size > 0 && !mothers.has(p.basename)) fathers.add(p.basename);
                else fathers.add(p.basename);
              }
            }
          }
        }
      }

      // 3. Include spouses of found parents as co-parents (in-memory)
      if (this.settings.autoLinkSpouseCoParent !== false) {
        for (const fName of [...fathers]) {
          const fFile = this.resolve(fName);
          if (fFile) {
            const fc = this.app.metadataCache.getFileCache(fFile);
            if (fc) {
              for (const wk of wifeKeys) linksUnderProp(fc, wk).forEach(w => mothers.add(bare(w)));
            }
          }
        }
        for (const mName of [...mothers]) {
          const mFile = this.resolve(mName);
          if (mFile) {
            const mc = this.app.metadataCache.getFileCache(mFile);
            if (mc) {
              for (const hk of husbKeys) linksUnderProp(mc, hk).forEach(h => fathers.add(bare(h)));
            }
          }
        }
      }

      // 4. Gather children of all found parents into siblings (in-memory)
      const allParentNames = [...new Set([...fathers, ...mothers])];
      for (const pName of allParentNames) {
        const parentFile = this.resolve(pName);
        if (parentFile) {
          const pc = this.app.metadataCache.getFileCache(parentFile);
          if (pc) {
            for (const sk of sonKeys) linksUnderProp(pc, sk).forEach(n => siblings.add(bare(n)));
            for (const dk of dauKeys) linksUnderProp(pc, dk).forEach(n => siblings.add(bare(n)));
          }
        }
      }

      // Batched Vault Scan for Cluster A (Steps 2b, 3, 4) in a single pass
      const sibLowers = new Set([...siblings].map(s => bare(s).toLowerCase()).filter(s => s !== pLo));
      const fatLowers = new Set([...fathers].map(f => bare(f).toLowerCase()));
      const motLowers = new Set([...mothers].map(m => bare(m).toLowerCase()));
      const parLowers = new Set([...fatLowers, ...motLowers]);
      const checkCoParents = this.settings.autoLinkSpouseCoParent !== false;

      for (const file of this.app.vault.getMarkdownFiles()) {
        if (!this.isIncluded(file)) continue;
        const c = this.app.metadataCache.getFileCache(file);
        if (!c || !c.frontmatter) continue;

        // Step 2b: Vault notes listing any sibling as son/daughter or peer sibling
        if (sibLowers.size > 0 && this.settings.autoLinkSiblings !== false) {
          let listsSibAsSon = false;
          let listsSibAsDau = false;
          for (const sk of sonKeys) {
            if (linksUnderProp(c, sk).some(x => sibLowers.has(bare(x).toLowerCase()))) listsSibAsSon = true;
          }
          for (const dk of dauKeys) {
            if (linksUnderProp(c, dk).some(x => sibLowers.has(bare(x).toLowerCase()))) listsSibAsDau = true;
          }
          if (listsSibAsSon || listsSibAsDau) {
            const fg = this.getFileGender(file);
            if (fg === "male") fathers.add(file.basename);
            else if (fg === "female") mothers.add(file.basename);
            else {
              if (wifeKeys.some(k => linksUnderProp(c, k).length > 0)) fathers.add(file.basename);
              else if (husbKeys.some(k => linksUnderProp(c, k).length > 0)) mothers.add(file.basename);
              else if (mothers.has(file.basename)) {}
              else if (fathers.has(file.basename)) {}
              else if (fathers.size > 0 && !fathers.has(file.basename)) mothers.add(file.basename);
              else if (mothers.size > 0 && !mothers.has(file.basename)) fathers.add(file.basename);
              else fathers.add(file.basename);
            }
          }
          for (const bk of [...broKeys, ...sisKeys]) {
            if (linksUnderProp(c, bk).some(x => sibLowers.has(bare(x).toLowerCase()))) {
              siblings.add(file.basename);
            }
          }
        }

        // Step 3: Vault notes listing found parents as husband or wife (Blindspot 7)
        if (checkCoParents) {
          if (fatLowers.size > 0) {
            for (const hk of husbKeys) {
              if (linksUnderProp(c, hk).some(x => fatLowers.has(bare(x).toLowerCase()))) mothers.add(file.basename);
            }
          }
          if (motLowers.size > 0) {
            for (const wk of wifeKeys) {
              if (linksUnderProp(c, wk).some(x => motLowers.has(bare(x).toLowerCase()))) fathers.add(file.basename);
            }
          }
        }

        // Step 4: Vault notes listing found parents as father or mother (gather into siblings)
        if (parLowers.size > 0) {
          for (const fk of fatKeys) {
            if (linksUnderProp(c, fk).some(x => parLowers.has(bare(x).toLowerCase()))) siblings.add(file.basename);
          }
          for (const mk of motKeys) {
            if (linksUnderProp(c, mk).some(x => parLowers.has(bare(x).toLowerCase()))) siblings.add(file.basename);
          }
        }
      }

      fathers.delete(cleanP);
      mothers.delete(cleanP);

      // Mutual Exclusivity: resolve any conflict between fathers and mothers (Blindspot 11)
      for (const m of [...mothers]) {
        const mLo = bare(m).toLowerCase();
        for (const f of [...fathers]) {
          if (bare(f).toLowerCase() === mLo) {
            const fg = this.getFileGender(f);
            if (fg === "male") {
              mothers.delete(m);
            } else if (fg === "female") {
              fathers.delete(f);
            } else {
              const listedAsFather = pCache && pCache.frontmatter && fatKeys.some(k => linksUnderProp(pCache, k).some(x => bare(x).toLowerCase() === mLo));
              const listedAsMother = pCache && pCache.frontmatter && motKeys.some(k => linksUnderProp(pCache, k).some(x => bare(x).toLowerCase() === mLo));
              if (listedAsFather && !listedAsMother) {
                mothers.delete(m);
              } else if (listedAsMother && !listedAsFather) {
                fathers.delete(f);
              } else {
                // Check siblings' frontmatter for gender hints
                let sibVoteFather = 0;
                let sibVoteMother = 0;
                for (const sibName of siblings) {
                  const sFile = this.resolve(sibName);
                  if (sFile) {
                    const sc = this.app.metadataCache.getFileCache(sFile);
                    if (sc && sc.frontmatter) {
                      if (fatKeys.some(k => linksUnderProp(sc, k).some(x => bare(x).toLowerCase() === mLo))) sibVoteFather++;
                      if (motKeys.some(k => linksUnderProp(sc, k).some(x => bare(x).toLowerCase() === mLo))) sibVoteMother++;
                    }
                  }
                }
                if (sibVoteFather > sibVoteMother) {
                  mothers.delete(m);
                } else if (sibVoteMother > sibVoteFather) {
                  fathers.delete(f);
                } else if (fathers.size > mothers.size) {
                  fathers.delete(f);
                } else {
                  mothers.delete(m);
                }
              }
            }
          }
        }
      }

      for (const p of [...fathers, ...mothers]) siblings.delete(p);

      if (fathers.size === prevFathersCount && mothers.size === prevMothersCount && siblings.size === prevSiblingsCount) {
        break;
      }
    }

    const allParentNamesFinal = [...new Set([...fathers, ...mothers])];
    for (const p of allParentNamesFinal) siblings.delete(p);

    for (const f of [...fathers]) {
      if (this.isTombstoned(cleanP, f)) fathers.delete(f);
    }
    for (const m of [...mothers]) {
      if (this.isTombstoned(cleanP, m)) mothers.delete(m);
    }
    for (const s of [...siblings]) {
      if (bare(s).toLowerCase() !== pLo && this.isTombstoned(cleanP, s)) siblings.delete(s);
    }

    // Apply Cluster A reconciliation IF we have parents or multiple siblings
    if (fathers.size > 0 || mothers.size > 0 || siblings.size > 1) {
      // a) Parents as spouses:
      if (this.settings.autoLinkSpouseCoParent !== false) {
        for (const fName of fathers) {
          const fFile = this.resolve(fName);
          for (const mName of mothers) {
            const mFile = this.resolve(mName);
            if (!this.isTombstoned(fName, mName)) {
              if (fFile && (wifeKey || husbKey)) this.enqueue(fFile, wifeKey || husbKey, mName);
              if (mFile && (husbKey || wifeKey)) this.enqueue(mFile, husbKey || wifeKey, fName);
            }
          }
        }
      }

      // b) Parents <-> Children:
      for (const sibName of siblings) {
        const sibFile = this.resolve(sibName);
        const sibGender = this.getFileGender(sibFile || sibName);
        const childPropOnParent = (sibGender === "female") ? (dauKey || sonKey) : (sonKey || dauKey);

        for (const fName of fathers) {
          if (!this.isTombstoned(sibName, fName)) {
            if (sibFile && (fatKey || motKey)) this.enqueue(sibFile, fatKey || motKey, fName);
            const fFile = this.resolve(fName);
            if (fFile && childPropOnParent) this.enqueue(fFile, childPropOnParent, sibName);
          }
        }
        for (const mName of mothers) {
          if (!this.isTombstoned(sibName, mName)) {
            if (sibFile && (motKey || fatKey)) this.enqueue(sibFile, motKey || fatKey, mName);
            const mFile = this.resolve(mName);
            if (mFile && childPropOnParent) this.enqueue(mFile, childPropOnParent, sibName);
          }
        }
      }

      // c) Siblings <-> Siblings:
      if (this.settings.autoLinkSiblings !== false) {
        const sibArray = [...siblings];
        for (let i = 0; i < sibArray.length; i++) {
          for (let j = i + 1; j < sibArray.length; j++) {
            const s1 = sibArray[i];
            const s2 = sibArray[j];
            if (bare(s1).toLowerCase() === bare(s2).toLowerCase()) continue;
            if (this.isTombstoned(s1, s2)) continue;

            const f1 = this.resolve(s1);
            const f2 = this.resolve(s2);
            const g1 = this.getFileGender(f1 || s1);
            const g2 = this.getFileGender(f2 || s2);

            const propOn1 = (g2 === "female") ? (sisKey || broKey) : (broKey || sisKey);
            const propOn2 = (g1 === "female") ? (sisKey || broKey) : (broKey || sisKey);

            if (f1 && propOn1) this.enqueue(f1, propOn1, s2);
            if (f2 && propOn2) this.enqueue(f2, propOn2, s1);
          }
        }
      }
    }

    // ── CLUSTER B: When person is a PARENT (reconcile spouses and own children) ──
    const spouses = new Set();
    const children = new Set();

    if (pCache && pCache.frontmatter) {
      for (const wk of wifeKeys) linksUnderProp(pCache, wk).forEach(n => spouses.add(bare(n)));
      for (const hk of husbKeys) linksUnderProp(pCache, hk).forEach(n => spouses.add(bare(n)));
      for (const sk of sonKeys) linksUnderProp(pCache, sk).forEach(n => children.add(bare(n)));
      for (const dk of dauKeys) linksUnderProp(pCache, dk).forEach(n => children.add(bare(n)));
    }

    // Vault notes listing person as father/mother or husband/wife
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.isIncluded(file)) continue;
      const c = this.app.metadataCache.getFileCache(file);
      if (!c || !c.frontmatter) continue;

      for (const fk of fatKeys) {
        if (linksUnderProp(c, fk).some(x => bare(x).toLowerCase() === pLo)) children.add(file.basename);
      }
      for (const mk of motKeys) {
        if (linksUnderProp(c, mk).some(x => bare(x).toLowerCase() === pLo)) children.add(file.basename);
      }
      for (const wk of wifeKeys) {
        if (linksUnderProp(c, wk).some(x => bare(x).toLowerCase() === pLo)) spouses.add(file.basename);
      }
      for (const hk of husbKeys) {
        if (linksUnderProp(c, hk).some(x => bare(x).toLowerCase() === pLo)) spouses.add(file.basename);
      }
    }

    // Children from spouses & Co-parents from children (Blindspots 1 & 8)
    if (this.settings.autoLinkSpouseCoParent !== false) {
      // 1. Children from spouses (in-memory)
      for (const spName of [...spouses]) {
        if (bare(spName).toLowerCase() === pLo) continue;
        const spFile = this.resolve(spName);
        if (spFile) {
          const spCache = this.app.metadataCache.getFileCache(spFile);
          if (spCache) {
            for (const sk of sonKeys) linksUnderProp(spCache, sk).forEach(n => children.add(bare(n)));
            for (const dk of dauKeys) linksUnderProp(spCache, dk).forEach(n => children.add(bare(n)));
          }
        }
      }

      // 2. Co-parents from children (in-memory - Blindspot 1)
      for (const cName of [...children]) {
        if (bare(cName).toLowerCase() === pLo) continue;
        const cFile = this.resolve(cName);
        if (cFile) {
          const cc = this.app.metadataCache.getFileCache(cFile);
          if (cc && cc.frontmatter) {
            for (const fk of fatKeys) {
              linksUnderProp(cc, fk).forEach(p => {
                const pClean = bare(p);
                if (pClean.toLowerCase() !== pLo) spouses.add(pClean);
              });
            }
            for (const mk of motKeys) {
              linksUnderProp(cc, mk).forEach(p => {
                const pClean = bare(p);
                if (pClean.toLowerCase() !== pLo) spouses.add(pClean);
              });
            }
          }
        }
      }

      // 3. Batched Vault Scan for Cluster B (Blindspots 1 & 8)
      const spLowers = new Set([...spouses].map(s => bare(s).toLowerCase()).filter(s => s !== pLo));
      const childLowers = new Set([...children].map(c => bare(c).toLowerCase()).filter(c => c !== pLo));

      if (spLowers.size > 0 || childLowers.size > 0) {
        for (const file of this.app.vault.getMarkdownFiles()) {
          if (!this.isIncluded(file)) continue;
          const c = this.app.metadataCache.getFileCache(file);
          if (!c || !c.frontmatter) continue;

          // Notes listing spouse as father/mother -> add to children (Blindspot 8)
          if (spLowers.size > 0) {
            for (const fk of fatKeys) {
              if (linksUnderProp(c, fk).some(x => spLowers.has(bare(x).toLowerCase()))) children.add(file.basename);
            }
            for (const mk of motKeys) {
              if (linksUnderProp(c, mk).some(x => spLowers.has(bare(x).toLowerCase()))) children.add(file.basename);
            }
          }

          // Notes listing child as son/daughter -> add parent to spouses (Blindspot 1)
          if (childLowers.size > 0 && bare(file.basename).toLowerCase() !== pLo) {
            let isParentOfChild = false;
            for (const sk of sonKeys) {
              if (linksUnderProp(c, sk).some(x => childLowers.has(bare(x).toLowerCase()))) isParentOfChild = true;
            }
            for (const dk of dauKeys) {
              if (linksUnderProp(c, dk).some(x => childLowers.has(bare(x).toLowerCase()))) isParentOfChild = true;
            }
            if (isParentOfChild) {
              spouses.add(file.basename);
            }
          }
        }
      }

      for (const sp of [...spouses]) {
        if (this.isTombstoned(cleanP, sp)) spouses.delete(sp);
      }
      for (const c of [...children]) {
        if (this.isTombstoned(cleanP, c)) children.delete(c);
      }
      spouses.delete(cleanP);
      children.delete(cleanP);
    }

    // Apply Cluster B reconciliation
    if (spouses.size > 0 || children.size > 0) {
      // a) Person <-> Spouses:
      for (const spName of spouses) {
        if (bare(spName).toLowerCase() === pLo) continue;
        if (this.isTombstoned(cleanP, spName)) continue;

        const spFile = this.resolve(spName);
        const spGender = this.getFileGender(spFile || spName);

        if (pGender === "male") {
          if (pFile && (wifeKey || husbKey)) this.enqueue(pFile, wifeKey || husbKey, spName);
          if (spFile && (husbKey || wifeKey)) this.enqueue(spFile, husbKey || wifeKey, cleanP);
        } else if (pGender === "female") {
          if (pFile && (husbKey || wifeKey)) this.enqueue(pFile, husbKey || wifeKey, spName);
          if (spFile && (wifeKey || husbKey)) this.enqueue(spFile, wifeKey || husbKey, cleanP);
        } else {
          if (spGender === "female") {
            if (pFile && (wifeKey || husbKey)) this.enqueue(pFile, wifeKey || husbKey, spName);
            if (spFile && (husbKey || wifeKey)) this.enqueue(spFile, husbKey || wifeKey, cleanP);
          } else if (spGender === "male") {
            if (pFile && (husbKey || wifeKey)) this.enqueue(pFile, husbKey || wifeKey, spName);
            if (spFile && (wifeKey || husbKey)) this.enqueue(spFile, wifeKey || husbKey, cleanP);
          } else {
            if (pFile && (wifeKey || husbKey)) this.enqueue(pFile, wifeKey || husbKey, spName);
            if (spFile && (husbKey || wifeKey)) this.enqueue(spFile, husbKey || wifeKey, cleanP);
          }
        }
      }

      // b) Parents <-> Children:
      const allParentsB = [cleanP, ...spouses];
      for (const cName of children) {
        if (bare(cName).toLowerCase() === pLo) continue;
        const cFile = this.resolve(cName);
        const cGender = this.getFileGender(cFile || cName);
        const childKeyOnP = (cGender === "female") ? (dauKey || sonKey) : (sonKey || dauKey);

        for (const par of allParentsB) {
          if (this.isTombstoned(par, cName)) continue;
          const parFile = this.resolve(par);
          const parGender = this.getFileGender(parFile || par);
          const parLo = bare(par).toLowerCase();

          const cCache = cFile ? this.app.metadataCache.getFileCache(cFile) : null;
          let parKeyOnC = null;
          if (cCache && cCache.frontmatter && motKeys.some(k => linksUnderProp(cCache, k).some(x => bare(x).toLowerCase() === parLo))) {
            parKeyOnC = motKey;
          } else if (cCache && cCache.frontmatter && fatKeys.some(k => linksUnderProp(cCache, k).some(x => bare(x).toLowerCase() === parLo))) {
            parKeyOnC = fatKey;
          } else if (parGender === "female") {
            parKeyOnC = motKey || fatKey;
          } else if (parGender === "male") {
            parKeyOnC = fatKey || motKey;
          } else {
            // Unknown gender: check if other parent is known
            const otherPar = allParentsB.find(p => bare(p).toLowerCase() !== parLo);
            let otherGender = otherPar ? this.getFileGender(otherPar) : "unknown";
            if (otherGender === "unknown" && cCache && cCache.frontmatter && otherPar) {
              const otherLo = bare(otherPar).toLowerCase();
              if (fatKeys.some(k => linksUnderProp(cCache, k).some(x => bare(x).toLowerCase() === otherLo))) otherGender = "male";
              else if (motKeys.some(k => linksUnderProp(cCache, k).some(x => bare(x).toLowerCase() === otherLo))) otherGender = "female";
            }
            if (otherGender === "male") {
              parKeyOnC = motKey || fatKey;
            } else if (otherGender === "female") {
              parKeyOnC = fatKey || motKey;
            } else {
              parKeyOnC = fatKey || motKey;
            }
          }

          if (cFile && parKeyOnC) this.enqueue(cFile, parKeyOnC, par);
          if (parFile && childKeyOnP) this.enqueue(parFile, childKeyOnP, cName);
        }
      }

      // c) Children <-> Children (Siblings):
      if (this.settings.autoLinkSiblings !== false) {
        const childArr = [...children];
        for (let i = 0; i < childArr.length; i++) {
          for (let j = i + 1; j < childArr.length; j++) {
            const c1 = childArr[i];
            const c2 = childArr[j];
            if (bare(c1).toLowerCase() === bare(c2).toLowerCase()) continue;
            if (this.isTombstoned(c1, c2)) continue;

            const f1 = this.resolve(c1);
            const f2 = this.resolve(c2);
            const g1 = this.getFileGender(f1 || c1);
            const g2 = this.getFileGender(f2 || c2);

            const propOn1 = (g2 === "female") ? (sisKey || broKey) : (broKey || sisKey);
            const propOn2 = (g1 === "female") ? (sisKey || broKey) : (broKey || sisKey);

            if (f1 && propOn1) this.enqueue(f1, propOn1, c2);
            if (f2 && propOn2) this.enqueue(f2, propOn2, c1);
          }
        }
      }
    }
  }
}

module.exports = RelationsSuitePlugin;
