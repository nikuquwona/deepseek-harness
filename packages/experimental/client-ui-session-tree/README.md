---
description: "Explore persistent conversations on a pan-and-zoom canvas, branch from messages, and inspect summaries, commits, PR references, and architecture diagrams."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-session-tree

English | [中文](README.zh.md)

## Summary

Find related conversations, their origins, and their results on an infinite map. Opening a card continues the existing native conversation; the chat retains its own branching action, prompts, tools, approvals, and extensions. The map adds editable summaries, a highlighted current path, collapsible explorations, diagrams, presented-file references, and commit or PR references. This optional view requires the Session Tree host plugin.

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

Follow the [host package's launch instructions](../session-tree/README.md#use-this-package); its overlay enables both halves. The map appears in the ordinary sidebar. A session-header shortcut locates the current conversation and its connected exploration; the existing native branching action remains the only branch button in chat.

- Drag the canvas background to pan. Use **+**, **−**, or **Fit map** to change scale; arrow keys pan a focused canvas. The overview keeps titles readable and reveals summaries and results when zoomed in. Search includes names, summaries, and native message content; selecting a result restores a readable scale.
- Open a card to continue that existing conversation. Use the native branch action at a reply to start an independent exploration with its exact context prefix. Children appear below their parent, with sibling conversations arranged side by side.
- The current exploration appears by default when a conversation is selected. **Show all** includes other trees; collapse descendants to reduce detail without changing their saved relationships. Search also finds conversations outside the visible exploration.
- The current native conversation determines the highlighted path automatically. Native Pin keeps a durable shortcut. **Details** opens result previews. **Edit card** renames the native conversation across every view and saves a map summary without changing model context.
- Diagram thumbnails are non-interactive SVG images; a rendering failure retains the source. GitHub links open separately. Presented-file references return to the native conversation, where the deliverables plugin owns file opening. References and tool output do not establish that external work is verified or file contents are snapshotted.

### Try without an API key

The scripted example seeds five native sessions, including two diagrams and recursively related explorations. Replies explicitly identify themselves as scripted, and no external model is called. Use an isolated home so the example provider does not replace your usual model preference:

```bash
DSH_HOME="$PWD/.artifacts/session-tree-demo" pnpm dsh web \
  --patch ./packages/experimental/session-tree/cordis.source.patch.yml \
  --patch ./packages/experimental/session-tree/examples/demo.patch.yml
```

To use a real model, start with only the first overlay and select your provider in the normal Models settings. Sessions and topology survive restarts with the same `DSH_HOME`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [registration](src/client/plugin.tsx) mounts the generated Remote and contributes reversible slots. A cancellable [mirror](src/client/model.ts) preserves the last usable forest across failed refreshes. The [layout](src/client/layout.ts) places children below parents and keeps sibling subtrees separate; missing parents and cycles stay inspectable. [View state](src/client/view-store.ts) owns canvas position, scope, collapsed branches, and details selection. The [panel](src/client/TreePanel.tsx) receives callbacks and observable hooks rather than a service context. Typed English and Chinese dictionaries own interface copy.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Host package](../session-tree/README.md) — persistence, exact prefix semantics, and limits.
- [Conversation UI](../../client/ui-conversation/README.md) — the full native conversation view.
- [Slots](../../../docs/subsystems/slots.md) — extension composition.

-----

<a id="model-experience"></a>
## Model Experience

### Native conversation navigation

#### What the model sees

The map calls `ctx.uiWorkspace.openSession` to open an existing conversation. It does not submit a prompt or fork on navigation. Search, card annotations, previews, and current-path highlighting add no model input.

#### Token effect

Canvas navigation and preview rendering consume no model tokens. Sent prompts have the normal session's input and output cost.

#### KV Cache effect

No direct effect. Native chat owns `ctx.sessions.fork`; provider cache behavior follows the [host contract](../session-tree/README.md#model-experience).

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The canvas is an experimental companion to the full conversation view:

- Cards are arranged automatically, with fixed dimensions. Arbitrary dragging of individual cards and canvas virtualization are not implemented.
- Result previews use committed events and refresh on session catalog changes. The map does not duplicate the chat transcript, tool activity, file viewer, or approval controls.
- Canvas position is browser-local; session topology and annotations are host-persisted. Both light and dark palettes use the shared UI tokens.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
