# Mindy RStudio CLI — Backend API Reference

## Overview

The Ruby backend API is a lightweight HTTP server that bridges the TypeScript CLI and the Google Gemini LLM.
It exposes two domain endpoints that implement the two-phase agentic editing pipeline:

```
CLI (TypeScript)
    │
    ├─ POST /resolve ──► ResolveService ──► GeminiApi ──► Gemini
    │                    (which files?)                   (picks files)
    │
    └─ POST /edit ─────► EditService ────► GeminiApi ──► Gemini
                         (how to change?)                (edits code)
```

**Stack:** Ruby 3.2+ · Roda · Puma · Faraday · Google Gemini API

---

## Base URL

```
http://localhost:9090
```

Configurable via `API_HOST` and `API_PORT` environment variables.

---

## Starting the Server

```bash
# Install dependencies (first time only)
bundle install

# Start (development)
rake run:dev

# Start (production)
rake run
```

---

## Authentication

No authentication is required for local development. The server listens on `localhost` only and uses CORS to restrict cross-origin access.

The server itself authenticates to Gemini using `GEMINI_API_KEY` loaded from `cli/.env` or a root-level `.env` file.

---

## Endpoints

### `GET /`

Health check. Confirms the server is running.

**Request**

```
GET http://localhost:9090/
```

**Response `200 OK`**

```json
{
  "status": "ok",
  "message": "Mindy RStudio CLI API",
  "version": "1.0.0"
}
```

---

### `POST /resolve`

**Phase 1 of the agentic pipeline.**

Given a natural language instruction and a list of R files with short previews, asks Gemini which files are relevant and need to be modified.

The CLI sends only file names and the first ~10 lines of each file — not the full content — so this call is fast and token-efficient.

**Request**

```
POST http://localhost:9090/resolve
Content-Type: application/json
```

| Field         | Type            | Required | Description                                      |
|---------------|-----------------|----------|--------------------------------------------------|
| `instruction` | `string`        | ✅       | Natural language description of the desired change |
| `files`       | `array<object>` | ✅       | List of workspace files with previews            |
| `files[].path`    | `string`    | ✅       | Relative file path (e.g. `"src/load_data.R"`)   |
| `files[].preview` | `string`    | ✅       | First ~10 lines of the file                     |

**Request body example**

```json
{
  "instruction": "Add error handling to all data loading functions",
  "files": [
    {
      "path": "src/load_data.R",
      "preview": "# Load raw survey data\nload_survey <- function(path) {\n  read.csv(path)\n}\n"
    },
    {
      "path": "analysis/model.R",
      "preview": "# Fit linear model\nfit_model <- function(df) {\n  lm(y ~ x, data = df)\n}\n"
    },
    {
      "path": "report.Rmd",
      "preview": "---\ntitle: 'Report'\noutput: html_document\n---\n"
    }
  ]
}
```

**Response `200 OK`**

```json
{
  "target_files": ["src/load_data.R"]
}
```

| Field          | Type            | Description                                          |
|----------------|-----------------|------------------------------------------------------|
| `target_files` | `array<string>` | Paths of files the LLM identified as needing changes |

**Response — no relevant files**

```json
{
  "target_files": []
}
```

**Error responses**

| Status | Body                                    | Cause                          |
|--------|-----------------------------------------|--------------------------------|
| `400`  | `{"error": "instruction is required"}`  | `instruction` field is missing or empty |
| `500`  | `{"error": "<error message>"}`          | Gemini API failure or server error |

---

### `POST /edit`

**Phase 2 of the agentic pipeline.**

Sends the full content of a single file plus the instruction to Gemini, and returns the complete modified file as a string.

**Request**

```
POST http://localhost:9090/edit
Content-Type: application/json
```

| Field         | Type     | Required | Description                                        |
|---------------|----------|----------|----------------------------------------------------|
| `file_path`   | `string` | ✅       | Relative file path (used as context for the LLM)  |
| `content`     | `string` | ✅       | Complete original file content (can be empty `""`) |
| `instruction` | `string` | ✅       | Natural language description of the desired change |

**Request body example**

```json
{
  "file_path": "src/load_data.R",
  "content": "load_survey <- function(path) {\n  read.csv(path)\n}\n",
  "instruction": "Add tryCatch error handling to all functions"
}
```

**Response `200 OK`**

```json
{
  "modified_content": "load_survey <- function(path) {\n  tryCatch(\n    read.csv(path),\n    error = function(e) {\n      stop(paste('Failed to load survey data:', e$message))\n    }\n  )\n}\n"
}
```

