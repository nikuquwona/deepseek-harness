---
description: "Browse native conversation ancestry, save card notes, and inspect source-linked result previews."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-session-tree

English | [中文](README.zh.md)

## Summary

Browse native conversations and their parent links as a persistent tree, with one card per ordinary Session. This opt-in plugin saves card summaries and projects automatic previews. Native Session services own titles, creation, exact-prefix forks, model interaction, and persistence. Existing conversations and recursive forks appear without importing them or using a plugin-specific creation path.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Build the checkout, then launch the ordinary web application with the [opt-in overlay](cordis.source.patch.yml):

```bash
pnpm run build
pnpm dsh web --patch ./packages/experimental/session-tree/cordis.source.patch.yml
```

Select **Conversation map** in the sidebar. The [canvas package](../client-ui-session-tree/README.md) describes navigation and result previews. Existing ordinary sessions appear automatically, including native forks created before this plugin was enabled. Use the normal Models settings to select a provider for real conversations.

The overlay also enables native message search: it sets `session-query-sqlite` to `path: ':memory:'` and `openAt: first-search`, opening the derived index on the first query. Ordinary Web profiles leave full-text search disabled. Custom compositions must enable the native index for message search; if it is disabled or fails, the map reports that failure and still shows matching names and summaries.

Open a card to continue its existing native conversation. To explore another direction, use the native conversation's branch action: its new Session inherits an exact event prefix and preserves the parent log. Returning to a Session does not create a branch. Native pinning keeps useful conversations accessible; the tree requires no main-line designation.

Each conversation has one native title across chat, sidebar, and map. Editing its name in the map calls native Session rename without a model request; native title validation and normalization apply. Only custom summaries live in the `session_tree` storage domain, and an empty summary restores the automatic excerpt. Native Session headers remain the authority for ancestry. Unloading the plugin keeps the conversations, names, and summaries; re-enabling it reconstructs the forest from persistence.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [service](src/index.ts) reads cold or live conversations through Session Query. Its Remote API exposes tree reads and an annotation save that delegates renaming to Session Controller, flushes the native title, and saves the summary. Session commands and full conversation rendering stay with native services. The [domain](src/spec.ts) stores summaries only. The [preview projection](src/preview.ts) extracts append-origin message text, native file declarations, Git-looking output, GitHub references, and Mermaid source. It excludes inherited events from each card's results and summary. Generated typed Remotes connect the browser to these read models.

Card previews are cached in memory. A live card requires the same Session instance and event cursor; a cold card requires the same persistence instance and current durable revision. Changed sources are read again, and sources without a usable revision are never reused. Annotation and running-state reads remain fresh independently of the cache. Refresh cancellation stops pending reads; unloading waits for operations before closing annotation storage. Cache entries retain previews rather than full logs and are removed when a Session leaves the listing.

Earlier local prototype records may still contain a custom title. Initialization transfers each nonempty title through native rename and flushes its log before removing the old field; it preserves the summary. Completed transfers are not repeated, and list calls never migrate data. A missing Session, failed rename, or failed persistence stops activation with the affected Session id and cause. Unfinished annotation records remain available for repair and retry; retrying an already persisted, identical user title does not append it again.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Canvas package](../client-ui-session-tree/README.md) — navigation and actions.
- [Session Controller](../../api/session-controller/README.md) — exact native fork semantics.
- [Session persistence](../../session/session-persistence-jsonl/README.md) — durable conversation storage.
- [Storage domains](../../storage/storage-domain/README.md) — annotation persistence.

-----

<a id="model-experience"></a>
## Model Experience

### Inherited conversation prefix

#### What the model sees

A child receives the native fork's exact selected prefix and its own subsequent messages. `session/end-seed` and synthetic closers follow native semantics. Card annotations and canvas coordinates never enter model input.

#### Token effect

Automatic card previews, explicit renames, and prototype title transfers add no model calls or tokens. A continued child uses the inherited conversation in its normal request; branching does not reduce context size.

#### KV Cache effect

Identical prefixes preserve the opportunity for provider-side prefix reuse. Cache allocation, retention, and hits remain provider-controlled; the plugin neither clones KV tensors nor guarantees a cache hit. Each child has an independent native session log and subsequent request history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The experiment keeps storage and preview behavior explicit:

- The first listing reads every ordinary Session's log; large archives can load slowly. Later listings validate cached previews against live cursors or lightweight persistence revisions. The canvas is not virtualized.
- A native fork copies its prefix, so disk usage grows with branch count and prefix length. Independent sessions share the configured filesystem workspace; forks do not create Git worktrees.
- Commit, pull-request, link, and Mermaid previews are text references, not verified external results. A Git-looking line in non-error tool output does not prove a commit exists. Native conversation rendering remains the place to inspect the source.
- File previews retain the path and index of a native `deliverables/presented` declaration. They neither copy file contents nor confirm that the file still exists; native deliverables own opening the current file.
- Title and summary writes use separate native Session and annotation stores. A failed summary save can leave an accepted native name in place; the operation reports the failure so the summary can be retried.
- The plugin does not archive or delete sessions. Subagent-only sessions are omitted from the forest. A deleted ancestor leaves its children visible as detached roots.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
