# Changelog

## Unreleased — CLI command regrouping

### BREAKING CHANGES

Top-level commands have been reorganised to reflect a cleaner mental model.
Primary pipelines (`agent`, `ask`) and the cross-session resource (`knowledge`)
remain at the top level. Everything else is nested under a semantic group.

#### Commands moved or removed

| Old path | New path | Notes |
|---|---|---|
| `mindy-cli rollback [n]` | `mindy-cli agent rollback [n]` | Rollback operates on agent session state |
| `mindy-cli run [code]` | `mindy-cli r run [code]` | R execution utilities grouped under `r` |
| `mindy-cli install <pkg...>` | `mindy-cli r install <pkg...>` | R package management grouped under `r` |
| `mindy-cli context [opts]` | `mindy-cli r context [opts]` | R environment debug tool grouped under `r` |
| `mindy-cli plugins list` | `mindy-cli config plugins list` | Low-frequency diagnostic moved under `config` |
| `mindy-cli plugins dir` | `mindy-cli config plugins dir` | Low-frequency diagnostic moved under `config` |
| `mindy-cli scan` | *(removed)* | Use `mindy-cli ask "scan this project"` or let the agent call `file_scan` automatically |
| `mindy-cli library` | *(removed)* | Use `mindy-cli ask "list installed packages"` or agent tool `library_scan` |

#### Commands unchanged

| Command | Notes |
|---|---|
| `mindy-cli agent "..."` | Primary pipeline — unchanged |
| `mindy-cli ask "..."` | Primary pipeline — unchanged |
| `mindy-cli knowledge ...` | Cross-session memory — unchanged |

#### Aliases removed

`mindy-cli lib` and `mindy-cli packages` (aliases for `library`) are removed
along with the `library` command itself.

`mindy-cli ctx` and `mindy-cli prompt` (aliases for `context`) now resolve to
`mindy-cli r context` — the Commander command object retains these aliases.
