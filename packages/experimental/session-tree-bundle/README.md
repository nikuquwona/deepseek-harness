---
description: "Install a conversation map into an existing Web profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-session-tree-bundle

English | [中文](README.zh.md)

## Summary

Find native conversations and their branches on a map, search remembered message fragments, and revisit summaries and result previews. Install this optional bundle into an existing Web profile and control it from Plugins. Turning it off keeps your conversations and card summaries. Shipped profiles do not include it.

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

Build the checkout, then add its local bundle to the profile from the repository root:

```bash
pnpm run build
pnpm dsh plugin --profile web add "$PWD/packages/experimental/session-tree-bundle"
pnpm dsh web
```

An existing compatible DSH installation can use its own `dsh plugin --profile web add <absolute-bundle-directory>` command, or paste that absolute directory into **Plugins → Add plugin**. The directory and its two workspace dependencies must remain built and available. This is a local development install; it does not publish a package or require replacing the DSH application.

Open **Conversation map** in the sidebar. Clicking a card returns to its existing conversation; the native branch action starts another exploration. Names remain shared with native chat, while summaries and previews help identify each direction. Message search includes Chinese fragments and single characters without changing the native search index configuration.

In **Plugins**, the installed **Conversation map** bundle provides one switch for both components. With profile HMR enabled, switching off removes the map and its shortcuts without restarting the Host or reloading the page. Switching on restores saved summaries and reads current native relationships. Without HMR, configuration changes take effect after restart. Rebuilding or replacing installed JavaScript requires restarting DSH.

To remove the local installation:

```bash
pnpm dsh plugin --profile web remove @deepseek-ai/dsh-experimental-session-tree-bundle
```

Removing the bundle retains native sessions and the `session_tree` annotation domain. Use the bundle installation alone for normal operation: the service's source overlay is a development alternative whose higher-priority rows remain active independently of the bundle switch.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [bundle patch](cordis.patch.yml) inserts `session-tree` and `client-ui-session-tree` through package exports. It has no overrides of built-in rows. Its declared dependencies provide the two plugin packages; the running installation provides their official runtime peers. Localized package metadata and an original SVG icon are available before activation.

The [Host service](../session-tree/README.md) uses existing Session Query and Session Controller APIs for reads, search, and native titles. The [browser component](../client-ui-session-tree/README.md) owns its generated Remote mount and reversible slots. Bundle removal disposes both lifetimes; the native Session services continue to own conversation data. The Host's [model experience](../session-tree/README.md#model-experience) describes inherited context and provider-side cache reuse.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Host service](../session-tree/README.md) — persistence, search, and context inheritance.
- [Map view](../client-ui-session-tree/README.md) — navigation and result previews.
- [Plugin Manager](../../boot/plugin-manager/README.md) — installation, HMR, and version compatibility.

-----

<a id="model-experience"></a>
## Model Experience

None, as this bundle only mounts the conversation-map Host and Client plugins.

#### KV Cache effect

No direct effect; native conversations retain their existing request history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The bundle targets the Web composition and requires its native session and UI services. Compatibility follows the dependency declarations; a local install is not a promise of compatibility with every DSH release.
- Local installs link the checkout. Moving the checkout or removing its build outputs breaks that installation; packed distribution requires packaging its two declared plugin dependencies too.
- Search reads native conversation logs on demand; large archives can be slower. The map does not own a second persistent message index.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
