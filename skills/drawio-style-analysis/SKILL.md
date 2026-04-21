---
name: drawio-style-analysis
version: 1.0.0
triggers:
  - summarize drawio
  - analyze drawio
  - drawio style
  - drawio diagram style
  - 循序圖風格
  - 總結 drawio
  - 分析 drawio
  - drawio 繪畫風格
  - diagram drawing style
  - sequence diagram style
categories:
  - documentation
  - diagram-analysis
  - architecture
description: Reads a .drawio file and produces a structured summary of its visual drawing style — color coding, node shapes, lifeline conventions, arrow types, annotation patterns, and layout logic. Use when user asks to "summarize", "analyze", or "describe the style" of a .drawio diagram, or mentions "drawio 繪畫風格" / "循序圖風格".
---

# DrawIO Style Analysis Skill

Produces a **structured, human-readable summary** of a `.drawio` file's visual language — covering color semantics, node anatomy, sequence diagram conventions, annotation patterns, and page-level layout logic.

## Instructions

### Step 1: Read the File

Read the full XML content of the target `.drawio` file provided by the user.

- The file is standard XML with `<mxfile>` → `<diagram>` → `<mxGraphModel>` → `<root>` → `<mxCell>` elements.
- Each `<diagram>` is one page/tab.
- Note how many pages exist and their `name` attributes — page order often encodes narrative (e.g. AS-IS → TO-BE).

### Step 2: Inventory Structural Elements

For each page, extract and categorize:

| Element type | Where to look |
|---|---|
| Background regions | `mxCell` with large `mxGeometry` + fill/stroke, usually labeled with a section name |
| Actor / participant nodes | `mxCell` with `vertex="1"` and `rounded=1` or `ellipse`, positioned at the top |
| Lifelines | `mxCell` with `edge="1"`, `endArrow=none`, `dashed=1`, vertical geometry |
| Synchronous calls | `edge="1"`, `endArrow=block`, `endFill=1` |
| Return / async | `edge="1"`, `endArrow=open`, `endFill=0`, `dashed=1` |
| Annotations / notes | `mxCell` with `vertex="1"`, large `mxGeometry`, `align=left`, often multi-line |
| Decision shapes | `mxCell` with `rhombus` style |
| Section labels | Small `mxCell` nodes with colored background acting as badges |

### Step 3: Decode the Color System

Map each unique `fillColor` / `strokeColor` combination to its semantic role.

**Pattern to follow:**
```
| fillColor | strokeColor | Semantic meaning |
|-----------|-------------|-----------------|
| #E0E7FF   | #6366F1     | User / Shell boundary |
| #F0FDF4   | #16A34A     | Presentation layer (CLI adapters) |
| ...       | ...         | ...             |
```

Check consistency: does the same color appear across all pages for the same role? Note any exceptions.

### Step 4: Analyze Sequence Diagram Conventions

For sequence diagrams specifically, document:

- **Lifeline style**: color, dashed vs solid, whether they terminate or extend to page bottom
- **Synchronous call arrows**: stroke color, label font weight (`fontStyle=1` = bold), label content pattern
- **Return arrows**: visual distinction from calls (open arrowhead + dashed)
- **Key call highlighting**: how the diagram marks "primary" vs "secondary" messages (e.g. `fontStyle=1` on critical messages)
- **Section badges**: small colored pill labels (e.g. ① ② ③) used to group related message sequences
- **Divider lines**: horizontal separators between regions (e.g. CLI zone vs TUI zone)

### Step 5: Catalog Annotation Styles

Identify how the author conveys explanatory content:

- **Warning boxes**: color, icon prefix (e.g. `⚠`), border color
- **Summary boxes**: color, icon prefix (e.g. `⚡`, `✓`, `✦`), text alignment
- **Code / diff blocks**: font family (`Courier New`), use of `─` / `+` for diff notation
- **Verdict / conclusion banners**: font size, border color, position on page

### Step 6: Describe Page-Level Layout Logic

For each page:

- How is the canvas divided? (horizontal zones, vertical timelines, diagonal flow)
- What goes in headers vs footers?
- How does the page title relate to the diagram's narrative?
- If multiple pages: what progression do they represent (e.g. AS-IS → TO-BE → trade-off comparison)?

### Step 7: Produce the Summary

Output a structured markdown summary with these sections:

```markdown
## 整體結構
[Number of pages, their names, narrative progression]

## 色彩編碼系統（語意一致）
[Table: color → semantic role, consistent across pages?]

## 循序圖慣例
[Lifeline style, call vs return arrows, key call highlighting]

## 標注風格細節
[Warning boxes, summary boxes, code diff format, verdict banners]

## 版面邏輯
[Per-page layout description, canvas divisions, header/footer pattern]
```

Use a **table** for the color system. Use **bullet points** under each convention. Keep each section concise — one paragraph or a short list is enough.

## Common Issues

### Issue: File has no readable text — only binary/encoded content
**Cause:** WebFetch rendered the raw PDF/binary stream instead of the XML.
**Solution:** Use the `Read` tool directly on the `.drawio` file path. DrawIO files are plain XML and can be read as text.

### Issue: Too many mxCell elements to process
**Cause:** Large diagrams with hundreds of cells.
**Solution:** Focus on cells with `vertex="1"` for nodes, and group edge cells by `strokeColor` to identify color roles without reading every edge individually.

### Issue: Color codes appear only in some cells
**Cause:** Cells may inherit style from parent or use default draw.io styles.
**Solution:** When `fillColor` is absent, note "uses default style" and observe the visual pattern from cells that do have explicit colors.

## Examples

### Example 1: Sequence diagram with CLI/TUI zones

User says: "請你總結這個循序圖的繪畫風格"

Actions:
1. Read the `.drawio` file via `Read` tool
2. Count pages and note their names (`AS-IS`, `TO-BE Option B`, `TO-BE Option A`)
3. Extract unique `fillColor`/`strokeColor` pairs and map to roles
4. Identify lifeline cells (vertical dashed edges with `endArrow=none`)
5. Classify arrows by arrowhead type
6. Find annotation boxes (large `align=left` vertex cells)
7. Output structured summary with color table + convention bullets

Result: Structured markdown covering color system, arrow conventions, annotation styles, and layout logic per page.

### Example 2: Single-page architecture diagram

User says: "analyze the drawing style of diagram.drawio"

Actions:
1. Read file, note single page
2. Map colors to layer roles (domain / application / infrastructure / presentation)
3. Identify node shape conventions (rounded vs sharp corners per layer)
4. Note arrow direction patterns (dependency arrows pointing inward)
5. Output summary focusing on layer-color mapping and dependency arrow conventions
