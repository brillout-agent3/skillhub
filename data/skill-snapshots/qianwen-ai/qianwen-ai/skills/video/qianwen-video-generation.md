---
name: qianwen-video-generation
description: "Generate videos using Wan and HappyHorse models. Supports text-to-video, image-to-video, first+last frame, reference-based role-play, and video editing (VACE). TRIGGER when: user wants to create, generate, or edit video content, mentions video generation/animation/video clips/Wan/HappyHorse models, or explicitly invokes this skill by name (e.g. use qianwen-video-generation). DO NOT TRIGGER when: user wants to generate images (use qianwen-image-generation), understand/analyze existing videos (use qianwen-vision), text-only tasks."
compatibility: "Requires Python 3.9+ and curl. Cursor: auto-loaded. Claude Code: read this skill's SKILL.md before first use."
---

# Qwen Video Generation

Generate videos using Wan and HappyHorse models. All tasks are **asynchronous** — submit, then poll until
completion.
This skill is part of **QianWen-AI/qianwen-ai**.

> **⚠️ Critical Parameter Differences:**
> - **kf2v (First+Last Frame)**: Duration is **fixed at 5 seconds** — other values will fail. Output is **silent only**.
> - **Resolution parameters vary by model family, not mode alone**: Check the current model catalog before choosing `size`, `resolution`, or `ratio`. For example, `happyhorse-1.1-t2v` uses `resolution` + `ratio`, while `wan2.6-t2v` uses `size`.

## Skill directory

Use this skill's internal files to execute and learn. Load reference files on demand when the default path fails or you need details.

| Location | Purpose |
|----------|---------|
| `scripts/video.py` | Default execution — mode auto-detect, submit, poll, download |
| `references/execution-guide.md` | Fallback: curl for all 5 modes, code generation |
| `references/request-fields.md` | Field tables and audio handling by mode |
| `references/workflows.md` | Duration extensions, multi-shot, VACE pipelines |
| `references/polling-guide.md` | Polling patterns and timing |
| `references/merge-media.md` | Concat, trim, audio overlay — ffmpeg/moviepy recipes |
| `references/prompt-guide.md` | Per-mode prompt formulas, sound description, multi-shot structure |
| `references/examples.md` | Full script examples per mode |
| `references/sources.md` | Official documentation URLs |

## Security

**NEVER output any API key or credential in plaintext.** Always use variable references (`$DASHSCOPE_API_KEY` in shell, `os.environ["DASHSCOPE_API_KEY"]` in Python). Any check or detection of credentials must be **non-plaintext**: report only status (e.g. "set" / "not set", "valid" / "invalid"), never the value. Never display contents of `.env` or config files that may contain secrets.

