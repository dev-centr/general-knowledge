# Agent notes — general-knowledge

Org layer: [`dev-centr/agent-rules`](https://github.com/dev-centr/agent-rules).

- Hand-authored SVGs under `docs/modules/ROOT/images/` are **source assets** (not Antora-generated). After editing them, run skill `fix-docs-encoding` (`--check` / `--fix`).
- Pushing this repo alone does **not** refresh docs.devcentr.org; the hub (`dev-centr/docs`) must redeploy to pick up new `_images/`.
