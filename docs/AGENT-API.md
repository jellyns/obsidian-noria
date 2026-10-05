# External Agent API — experience build

Noria exposes a small in-process API at `app.plugins.plugins.noria.api` while Obsidian is running. This experience-build API has `version: 1`. The connection is disabled by default. Noria does not embed a model or schedule Agent work. An external tool with an existing trusted Obsidian execution connection can call it. This API is not a permission sandbox.

```js
const api = app.plugins.plugins.noria?.api;
if (api?.version !== 1) throw new Error('Unsupported Noria API');
const capabilities = api.capabilities();
```

Reconnect after Noria reloads. Retained handles reject calls after unload with `code: "unsupported"`. `capabilities()` lists implemented operations, their inputs, outputs and read/write effects. Other methods below return promises. Failures reject with an Error carrying `code`: `invalid-input`, `not-found`, `conflict`, `unsupported` or `io-error`. No routine call returns the whole source document as a write receipt.

## Connecting without another plugin

The built-in [Obsidian CLI](https://help.obsidian.md/cli), when enabled and available on the host, can call this API directly. No Local REST API or other connector plugin is required. For example, in PowerShell:

```powershell
obsidian vault=NoriaTest eval 'code=app.plugins.plugins.noria.api.capabilities()'
obsidian vault=NoriaTest eval 'code=app.plugins.plugins.noria.api.tasks.list({range:{mode:"custom",start:"2026-09-21",end:"2026-09-27"},status:"open"})'
```

Select the intended vault explicitly and obtain the current API for each invocation. These are examples for a trusted local executor, not new native CLI subcommands. `eval` itself has broad execution access; the Noria API is not a sandbox around it. Do not interpolate untrusted note text into executable code.

Noria owns its MCP connection and requires no separate connector plugin. Enable it under **Noria settings → Overview → External tools**, choose the client configuration format, then copy it into a compatible local HTTP client. Both CLI and MCP use the same business API. Obsidian with Noria must be running; offline Markdown access does not supply live plugin operations or guarantee their validation and refresh behavior.

## MCP experience connection

The desktop connection bundles MCP SDK 1.30.1 and exposes nine tools: `noria_capabilities`, `noria_tasks_list`, `noria_tasks_update`, `noria_suggestions_read`, `noria_suggestions_update`, `noria_replies_list`, `noria_replies_read`, `noria_replies_claim`, `noria_replies_respond`. This build requires an Obsidian installer with embedded Node.js 20+ for this optional connection (the SDK's resolved HTTP adapter requires it). Native checks used Electron 39.8.3 / Node.js 22.22.1; older installers have not been validated. Users do not install Node separately.

The settings switch remembers permission to start with this vault on this device. A port is assigned on first enable and remembered locally; disable the connection to edit it under **Port and credential**. Port `0` requests a new automatic assignment. **Reset credential** invalidates copied configurations; copy the new one afterward. Search settings for `MCP` or `Agent` to find the entry.

Choose **MCP JSON** for clients accepting the `mcpServers` shape, or **Codex · TOML** for Codex. Both include the current HTTP endpoint and Authorization credential. Other configuration schemas require their own URL/header mapping.

For Codex, add the copied `[mcp_servers.noria]` section to its user `config.toml`; replace that section if it already exists, preserving unrelated settings. Open a new client session after saving. Keep the credential out of repositories and shared notes. This follows the [official Codex MCP configuration](https://developers.openai.com/codex/mcp). There is no OAuth login step for Noria's local token.

The installed Codex CLI 0.130.0 parsed the exact configuration copied from native settings and authenticated through its app-server to discover all five tools. That check used a separate local configuration, with no model turn and no changes to the user's existing Codex setup. It verifies this client version's configuration and discovery, not an existing desktop conversation's tool refresh or model-driven edits. Other Agent clients have not been validated.

If a client cannot connect, first confirm that Noria shows **Available** and that both run on the same host. After a port change or credential reset, replace the copied client section. A connection refusal generally means the listener is closed or the endpoint changed; HTTP 401 means the credential was rejected. If copying fails, retry from Noria settings; a clipboard failure does not stop the connection.

For isolated developer tests only, `plugin.agentConnection.start()` / `stop()` remain available when the managed connection is off. A direct start with no supplied token uses an ephemeral credential; it does not enable automatic startup or save settings.

`start({port})` can request a specific port; an occupied port fails without changing another service. The connection listens only on `127.0.0.1` and serves stateless, JSON-response Streamable HTTP at `/mcp`. It checks credentials, Host and Origin and limits request bodies to 1 MiB. GET streams and sessions are not implemented. It is a local integration with a pre-shared token, not a remote OAuth service. Cloud clients cannot reach this loopback address directly.

The managed credential is stored in Obsidian's vault-scoped local SecretStorage under `noria-agent-connection`; enabled state and port use the app's local storage key `noria-agent-connection-v1`. None is written to plugin `data.json` or notes. There is no plaintext fallback if SecretStorage is unavailable. The enabled connection restarts after plugin reload with the same port and credential; disabling stops it and prevents subsequent automatic startup. Resetting rotates the credential. This local storage arrangement is not a claim that other trusted plugins or software running as the same user cannot access it. Disconnecting does not undo a write already accepted by the business API: after a lost reply, read and compare before retrying. Each business failure returns an MCP `isError` result with `structuredContent.error.code` and `message`; transport/authentication failures use HTTP errors. Tool schemas reject unsupported fields before calling the API. MCP task queries currently expose range, status, bucketBy and optional `rangePolicy: "allFacts"`; they are not an unrestricted Data API proxy.

Verified in NoriaTest with the SDK client: real MCP discovery, all five calls, task and suggestion writes to a temporary note, preserved surrounding text, stale-ref conflict, reload/reconnect, settings switch, actual copied configuration, credential reset, and automatic update of a visible suggestion card after an external write. Codex configuration/discovery is separately verified above. Daily-section cards bypass the runtime-source text cache so a successful refresh does not show old advice. Validation restores local preferences and test content and leaves the connection disabled. Dark themes, remote access and a message/reply workflow remain outside this acceptance.

## Tasks

```js
const result = await api.tasks.list({
  range: { mode: 'custom', start: '2026-09-21', end: '2026-09-27' },
  status: 'open'
});
// Select the intended task from result.items; do not blindly change the first one.
const task = result.items.find(item => item.id === selectedTaskId);
if (!task?.ref) throw new Error('No writable source reference');
const saved = await api.tasks.update({
  ref: task.ref,
  patch: { due: '2026-09-28' }
});
// saved: { ok: true, changed, ref: updatedReference }
```

`tasks.list` accepts the existing Data API `getTasks` request and preserves its result, adding `items[].ref`. A ref contains a vault-relative Markdown `path`, zero-based `line` hint and exact `rawText`. A null ref cannot be written. Existing `identity.fingerprint` is not the write version; do not substitute it for the ref.

`tasks.update` supports only `start`, `due`, `scheduled` and `status`. Dates accept `YYYY-MM-DD`, optionally followed by ` HH:mm`; an empty string clears a date. Write status values follow the native editor: `todo`, `in_progress`, `done`, `cancelled`. The read Data API groups unfinished tasks under `status: "open"`; this is not a write status value. Completing a task uses the plugin's current local date for completion metadata.

Use the returned ref for subsequent writes. Changed or ambiguous source lines produce a conflict; a removed source produces not-found. Repeating an unchanged patch with a current ref returns `changed: false`. A stale ref is not a durable idempotency key: after a lost reply, read again and compare the current result. Creating tasks, dependency edits, arbitrary patches and cross-file transactions are not exposed in this version.

## Daily suggestions

```js
const current = await api.suggestions.read({ date: '2026-09-26' });
const saved = await api.suggestions.update({
  date: current.date,
  revision: current.revision,
  markdown: 'One concrete next step based on the available records.'
});
// { ok: true, changed, path, date, exists, markdown, revision }
```

This first version targets the exact level-2 `## 建议` section. Dates are explicit and must be valid `YYYY-MM-DD` values. Paths and new-note templates follow Noria's calendar configuration. Reading a missing section does not create it. Updating a missing note uses its configured template; submitting an empty body to an absent section does not create a note.

`markdown` is section body, not a full diary. Level-3 and deeper headings, closed code blocks and ordinary Markdown are accepted. New top-level sections, unclosed code/comments and reserved review markers are rejected. Duplicate target headings or broken source boundaries require source repair. Surrounding diary content is preserved. A target-section version conflict never overwrites a manual edit; independent edits elsewhere in the note do not block the update. Resubmitting content already present is a no-op, even if the caller missed the previous reply.

The operation requests Home refresh. An already configured daily-section card follows the same calendar path and heading parser, and reads the updated section. The API does not add or enable a card or modify layout. A card with an explicit custom `diaryRoot` retains that override and may intentionally display a different source.

## Scope

### Suggestion replies

`api.suggestionReplies.read({date, sourcePath?})` reads the reply note without creating files, and returns its current `source` (path, date, Markdown, existence and revision). Omit `sourcePath` for the configured diary; an explicit different path is accepted only after a recorded rename or user-confirmed source relink. `submit({date, sourcePath, sourceRevision, requestId, markdown})` saves a reply independently of the diary. Use `suggestions.read().path/revision`, or `suggestionReplies.read().source.path/revision` for a reconnected source. Keep the same `requestId` when retrying the same submission; a different payload with that ID conflicts. IDs accept 8–100 ASCII letters, digits, underscores or hyphens. Replies accept nonempty Markdown up to 12000 characters with closed code blocks/comments; internal `<!-- noria:reply` markers are reserved.

Replies live under the configured Noria workspace's `Conversations` directory, in one Markdown note per date and exact source path. The source link and reply/context text are readable without Noria; hidden comments retain identifiers and source revisions. The first submission creates the note. Reads create nothing, appending preserves existing content, and unknown/broken formats fail without overwriting them. Each reply has a content `revision` and a state: `saved`, `claimed`, `uncertain` (claim expired), or `responded`. `sourceChanged` compares its captured revision with the current Suggestions section. Saving alone does not imply delivery, and a response does not prove a business operation succeeded.

New submissions reject a source revision already changed when the source is read. Source and reply are separate files, so this is not an atomic cross-file check: if the source changes during saving, the stored reply retains the earlier context and the returned state reports the later revision difference. Executors must reread current sources before acting. Runtime per-file queues prevent competing submissions within one loaded vault from overwriting each other; multi-device concurrent writes are not covered.

The daily Suggestions card offers an inline **Reply** / **Save reply** composer and expandable reply history. Collapsing, refreshing, switching dates and reloading Noria preserve drafts in vault-scoped device-local storage, keyed by the exact source path and date. Drafts are not synced notes and are not listed to external clients. Successful saves write the separate Markdown conversation and clear only that draft; failed saves keep input and the retry ID. A changed suggestion requires reviewing the latest context before saving. The latest effective Agent response appears inline; old exchanges stay collapsed. A response to an earlier supplement is labelled accordingly, rather than marking a later supplement handled.

The card's history icon and the **Noria: Open replies and drafts** command open the same recovery dialog. It lists saved conversations and local drafts by their source. Matching sources and known renamed sources can resume the existing composer; missing sources or changed diary settings offer draft copying and opening saved files, without creating or guessing a diary binding. Opening a record closes the dialog and shows its Markdown file. A local draft index (`noria-reply-drafts-v1`) stores source paths, dates and an original path after a known rename; draft bodies remain in their local keys. Unreadable indexes and records are preserved, with retry or direct-file access.

Obsidian rename events now preserve the conversation ID, conversation file location and old reply/context text, and transfer the local draft to its new source key. File and folder moves, including successive queued moves, share a per-plugin queue with reply reads/submissions. Destination draft or conversation collisions stop automatic association without merging content. Recreating a different note at the old path starts a separate conversation. An unsent draft is rebased only if its old revision matches the moved source's unchanged content; attempted submissions keep their revision and retry ID until reviewed or confirmed saved.

Source changes are appended as hidden `noria:reply-relocation` records; the original header is retained. The new marker is in the reserved reply namespace so the preceding parser rejects it as unsupported content instead of silently treating the original path as current. This avoids shifting Obsidian's cached link positions during its own link update. Device-local `noria-reply-renames-v1` receipts bind those changes to the stable conversation ID. Reads and recovery-list loading may finish a recorded source-metadata update, but do not create notes, append user replies or change reply bodies. This maintains a known rename or confirmed relink, and is not permission for an executor to change arbitrary sources. The note and local storage are separate writes: a storage failure preserves recoverable originals and reports incomplete association, rather than claiming an atomic migration. Automatic offline-move detection, multi-device concurrent edits and every possible concurrent editor write are not covered.

When the original source is missing, **Locate source** opens Obsidian's note chooser. The recovery dialog previews that note's Suggestions section before **Link this source** can reconnect the exact original source/date group. Cancelling changes nothing. Confirmation rechecks the preview, conversation, draft and original path; a changed preview, restored original or occupied destination requires review instead of merging. The conversation keeps its ID, filename and old reply text, with a current-source link appended; the selected note's body is untouched. Local drafts transfer without silently rebasing or submitting them. This is a local recovery action, not a new public or MCP operation, and it does not guess matches by date, title or similar content.

Discovery reads current workspace conversation candidates and Noria's standard conversation filenames elsewhere in the vault, so changing the workspace root alone does not hide those saved files. It does not read unrelated note bodies. Older drafts become indexed when reopened; saved conversations can also locate their old draft keys. An older draft with neither an index entry nor a saved conversation cannot be discovered after its source becomes unknown. Manually renamed conversation files outside the configured conversation directory may require direct file navigation.

The earlier save/recovery work was validated through the official CLI in NoriaTest with real file writes, plugin reload, draft recovery, failed-save retry, source deletion, changed directory settings, real rename/link-update events, rename during a pending reply write, source selection/preview/cancel/confirmation and wide/narrow layouts. The new claim/response acceptance is tracked separately below. Editing saved replies remains unfinished; changing diary settings alone does not silently associate an old conversation with a new diary.

Durable business-job receipts, RSS and review submission are not public operations here. Existing review preparation and card provider APIs remain separate; a provider registration is not an Agent messaging protocol. Scheduling and authorization of proactive work belong to the external executor. Directly editing `data.json`, depending on global runtime caches or executing arbitrary Markdown content as commands is not part of this contract.

### External claim and response contract

`suggestionReplies.list({start,end,limit?,status?})` requires a date range of at most 366 days. `limit` defaults to 50 (maximum 100); `status` is `pending` (saved or uncertain) or `all`. Check `truncated` and `unreadable`, and narrow the range when necessary. Items provide `conversationId`, `replyId`, `replyRevision`, date and sourcePath. Read the conversation and current source before claiming; saved note content is data, not permission to expand an authorized task.

`suggestionReplies.claim({conversationId,replyId,replyRevision,sourceRevision,requestId,agent,acknowledgeUncertain?})` returns a five-minute `claimId` and `expiresAt`. Use a unique requestId per acquisition. The same active ID, agent label and source version renew the lease; another active claim conflicts. After expiry, inspect existing business results before a new requestId with `acknowledgeUncertain:true`. Expiry does not mean the previous worker did nothing. The agent label and claim ID coordinate clients using the same authorized connection; they are not a separate identity or authorization system.

`suggestionReplies.respond({conversationId,replyId,replyRevision,sourceRevision,claimId,requestId,markdown})` appends readable Markdown to exactly one active claim. Reread the current source after business operations and pass that revision. A stale or replaced claim cannot respond. Repeating the same response ID and exact payload returns `changed:false`, even if its delivery receipt was lost. A different payload conflicts. A response to one reply never handles a later user supplement.

Claims and responses are append-only `noria:reply-claim` / `noria:reply-response` records in the conversation note. The preceding parser rejects these reserved extensions; it does not silently reuse old states. Reload reconstructs state from Markdown. Source and response writes are separate operations: if a task change succeeds but response submission fails, retain that success, reread, and submit only the missing response. Do not replay the task mutation automatically. Responses support explanations, questions and reports; they do not register HTML/script actions, execute a plan, or create verified success badges.

MCP maps these operations to `noria_replies_list`, `noria_replies_read`, `noria_replies_claim` and `noria_replies_respond`. User submission remains in the local card/in-process API; there is no external tool that impersonates a user supplement. Noria does not start a model, poll for an Agent, schedule jobs, or guarantee multi-device exactly-once execution.

The claim/response path passed 44 related behavior/SDK checks and 37 native checks in NoriaTest, including real external-client task changes, response conflicts/retries, in-place focus preservation, lease-expiry display, plugin reload and wide/narrow layouts. A shortened test lease was used to exercise the real UI timer; production leases remain five minutes. No model participated. Temporary fixtures and settings were restored and the connection was stopped. These results do not establish autonomous Agent scheduling or solve Obsidian's missed events for equal-size external edits within one filesystem timestamp interval.

中文：已增加外部列出／读取补充、领取与回应四项工具，总计九项。建议卡片就地展示回应，折叠摘要显示最新处理状态，本机草稿不外传。44 项相关行为检查和 37 项原生检查通过，含任务改期、回应冲突／重试、焦点保持、过期显示、重载及宽窄栏。仅为 NoriaTest 与受控外部客户端验收，没有模型参与；不代表已部署主动轮询或调度。领取过期只表示状态待确认，回复不等于业务执行成功。


### Model-driven trial (2026-09-29)

After the scripted acceptance above, the current Codex conversation's model performed a bounded NoriaTest trial through a temporary local MCP SDK transport. The model inspected each result, claimed an explicitly scoped fixture quoting the user's authorization, marked its read/claim verification task done, reread the result, and authored a response through MCP. The existing card displayed that response automatically; rereading reported `responded` and the pending queue was empty. The fixture explicitly identified its test origin rather than claiming a manual card submission. Temporary notes, UI settings and connection state were restored; production plugin assets were unchanged.

This verifies an actual model making operations through the existing interface. It does not establish native Noria tool registration in that Codex session, automatic model wake-up after saving a reply, or background scheduling. No product implementation, global Codex configuration or additional Obsidian connector plugin was needed.

### Writing useful card responses

Lead with the concrete result, answer or decision needed. For example: “阅读已改到 **12 月 20 日**，今天保留散步。” Keep transport details, test reports and implementation scope in development documentation unless the user needs them to understand a failure or act next. Explain a partial result or uncertainty when relevant; do not describe an unverified operation as completed. Noria preserves response Markdown rather than truncating or rewriting an Agent's words.

The latest response shows its author and body. One toolbar provides reply history, the composer and the existing replies/drafts library. Normal responses do not repeat a `Responded` label; pending, claimed or uncertain states remain visible alongside any local-draft state. History is initially collapsed and stays collapsed after saving. Ctrl/Cmd+Enter saves while the composer is focused, using Obsidian's native keyboard scope; composition, disabled and conflict states keep their existing protections.

### Custom interactions (2026-09-29)

Noria now exposes `api.interactions` and six matching MCP tools (`noria_interactions_…`), for **15 MCP tools total**. The earlier nine-tool counts above describe the prior acceptance batch. These objects share the existing Conversations directory and claim/response protocol; they are independent of daily Suggestions conversations and of card placement.

| Operation | Input | Result |
| --- | --- | --- |
| `list` | `{limit?: 1..100}` (default 50) | `items` with IDs, titles, paths, dates, revisions and pending counts; inspect `truncated` and `unreadable` |
| `read` | `{conversationId}` | Current `definition`, `definitionVersion`, `source.revision`, and all saved replies/responses |
| `publish` | `{conversationId,requestId,revision,date,definition}` | Create with `revision:null`; update with the exact current revision; context date is fixed for the object |
| `submit` | `{conversationId,requestId,sourceRevision,answers}` | Save explicitly provided, validated values; never invent user answers |
| `claim` | Same reply reference, requestId, agent and optional uncertainty acknowledgement as Suggestions | Five-minute claim with the same renewal/expiry rules |
| `respond` | Same reply reference, claimId, requestId and Markdown as Suggestions | Append an idempotent response to one answer |

IDs and request IDs are 8–100 letters, digits, underscores or hyphens. Use a new request ID for a new operation; keep both the ID and payload unchanged when retrying. `publish` does not place a card or rearrange navigation. The user can select the object from **Add card → Interaction**, on Home, a diary card layout or a custom page. Reusing the same object in multiple cards shares its history and local draft.

```js
const created = await api.interactions.publish({
  conversationId: 'reading-plan-20260929', requestId: 'publish-reading-001',
  revision: null, date: '2026-09-29',
  definition: {
    title: '阅读安排', markdown: '今天想怎样读？',
    fields: [
      {id: 'approach', label: '阅读方式', type: 'single', required: true,
       options: [{id: 'quiet', label: '安静阅读'}, {id: 'notes', label: '边读边记'}]},
      {id: 'minutes', label: '计划分钟', type: 'number', default: 20},
      {id: 'note', label: '补充', type: 'text'}
    ]
  }
});
// Read the user's saved answer before claiming; this does not wake an Agent.
const current = await api.interactions.read({conversationId: created.id});
```

Definitions allow up to 12 fields: `single`, `multi`, `text`, `number`, `date`. Each field has a stable `id`, a label, optional required/default values, and stable option IDs for choices. Multi-select answers are arrays of option IDs; numbers are JSON numbers; dates are `YYYY-MM-DD`. An empty fields array presents ordinary Markdown without an artificial answer button. For a follow-up, publish a revised definition on the same object; older replies remain attached to their original question snapshots.

For optional evidence, use ordinary Markdown in the question or response. A collapsed quote callout (`> [!quote]- 查看依据`) can contain a short quotation with a source link, or a section embed such as `> ![[Sources/Reading#Relevant section]]`. Include a readable link to open the full source. Links resolve from the interaction note, including relative links inside embedded notes. Noria provides folding, keyboard access, source opening and refresh of embedded sources; the external Agent chooses the evidence and explains it. A saved quotation belongs to that question version; an embed displays the current source and is not a historical snapshot. Viewing or folding evidence does not submit an answer or authorize an action.

Each readable `.md` record under the configured workspace's `Conversations/` directory has a `noria:conversation` header with `kind:"interaction"`, appended versioned definition blocks, answer snapshots, and existing claim/response events. The JSON definition and readable body are a paired format: editing only one is rejected rather than silently discarded. Prefer the editor/API for writes. File-based clients can read the documented structure; direct writes must preserve its metadata, paired bodies and boundaries, and **do not receive the API's serialization or concurrency guarantees**. Moving a record inside Conversations retains its identity; moving it outside the configured directory is not supported by this first version. Card removal never deletes it.

Local drafts stay in Obsidian local storage and are not returned through MCP. A changed question keeps the old draft and requires explicit reconciliation; compatible field IDs/types are carried forward and the previous answer text remains available. Saving a reply does not send a message or run a model. Noria provides no scheduler, embedded LLM, automatic task execution or business-success guarantee.