**When the API key is not configured, NEVER ask the user to provide it directly.** Instead, help create a `.env` file with a placeholder (`DASHSCOPE_API_KEY=sk-your-key-here`) and instruct the user to replace it with their actual key from the [QianWen Console](https://platform.qianwenai.com/home/api-keys). Only write the actual key value if the user explicitly requests it.

## Key Compatibility

Both PAYG (`sk-ws-...`; legacy `sk-...`) and Token Plan (`sk-sp-...`) keys are supported. Detect
the API key type without exposing the Key:

```bash
python3 -c "
import sys; sys.path.insert(0, 'scripts')
from qianwen_lib import detect_api_key_type
print(detect_api_key_type('scripts/qianwen_lib.py'))
"
```

| Output | Meaning |
|--------|---------|
| `token-plan` | Token Plan key — use only models from the Token Plan catalog below. |
| `payg` | Pay-as-you-go key — full model catalog available. |
| `not-set` | No key configured. |

For Token Plan, fetch and read the current [Token Plan model catalog](https://alioth.alicdn.com/skills-info/models/references/qianwen-token-plan-models.md), then use an exact listed model. If CDN access fails, use the [local fallback](cdn/references/qianwen-token-plan-models.md).

Token Plan does not support local file upload; for i2v/r2v/kf2v modes, provide reference images/videos
as accessible URLs (`https://` or `oss://`) rather than local paths.

Token Plan supports only specific models — use exactly a model from the references above; do not
guess or probe model availability. For PAYG, continue below.

## Mode Selection Guide

| User Want | Mode | Key Field |
|-----------|------|------------|
| Generate video from text description only | **t2v** | `prompt` only |
| Animate a single image | **i2v** | `img_url` or `reference_image` |
| wan2.7 unified i2v: first frame, first+last frame, video continuation, audio sync | **i2v** | `media[]`, `first_frame_url`, `first_clip_url`, `driving_audio_url` |
| Transition between two images (**⚠️ 5s fixed, silent only**) | **kf2v** | `first_frame_url` + `last_frame_url` |
| Role-play: make characters act a new script | **r2v** | `reference_urls` or `media`; read the CDN model catalog for model-specific limits |
| Video editing: multi-image ref, repainting, local edit, extend, outpaint | **vace** | `function`; read the CDN model catalog for the current default |
| Video editing (no `function` field, uses media array) | **videoedit** | `model`; read the CDN model catalog for supported models |

### Model Selection

1. **User specified a model** → use directly.
2. **Consult the qianwen-model-selector skill** when model choice depends on capability, scenario, or pricing.

Before selecting, recommending, or defaulting a model, fetch and read the current [Qwen video-generation model catalog](https://alioth.alicdn.com/skills-info/models/references/qianwen-video-generation-models.md). It contains the model list, basic model information, mode recommendations, compatibility notes, and defaults. If CDN access fails, use the [local fallback](cdn/references/qianwen-video-generation-models.md).

Endpoint: `/services/aigc/video-generation/video-synthesis`.

> **⚠️ Important**: The model list above is a **point-in-time snapshot** and may be outdated. Model availability
> changes frequently. **Always check the [official model list](https://www.qianwenai.com/models)
> for the authoritative, up-to-date catalog before making model decisions.**

> **Model details**: For more information about a specific model, direct the user to `https://www.qianwenai.com/models/<model-name>`. Replace `<model-name>` with the exact model ID; never modify or guess it.

> **Dynamic model queries**: If the **qianwen-model-selector** skill or **QianWen CLI** (`qianwen models info <model>`) is available, use it for real-time model data. CLI requires authentication — see the **qianwen-usage** skill for login flow.

## Execution

> **⚠️ Multiple artifacts**: When generating multiple files in a single session, you MUST append a numeric suffix to each filename (e.g. `out_1.mp4`, `out_2.mp4`) to prevent overwrites.

### Prerequisites

- **API Key**: Use the non-plaintext detector in **Key Compatibility**; do not replace it with a
  variable-presence check. If no Key is found, use qianwen-ops-auth when available or guide the user
  to configure `DASHSCOPE_API_KEY`/`QIANWEN_API_KEY` in `.env`. Skills may be installed independently.
- Python 3.9+ (stdlib only, **no pip install needed**)
- For media merging (concat, trim, audio overlay): see [merge-media.md](references/merge-media.md) for ffmpeg/moviepy recipes suited to the user's environment

### Environment Check

Before first execution, verify Python is available:

```bash
python3 --version  # must be 3.9+
```

If `python3` is not found, try `python --version` or `py -3 --version`. If Python is unavailable or below 3.9, skip to **Path 2 (curl)** in [execution-guide.md](references/execution-guide.md).

### Default: Run Script

**Script path**: Scripts are in the `scripts/` subdirectory **of this skill's directory** (the directory containing this SKILL.md). **You MUST first locate this skill's installation directory, then ALWAYS use the full absolute path to execute scripts.** Do NOT assume scripts are in the current working directory. Do NOT use `cd` to switch directories before execution.

**Execution note:** Run all scripts in the **foreground** — wait for stdout; do not background.

**Discovery:** Run `python3 <this-skill-dir>/scripts/video.py --help` first to see all available arguments.

```bash
python3 <this-skill-dir>/scripts/video.py \
  --request '{"model":"happyhorse-1.1-t2v","prompt":"A detective in a rainy city at night","resolution":"720P","ratio":"16:9","duration":5}' \
  --print-response
```

| Argument | Description |
|----------|-------------|
| `--request '{...}'` | JSON request body |
| `--file path.json` | Load request from file |
| `--mode MODE` | Override auto-detected mode (t2v/i2v/kf2v/r2v/vace) |
| `--model ID` | Override model |
| `--output path` | Directory or file path. If path ends with a video extension (.mp4/.mov/.webm/.mkv/.m4v etc.), it is used as the output filename (parent dir auto-created). Otherwise treated as directory — video is auto-named from the OSS URL basename, preventing overwrites across runs; use distinct filenames across calls to avoid overwriting response data |
| `--print-response` | Print response JSON to stdout |
| `--submit-only` | Submit and exit (print task_id) |
| `--task-id ID` | Operate on existing task |
| `--poll-interval N` | Seconds between polls (default: 15) |
| `--timeout N` | Max wait seconds (default: 600) |

> **Model priority**: `--model` CLI flag > `"model"` field in `--request` JSON > configured default. The configured default is used when no model is specified and is not necessarily the newest or strongest model.

### Verify Result

- Exit code `0` + response has `output.task_id` → **submission success**
- Poll reaches `task_status: SUCCEEDED` → **generation complete**
- Non-zero exit, HTTP error, or `FAILED` status → **fail**
- **Post-execution check**: Verify the output video file exists and has non-zero size (`ls -la <output_dir>`)
- **MANDATORY — stderr signal check**: After confirming the result, scan the command's stderr output for `[ACTION_REQUIRED]` or `[UPDATE_AVAILABLE]`. If either signal is present, you **MUST** follow the instructions in [Update Check](#update-check-mandatory-post-execution) below before responding to the user.

### On Failure

If the script fails, match the error output against the diagnostic table below to determine the resolution. If no match, read [execution-guide.md](references/execution-guide.md) for alternative paths: curl commands (Path 2 — all 5 modes), code generation (Path 3), and autonomous resolution (Path 5).

**If Python is not available at all** → skip directly to Path 2 (curl) in [execution-guide.md](references/execution-guide.md).

| Error Pattern | Diagnosis | Resolution |
|---------------|-----------|------------|
| `command not found: python3` | Python not on PATH | Try `python` or `py -3`; install Python 3.9+ if missing |
| `Python 3.9+ required` | Script version check failed | Upgrade Python to 3.9+ |
| `SyntaxError` near type hints | Python < 3.9 | Upgrade Python to 3.9+ |
| `QIANWEN_API_KEY/DASHSCOPE_API_KEY not found` | Missing API key | Obtain key from [QianWen Console](https://platform.qianwenai.com/home/api-keys); add to `.env`: `echo 'DASHSCOPE_API_KEY=sk-...' >> .env`; or run **qianwen-ops-auth** if available |
| `HTTP 401` | Invalid or mismatched key | Run **qianwen-ops-auth** (non-plaintext check only); verify key is valid |
| `SSL: CERTIFICATE_VERIFY_FAILED` | SSL cert issue (proxy/corporate) | macOS: run `Install Certificates.command`; else set `SSL_CERT_FILE` env var |
| `URLError` / `ConnectionError` | Network unreachable | Check internet; set `HTTPS_PROXY` if behind proxy |
| `HTTP 429` | Rate limited | Wait and retry with backoff |
| `HTTP 5xx` | Server error | Retry with backoff |
| `ImportError: moviepy` | moviepy not installed | `pip install moviepy`, or use system ffmpeg instead (see [merge-media.md](references/merge-media.md)) |
| `PermissionError` | Can't write output | Use `--output` to specify writable directory |

## Request Fields Summary

All modes require `prompt`. See [request-fields.md](references/request-fields.md) for full field tables per mode.

### ⚠️ Resolution Parameters by Model Family (Critical)

The resolution field varies by model family. Check the model catalog above before choosing between `size`, `resolution`, and `ratio`; using the wrong field can cause the API call to fail.

### Mode-Specific Required Fields

- Required fields vary by model family. Use [request-fields.md](references/request-fields.md) for payload shapes and the model catalog above for current model-specific compatibility.

## Cost Estimation

> 🚨 **NEVER guess or fabricate any price figure.** Always direct the user to the
> [official pricing page](https://platform.qianwenai.com/docs/developer-guides/getting-started/pricing) for exact rates.

Cost is billed per second of generated video. Price varies by model and resolution. Fetch the [CDN model-pricing reference](https://alioth.alicdn.com/skills-info/models/references/qianwen-model-pricing.md), and use the official pricing page for exact current rates. Some models may offer a limited free quota — **do not assume any call is free**; use the **qianwen-usage** skill to check remaining free tier quota, or verify in the user's [QianWen console](https://platform.qianwenai.com/home/benefits). If CDN access fails, use the [local fallback](cdn/references/qianwen-model-pricing.md).

To check actual usage and bills: use the **qianwen-usage** skill, or visit the console:
[Usage Analytics](https://platform.qianwenai.com/home/analytics) |
[Pay-as-you-go Billing](https://platform.qianwenai.com/home/billing/pay-as-you-go) |
[Token Plan Subscription](https://platform.qianwenai.com/home/billing/subscription/token-plan)

> **NEVER fabricate, guess, or construct usage/billing/console URLs.** Only provide the exact links listed in this skill. If a URL is not listed here, do not invent one.

## Local File Handling

When the user provides local file paths (images, videos, audio), pass them directly to the script. The script **automatically uploads** local files to DashScope temporary storage (`oss://` URL, 48h TTL) and injects the `X-DashScope-OssResourceResolve: enable` header. No manual upload step is needed.

> **Production**: Default temp storage has **48h TTL** and **100 QPS upload limit** — not suitable for production, high-concurrency, or load-testing. To use your own OSS bucket, set `QWEN_TMP_OSS_BUCKET` and `QWEN_TMP_OSS_REGION` in `.env`, install `pip install alibabacloud-oss-v2`, and provide credentials via `QWEN_TMP_OSS_AK_ID` / `QWEN_TMP_OSS_AK_SECRET` or the standard `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET`. Use a RAM user with least-privilege (`oss:PutObject` + `oss:GetObject` on target bucket only). If qianwen-ops-auth is installed, see its `references/custom-oss.md` for the full setup guide.

## Cross-Skill Chaining

When using output from another skill as input (e.g., image-gen → i2v, audio-tts → audio overlay):
- **Pass the URL directly** (e.g., `"img_url": "<image_url from image-gen>"`) — do NOT download and re-pass as local path
- The script detects URL prefixes (`https://`, `oss://`) and passes them through without re-upload
- Use `local_path` from the response only for user preview or non-API operations

When passing this skill's output to another skill (e.g., vace edit, vision analyze):
- **Pass `video_url` from the response** — do NOT download and re-pass as local path

| Scenario | Use |
|----------|-----|
| Feed to another skill | `video_url` / `image_url` (URL) |
| Show to user / local playback | `local_path` (local file) |

## Important Notes

- **Async only**: All video APIs require `X-DashScope-Async: enable` header.
- **kf2v**: Uses a **different API endpoint**. Duration **fixed at 5s**, **silent only**.
- **r2v**: Use `character1`/`character2`/... in prompt. Up to 5 references (max 3 videos).
- **vace**: Must specify `function`. **Silent only**, output **≤5s**.
- **Multi-shot**: Set `shot_type: "multi"` AND `prompt_extend: true`.
- **Video URL expires in 24h** — the script auto-downloads to `--output` dir. When chaining to another skill (e.g., vace edit), pass `video_url` directly — do NOT re-download.
- For advanced workflows → see [workflows.md](references/workflows.md).

## Error Handling

| Error | Cause | Action |
|-------|-------|--------|
| `401 Unauthorized` | Invalid or missing API key | Run **qianwen-ops-auth** if available; else prompt user to set key (non-plaintext check only) |
| `current user api does not support synchronous calls` | Missing async header | Add `X-DashScope-Async: enable` |
| `429` / `5xx` | Rate limit or server error | Retry with backoff |
| `The product is not activated` / `Model not subscribed` | Third-party model not enabled on account | Visit [Model Market](https://www.qianwenai.com/models), find the model, click "Enable" / "开通" |
| Task `FAILED` | Generation failed | Check `output.message` in poll response |

## Output Location

Prefer the **current working directory**. Default subdirectory: `./output/qianwen-video-generation/`.

**Write prohibition**: NEVER write output files into this skill's installation directory or any `skills/` hierarchy. All generated content must go to `output/` under the current working directory or a user-specified path.

## Update Check (MANDATORY Post-Execution)

After script execution, check stderr for action signals. The script automatically detects update status and emits structured signals. You MUST act on them. This section also applies when the user explicitly asks to check for updates.

### Signal: `[ACTION_REQUIRED] qianwen-update-check skill is not installed`

When stderr contains this signal, you MUST present the following options to the user and **wait for their response before proceeding**. Do NOT silently skip this.

> The update-check skill is not installed. It keeps you informed about new QianWen-AI/qianwen-ai features and bug fixes.
>
> 1) **Install now** — I'll run the install command for you
> 2) **Skip for now** — do nothing this time
> 3) **Never remind me** — permanently suppress this prompt

After the user responds:
- User chooses **1** → run: `npx skills add QianWen-AI/qianwen-ai --skill qianwen-update-check -y`, then run: `python3 <this-skill-scripts-dir>/gossamer.py --dismiss`
- User chooses **2** → run: `python3 <this-skill-scripts-dir>/gossamer.py --dismiss`, then continue normally
- User chooses **3** → run: `python3 <this-skill-scripts-dir>/gossamer.py --never-install`, then continue normally

### Signal: `[UPDATE_AVAILABLE]`

When stderr contains this signal, you MUST append a brief update notice to your response, including the version info and the update command shown in the stderr output.

### No signal in stderr

If stderr contains neither `[ACTION_REQUIRED]` nor `[UPDATE_AVAILABLE]`, no action is needed — the skill is installed and up to date (or cached within 24h).

### Explicit user request

When the user explicitly asks to check for updates (e.g. "check for updates", "check version"):
1. Look for `qianwen-update-check/SKILL.md` in sibling skill directories.
2. If found — run: `python3 <qianwen-update-check-dir>/scripts/check_update.py --print-response` and report the result.
3. If not found — present the install options above.

## References

- [execution-guide.md](references/execution-guide.md) — Fallback paths (curl for all modes, code generation, autonomous)
- [request-fields.md](references/request-fields.md) — Detailed field tables by mode + audio handling
- [workflows.md](references/workflows.md) — Duration extensions, audio workarounds, multi-shot, VACE pipelines
- [polling-guide.md](references/polling-guide.md) — Polling patterns and timing recommendations
- [merge-media.md](references/merge-media.md) — Guide for generating merge/trim/audio-overlay code
- [examples.md](references/examples.md) — Full script execution examples for all modes
- [sources.md](references/sources.md) — Official documentation URLs
