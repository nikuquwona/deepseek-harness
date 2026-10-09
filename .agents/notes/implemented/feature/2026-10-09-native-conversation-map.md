# Agent Note: Native conversation map

Status: implemented

English | [中文](2026-10-09-native-conversation-map.zh.md)

## Problem

A useful answer can lead to several independent investigations. A flat session list loses their origins; a temporary side conversation loses useful work. Spatial branch commands also ask users to choose a layout direction before expressing their next question.

## Decision

The optional [Session Tree host](../../../../packages/experimental/session-tree/README.md) and [map UI](../../../../packages/experimental/client-ui-session-tree/README.md) project native Session ancestry onto an on-demand map. Opening a card returns to the same native conversation. Native chat owns branching from a reply and preserves the exact committed prefix; direction belongs to automatic layout.

Conversation names remain native Session titles, including names edited from a card. The map owns summary annotations, presentation state, and result previews. The current native session determines the highlighted ancestor path. Native Pin, workspace navigation, approvals, tools, and deliverables retain their existing ownership. Independent branches share the original workspace; conversation ancestry does not snapshot files or copy provider KV tensors.

The initial view scopes to the connected exploration. Search combines card text with current native message text and includes hidden conversations. The map reads public Session observations and reuses semantic-text helpers for literal matching, so Chinese fragments and short remembered words can match without extending the native search API or enabling its index. Search retains request-local snippets rather than another message store. Selecting a result restores a readable scale; a zoomed-out overview keeps names legible and hides secondary detail. Disclosure reduces visible detail without removing saved sessions. Previews prioritize declared files and distinguish text references from verified external outcomes.

The [bundle](../../../../packages/experimental/session-tree-bundle/README.md) provides one installation and enablement entry for the Host and UI. It inserts those two rows without overriding built-in configuration. Search stays within public observation APIs, so installation does not require a fork of the native query or controller packages. Runtime disablement removes both components while native sessions and persisted annotations remain available for re-enablement.

## Alternatives considered

**Separate downward continuation and rightward branching.** Both actions created sessions while their direction implied different semantic relationships. Ordinary continuation now stays in the existing chat; native branching remains the explicit creation operation.

**Map as the primary editor, or a permanent split view.** Both make spatial navigation a prerequisite for ordinary conversation and compete with the existing composer and tools. The on-demand map preserves the familiar writing surface. [Sensecape](https://sanghosuh.github.io/papers/sensecape_uist.pdf) and [Graphologue](https://jiang.pl/papers/graphologue.pdf) support exploratory spatial views but also report navigation or representation costs; their small, task-specific studies do not establish a universally better coding interface.

**A separate main-line marker and a map-owned transcript.** These duplicate current-session navigation and native conversation presentation. A derived path follows actual work, while native Pin supplies a persistent shortcut. Returning to the owning conversation preserves extensions and avoids a second tool or approval UI.

## Consequences

Recursive relationships and annotations survive restarts without a second session lifecycle. The plugin adds no model prompts. Exact inherited prefixes permit normal provider cache reuse but do not guarantee cache hits.

The map gives up an always-visible overview and direct artifact editing. A presented-file reference returns to its owning conversation. First load reads ordinary session logs; subsequent reads reuse projections only while their live instance/cursor or persistence instance/revision remains valid. Card layout is automatic and is not virtualized.

## Testing

Host composition tests exercise native recursive forks, prefix preservation, annotation persistence, changing log revisions, provider replacement, cancellation, and unload. UI tests exercise native navigation, disclosure, search, and retention of unsaved annotation edits after failure. An assembled Web regression searches Chinese substrings, a single character, and case-insensitive English content absent from card titles and summaries. The keyless scripted example supplies a reproducible assembled experience without a provider credential.
