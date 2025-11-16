## MidJourney endpoints used in this project

This document catalogs the MidJourney-related HTTP endpoints that the app calls via the client helper. It focuses only on MidJourney functionality (imagine, actions, pan/zoom/outpaint, variations, inpaint/local redraw, custom zoom, edits, video, describe, blend, shorten, face swap).

### Base URL and authentication

- Base URL resolution:
  - If `MJ_SERVER` is configured in client store: requests go to `MJ_SERVER + <path>`.
  - Otherwise, requests are proxied to the app server under `/mjapi<path>`.
- Authentication header (one of):
  - `mj-api-secret: <MJ_API_SECRET>` when provided.
  - `x-ptoken: <session_token>` when user is logged in and no `MJ_API_SECRET` is present.
- Content-Type: `application/json` for JSON bodies.

Example client resolution (from `src/api/mjapi.ts`):

```ts
// getUrl(url):
// - http* → passthrough
// - MJ_SERVER set → `${MJ_SERVER}${url}`
// - fallback → `/mjapi${url}`

// headers:
// - if MJ_API_SECRET: { 'mj-api-secret': MJ_API_SECRET }
// - else if logged in: { 'x-ptoken': token }
```

### Modal/confirmation flow

Some actions require a secondary confirmation or additional parameters (e.g., final prompt, mask). The general flow is:

1) Start an action (e.g., `/mj/submit/action`)
2) If the response indicates confirmation is required or returns a `result` task id for a modal:
   - POST `/mj/submit/modal` with the modal `taskId` and required fields (e.g., `prompt`, `maskBase64`).

---

## Endpoint reference

### 1) Imagine (create from prompt)

- Method: POST
- Path: `/mj/submit/imagine`
- Purpose: Start a new MidJourney job from a text prompt (optionally referencing images).
- Request JSON:

```json
{
  "base64Array": ["<optional base64 image>", "..."],
  "notifyHook": "",
  "prompt": "<your prompt>",
  "state": "",
  "botType": "MID_JOURNEY"
}
```

- Notes:
  - To use Niji model, set `"botType": "NIJI_JOURNEY"`.

### 2) Action (buttons: pan/zoom/outpaint/variations/reroll/upsample/etc.)

- Method: POST
- Path: `/mj/submit/action`
- Purpose: Execute a button action exposed by MidJourney on an existing task result.
- Request JSON:

```json
{
  "customId": "<button customId from MJ response>",
  "taskId": "<parent task id>"
}
```

- Typical actions covered by this endpoint (via `customId`):
  - Pan: `pan_left`, `pan_right`, `pan_up`, `pan_down`
  - Variations: `:variation::1..4`, `high_variation`, `low_variation`
  - Outpaint/Zoom out: `Outpaint::50`, `Outpaint::75`, `Outpaint::100`
  - Custom Zoom: `CustomZoom::` (initiates a modal flow; see below)
  - Upscale modes: `:upsample::1..4`, `upsample_v*_2x_*`, etc.
  - Reroll: `reroll::0`

- Confirmation flow:
  - If response indicates confirmation (e.g., includes `"confirm"` in description) or returns a `result` requiring more input, follow up with `/mj/submit/modal`.

Example (pan left):

```json
{
  "customId": "pan_left::<variant specifics>",
  "taskId": "1234567890"
}
```

### 3) Change (legacy index-based actions)

- Method: POST
- Path: `/mj/submit/change`
- Purpose: Execute older style actions using `action` + `index` + `taskId`.
- Request JSON:

```json
{
  "action": ":variation::",
  "index": 1,
  "taskId": "<parent task id>"
}
```

- Notes:
  - The UI primarily uses `/mj/submit/action` now; this path exists for some older flows.

### 4) Modal (confirm or supply prompt/mask for an action)

- Method: POST
- Path: `/mj/submit/modal`
- Purpose: Provide required follow-up data for a pending modal action (e.g., final prompt, mask).
- Request JSON: depends on the preceding action. Common cases:

Custom Zoom follow-up:
```json
{
  "taskId": "<modal task id from previous response>",
  "prompt": "<custom zoom prompt>"
}
```

Inpaint/Vary (Region) follow-up:
```json
{
  "taskId": "<modal task id from previous response>",
  "maskBase64": "<base64-encoded mask>",
  "prompt": "<inpaint prompt>"
}
```

### 5) Edits (image edit with mask)

- Method: POST
- Path: `/mj/submit/edits`
- Purpose: Perform image editing with a prompt and a mask.
- Request JSON:

```json
{
  "prompt": "<edit prompt>",
  "maskBase64": "<base64-encoded mask>",
  "image": "<base64-encoded image>"
}
```

### 6) Video (image-to-video)

- Method: POST
- Path: `/mj/submit/video`
- Purpose: Generate a short video based on an image/job (exact shape depends on backend).
- Request JSON (example shape):

```json
{
  "image": "<base64-encoded image>",
  "prompt": "<optional>",
  "options": { }
}
```

### 7) Describe (image → prompt)

- Method: POST
- Path: `/mj/submit/describe`
- Purpose: Create text description(s) from image input(s).
- Request JSON (example shape):

```json
{
  "base64Array": ["<base64 image>", "..."]
}
```

### 8) Blend (multi-image blend)

- Method: POST
- Path: `/mj/submit/blend`
- Purpose: Blend multiple images according to MidJourney’s blend behavior.
- Request JSON (example shape):

```json
{
  "base64Array": ["<base64 image 1>", "<base64 image 2>", "..."],
  "options": { }
}
```

### 9) Shorten (prompt shorten)

- Method: POST
- Path: `/mj/submit/shorten`
- Purpose: Use MidJourney’s prompt shorten tooling.
- Request JSON (example shape):

```json
{
  "prompt": "<long prompt to shorten>"
}
```

### 10) Face swap

- Method: POST
- Path: `/mj/insight-face/swap`
- Purpose: Swap faces between images (service-dependent).
- Request JSON (example shape):

```json
{
  "source": "<base64 source image>",
  "target": "<base64 target image>",
  "options": { }
}
```

---

## Practical mappings from UI

- Variations (`V1..V4`), pan (`pan_*`), outpaint (`Outpaint::*`), reroll, upscale modes, and other per-image controls are initiated through `/mj/submit/action` using the `customId` supplied by MidJourney for the given button, along with the original `taskId`.
- When a control requires extra data (final prompt, mask), the server returns a modal `taskId`, and the client posts to `/mj/submit/modal` with the required fields.
- Inpaint/local redraw is implemented as: start action via `/mj/submit/action` (typically using an `:Inpaint::1` button `customId`), then submit mask + prompt via `/mj/submit/modal`.

---

## Error handling and responses

- The client expects JSON responses. When an action requires a modal, the response includes a `result` that becomes the `taskId` for `/mj/submit/modal`.
- Some responses may include a `description` indicating confirmation is required (e.g., contains the word `"confirm"`), in which case the client submits `/mj/submit/modal` with the final parameters.

---

## Headers summary

- `Content-Type: application/json`
- Authentication (one of):
  - `mj-api-secret: <MJ_API_SECRET>`
  - `x-ptoken: <session_token>`


