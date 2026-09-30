# Obsidian Relations Suite

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/vishwasupponi/relations-suite/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.4.0%2B-purple.svg)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Relations Suite** is an all-in-one Obsidian plugin bringing together bi-directional relationship synchronization, an interactive family tree visualizer, and an interactive connection path graph into a single, unified experience.

---

## ✨ Features

### 1. 🔄 Bi-Directional Relation Sync
- **Automatic Reciprocal Linking:** When you add a relationship in a note's frontmatter (YAML), the reciprocal link is automatically updated on the related note.
- **Family Logic:** Automatically pairs Father/Mother with Son/Daughter based on gender, connects Spouses, and optionally auto-links full/half-siblings and co-parents.
- **Custom Relations:** Define your own symmetric or inverse relationship pairs (e.g. Mentor ↔ Mentee, Friend ↔ Friend).
- **Scope Control:** Choose specific folders to monitor, leaving the rest of your vault untouched.

### 2. 🌳 Interactive Family Tree
- **Generational Canvas:** Visualize multi-generational family trees dynamically generated from your notes' metadata.
- **Collapsible Lineages:** Expand or collapse branches with smooth animations to focus on specific bloodlines.
- **Clean Connections:** Distinct, color-coded lineage paths, clean marriage bridges, and straight vertical child drops.
- **Adaptive Cards:** Person cards dynamically scale to fit names without unsightly truncation ellipses (`...`).
- **Interactive Controls:** Zoom, pan, search for ancestors/descendants, and click any card to instantly open the corresponding note.

### 3. 🕸️ Relations Graph & Path Tracer
- **Visual Network:** Explore relationships across your vault as an interactive force-directed graph.
- **Shortest Path Finder:** Select any two individuals to calculate and visually illuminate the shortest relationship path connecting them.
- **Live Filtering:** Filter nodes by property values with instant autocomplete search.

### 4. ⚙️ Unified Settings
- Single, organized settings tab with zero redundancy.
- Shared relationship property keys across both the sync engine and visualizers.
- Live autocomplete dropdowns for selecting properties and filter values.

---

## 📥 Installation

### Method 1: Manual Installation (Recommended)
1. Download the latest release assets (`manifest.json`, `main.js`, and `styles.css`) from the [Releases](https://github.com/vishwasupponi/relations-suite/releases) page.
2. In your Obsidian vault, navigate to:
   ```
   <Your-Vault>/.obsidian/plugins/
   ```
3. Create a new folder named `relations_suite`.
4. Copy `manifest.json`, `main.js`, and `styles.css` into that folder:
   ```
   .obsidian/plugins/relations_suite/
   ├── manifest.json
   ├── main.js
   └── styles.css
   ```
5. In Obsidian, go to **Settings → Community plugins**, click **Reload plugins**, and toggle on **Relations Suite**.

### Method 2: Via BRAT (Beta Reviewers Auto-update Tester)
1. Install and enable the **BRAT** plugin from Obsidian Community Plugins.
2. Open BRAT settings and click **Add Beta plugin**.
3. Enter `vishwasupponi/relations-suite`.

---

## 🚀 Quick Start

1. **Configure Properties:** Go to **Settings → Relations Suite** and verify your relationship property names (e.g., `father`, `mother`, `spouse`, `children`).
2. **Open Family Tree:** Press `Ctrl + P` (or `Cmd + P` on Mac), search for:
   > `Relations Suite: Open Family Tree View`
3. **Open Relations Graph:** Open the command palette and search for:
   > `Relations Suite: Open Relations Graph View`

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — created by **Vishwas Upponi** ([@vishwasupponi](https://github.com/vishwasupponi)).
