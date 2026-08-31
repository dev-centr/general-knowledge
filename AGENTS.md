# Agent notes — general-knowledge

Org layer: [`dev-centr/agent-rules`](https://github.com/dev-centr/agent-rules).

- Hand-authored SVGs under `docs/modules/ROOT/images/` are **source assets** (not Antora-generated). After editing them, run skill `fix-docs-encoding` (`--check` / `--fix`).
- **Page titles:** H1 must match `nav.adoc` link text; prefer no `:navtitle:`. Section landings use a linked parent (link text = H1), not `.Section` + Overview (`general/documentation.md`).
- Pushing this repo alone does **not** refresh docs.devcentr.org; the hub (`dev-centr/docs`) must redeploy to pick up new `_images/`.
- **Internet Architecture / Internet Reliability** lives under `explanation/internet-architecture/` (systems altitude). Peer nav group on the docs hub — do **not** bury under product SPE `explanation/architecture/`. HCI *Labels versus wires* + essays/demo stay the symptom ↔ diagnosis face; connectome-fs is substrate. Diagram formats on the hub: Mermaid + PlantUML via Kroki → SVG (`antora-facto` compose pack; Valentus stays lean).