| Field             | Type     | Description                               |
|-------------------|----------|-------------------------------------------|
| `modified_content` | `string` | Complete modified file content (plain R code, no markdown fences) |

**Error responses**

| Status | Body                                                          | Cause                                        |
|--------|---------------------------------------------------------------|----------------------------------------------|
| `400`  | `{"error": "file_path and instruction are required"}`         | One or more required fields are missing      |
| `500`  | `{"error": "<error message>"}`                                | Gemini API failure or server error           |

---

## Full Request/Response Flow

```
User runs:
  mindy-cli edit "Add error handling to data loading functions"

Step 1 — FileResolver (CLI)
  Globs *.R / *.Rmd files in workspace
  Reads first 10 lines of each file
        ↓
Step 2 — POST /resolve
  Sends: { instruction, files:[{path, preview}, ...] }
  Returns: { target_files: ["src/load_data.R"] }
        ↓
Step 3 — POST /edit  (once per resolved file)
  Sends: { file_path, content, instruction }
  Returns: { modified_content: "..." }
        ↓
Step 4 — DiffEngine (CLI)
  Shows red/green diff in terminal
  Prompts: "Apply changes? [y/N]"
        ↓
Step 5 — Write (CLI)
  Writes modified_content to disk if confirmed
```

---

## Environment Variables

| Variable        | Required | Default             | Description                         |
|-----------------|----------|---------------------|-------------------------------------|
| `GEMINI_API_KEY`| ✅       | —                   | Google Gemini API key               |
| `LLM_MODEL`     | ❌       | `gemini-2.5-flash`  | Gemini model name                   |
| `LLM_MAX_TOKENS`| ❌       | `8192`              | Maximum tokens in LLM response      |
| `LLM_TIMEOUT`   | ❌       | `90`                | Request timeout in seconds          |
| `API_HOST`      | ❌       | `localhost`         | Host the CLI connects to            |
| `API_PORT`      | ❌       | `9090`              | Port the CLI connects to            |

Variables are loaded automatically from `cli/.env` (fallback) or a root-level `.env` file.

---

## Error Handling

All endpoints return JSON error bodies with an `error` key:

```json
{ "error": "human-readable error message" }
```

| HTTP Status | Meaning                                              |
|-------------|------------------------------------------------------|
| `200`       | Success                                              |
| `400`       | Bad request — missing or invalid input fields        |
| `500`       | Server error — Gemini API failure, network issue, etc. |

If `GEMINI_API_KEY` is missing, the server will raise on startup:
```
GEMINI_API_KEY is not set. Add it to your .env or cli/.env file.
```

---

## cURL Examples

```bash
# Health check
curl http://localhost:9090/

# POST /resolve
curl -s -X POST http://localhost:9090/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "instruction": "Add error handling to data loading",
    "files": [
      { "path": "load_data.R", "preview": "load <- function(p) read.csv(p)" }
    ]
  }' | jq .

# POST /edit
curl -s -X POST http://localhost:9090/edit \
  -H "Content-Type: application/json" \
  -d '{
    "file_path": "load_data.R",
    "content": "load <- function(p) read.csv(p)",
    "instruction": "Add tryCatch error handling"
  }' | jq .
```

---

## Architecture Notes

### Why two phases?

Sending all file contents to the LLM in one shot is expensive and slow.
Phase 1 (`/resolve`) uses only file names + 10-line previews to identify the 1–2 relevant files.
Phase 2 (`/edit`) sends only those files' full content.
This keeps token usage minimal and response times fast.

### Prompt design

- **ResolveService** instructs Gemini to return a JSON array only — no prose.
  The response is parsed with a regex fallback (`/\[[\s\S]*?\]/`) to handle any stray text.
- **EditService** instructs Gemini to return raw R code only — no markdown fences.
  A `strip_code_fences` post-processor removes fences in case Gemini ignores the instruction.

### Source files

| File | Responsibility |
|------|---------------|
| [app.rb](../app/application/controllers/app.rb) | Roda router — validates input, calls services, returns JSON |
| [resolve_service.rb](../app/application/services/resolve_service.rb) | Builds resolve prompt, calls Gemini, parses file list |
| [edit_service.rb](../app/application/services/edit_service.rb) | Builds edit prompt, calls Gemini, strips code fences |
| [gemini_api.rb](../app/infrastructure/gateways/gemini_api.rb) | HTTP client for Google Gemini REST API |
| [config/environment.rb](../config/environment.rb) | Loads `.env`, requires all app files |
| [config.ru](../config.ru) | Rack entry point + CORS middleware |
