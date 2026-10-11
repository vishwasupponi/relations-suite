# Obsidian Relations Suite

[![Latest Release](https://img.shields.io/github/v/release/vishwasupponi/relations-suite?color=3b82f6&label=Version)](https://github.com/vishwasupponi/relations-suite/releases/latest)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.4.0%2B-7C3AED.svg)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981.svg)](LICENSE)

> [!NOTE]
> **Safe & Non-Destructive**:
> - **Visualizers (Family Tree & Graph)** operate strictly at the UI display level and **never modify, edit, or write to any files**.
> - **Sync Engine** only writes reciprocal links in YAML frontmatter when you edit relationships, and **never alters note bodies or text content**.

**Relations Suite** is an all-in-one Obsidian plugin bringing together bi-directional relationship synchronization, an interactive family tree visualizer, and an interactive connection path graph into a single, unified experience, allowing you to trace and find the shortest relationship path between any two people.

---

## ✨ Features

### 1. 🔄 Bi-Directional Relation Sync
- **Automatic Reciprocal Linking:** When you add a relationship in a note's frontmatter (YAML), the reciprocal link is automatically updated on the related note.
- **Family Logic:** Automatically pairs Father/Mother with Son/Daughter based on gender, connects Spouses, and auto-links full/half-siblings and co-parents.
- **Custom Relations:** Define your own symmetric or inverse relationship pairs (e.g., Mentor ↔ Mentee, Friend ↔ Friend).
- **Scope Control:** Choose specific folders to monitor, leaving the rest of your vault untouched.

### 2. 🌳 Interactive Family Tree
- **Generational Canvas:** Visualize multi-generational family trees dynamically generated from your notes' metadata.
- **Collapsible Lineages:** Expand or collapse branches with smooth animations to focus on specific bloodlines.
- **Clean Connections:** Distinct, color-coded lineage paths, clean marriage bridges, and straight vertical child drops.
- **Adaptive Cards:** Person cards dynamically scale to fit names.
- **Interactive Controls:** Zoom, pan, search for ancestors/descendants, and click any card to instantly open the corresponding note.

### 3. 🕸️ Relations Graph & Path Tracer
- **Visual Network:** Explore relationships across your vault as an interactive graph.
- **Shortest Path Finder:** Select any two individuals to calculate and visually illuminate the shortest relationship path connecting them.
- **Live Filtering:** Filter nodes by property values with instant autocomplete search.

---

## 🚀 Installation

### Method 1: Via BRAT (Recommended for Beta Testing)
1. Install and enable the **BRAT** (Beta Reviewers Auto-update Tester) plugin from Obsidian Community Plugins.
2. Open BRAT settings and click **Add Beta plugin**.
3. Enter `vishwasupponi/relations-suite`.
4. Click **Add Plugin** and enable **Relations Suite** in **Settings → Community plugins**.

### Method 2: Manual Installation
1. Download the latest release assets (`manifest.json`, `main.js`, and `styles.css`) from the [Latest Release](https://github.com/vishwasupponi/relations-suite/releases/latest).
2. Inside your Obsidian vault, navigate to:
   ```
   <Your-Vault>/.obsidian/plugins/
   ```
3. Create a folder named `relations-suite`.
4. Copy `manifest.json`, `main.js`, and `styles.css` into that folder:
   ```
   .obsidian/plugins/relations-suite/
   ├── manifest.json
   ├── main.js
   └── styles.css
   ```
5. In Obsidian, go to **Settings → Community plugins**, click **Reload plugins**, and enable **Relations Suite**.

---

## ⚡ Quick Start

Get up and running with Relations Suite in 4 simple steps:

### 1. Tag a Relationship in Any Note
Open or create a note (e.g. `Alice.md`) and add a family property to its YAML frontmatter:
```yaml
---
father: "[[John]]"
gender: female
---
```

### 2. Experience Instant Reciprocal Sync
Open `John.md`. The plugin automatically creates the reciprocal link without you typing it:
```yaml
---
daughter: "[[Alice]]"
gender: male
---
```
*(Similarly, adding a brother or sister automatically links shared parents and reciprocal sibling connections across the whole family unit.)*

### 3. Open the Family Tree Viewer
- **From the Ribbon / Sidebar**: Click the **Family Tree** icon (`git-pull-request`) in Obsidian's left ribbon.
- **Or via Command Palette**: Press `Ctrl + P` (or `Cmd + P` on macOS) and run:
  > `Relations Suite: Open Family Tree Viewer`
- Select your root family member or base note.
- Pan, zoom, and expand or collapse branches dynamically on the interactive canvas.
- *(Optional)* Drag the tab header into either the left or right sidebar to keep the tree docked while editing notes.

### 4. Trace Relationship Paths
- **From the Ribbon / Sidebar**: Click the **Graph** icon (`git-fork`) in Obsidian's left ribbon.
- **Or via Command Palette**: Press `Ctrl + P` (or `Cmd + P` on macOS) and run:
  > `Relations Suite: Open Relationship Path Graph`
- Enter **Person A** and **Person B** in the top bar.
- Click **Find Path** to illuminate the shortest connection path between them across your entire vault, or cycle through alternative paths using the stepper.
- *(Optional)* Drag the graph tab into a sidebar pane to keep it open side-by-side with your active note.

---

## ⚙️ Settings Reference

Customize the plugin's behavior by going to **Settings → Relations Suite**:

### 📁 Vault Scope & Exclusions
- **Included Folders**: Restrict automatic syncing and graph generation to specific folders (e.g., `People/` or `Family/`). Notes outside these folders remain untouched unless they explicitly contain relationship properties.
- **Exclusion Filters**:
  - **Exclude Property & Value**: Filter out non-person notes (such as `type: Place` or `category: Organization`) so they never render as family cards or graph nodes.
  - **Excluded Values**: Comma-separated note names (e.g., `Template`, `Folder Note`) to completely ignore vault-wide.

### 👥 Family Property Mapping
- **Custom Property Keys**: Configure the exact frontmatter property names your vault uses for nuclear family members:
  - `Father` / `Mother` (e.g., `father`)
  - `Husband` / `Wife` (e.g., `husband`)
  - `Son` / `Daughter` (e.g., `son`)
  - `Brother` / `Sister` (e.g., `brother`)
- **Gender Recognition**: Specify the property name (e.g., `gender`) and values (e.g., `male`, `female`, `m`, `f`) used to automatically determine whether to assign *Son vs. Daughter* or *Brother vs. Sister*.

> [!TIP]
> **Gender-Neutral & Shared Properties**: If your vault does not differentiate by gender, you can enter the same property name in both fields (e.g., `spouse` for both Husband & Wife, `children` for Son & Daughter, and `siblings` for Brother & Sister). Both the sync engine and visualizers handle shared properties seamlessly.

### 🔗 Custom Bi-Directional Pairs
Create custom reciprocal relationship rules outside the traditional family structure:
- **Forward & Inverse Keys**: Define symmetric pairs (e.g. `friend` ↔ `friend`) or asymmetric pairs (e.g. `mentor` ↔ `mentee`, `manager` ↔ `direct-report`).
- When you link someone under the Forward property, the plugin automatically populates the Inverse property on the target note.

### 🎨 Visualizer Display Options
- **Card Properties**: Select which additional frontmatter fields (e.g., `birth`, `death`, `occupation`) display directly on Family Tree cards.
- **Graph Clustering**: Adjust force-directed layout settings to suit larger or more compact vaults.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

Developed by [Vishwas Upponi](https://github.com/vishwasupponi).
