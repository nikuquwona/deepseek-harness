---
description: "在现有 Web 配置中安装对话地图。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-session-tree-bundle

[English](README.md) | 中文

## 概述

在地图中查找原生对话及其分支，搜索记住的消息片段，并回看摘要与成果预览。将这个可选组合包安装到现有 Web 配置后，可在「插件」中控制它。关闭后，对话和卡片摘要仍然保留。默认配置不包含它。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

构建仓库，然后在仓库根目录将本地组合包添加到配置中：

```bash
pnpm run build
pnpm dsh plugin --profile web add "$PWD/packages/experimental/session-tree-bundle"
pnpm dsh web
```

已有的兼容 DSH 安装可使用自己的 `dsh plugin --profile web add <absolute-bundle-directory>` 命令，或将该绝对目录粘贴到**插件 → 添加插件**。该目录及其两个工作区依赖需要保持已构建且可访问。这是本地开发安装，不会发布包，也不要求替换 DSH 应用。

在侧栏打开**对话地图**。点击卡片返回已有对话，原生分叉操作开始另一个探索。名称与原生聊天共用，摘要和预览帮助辨认各个方向。消息搜索支持中文片段和单字，不改变原生搜索索引配置。

在**插件**中，已安装的**对话地图**组合包通过一个开关控制两个组件。配置启用 HMR 时，关闭会移除地图和快捷入口，无须重启 Host 或刷新页面。再次开启会恢复已保存的摘要，并读取当前原生关系。未启用 HMR 时，配置变更在重启后生效。重新构建或替换已安装的 JavaScript 后，需要重启 DSH。

移除本地安装：

```bash
pnpm dsh plugin --profile web remove @deepseek-ai/dsh-experimental-session-tree-bundle
```

移除组合包会保留原生会话和 `session_tree` 注释存储域。常规使用只安装组合包；服务包的源码覆盖层是开发时的另一种方式，其优先级更高的配置行会独立于组合包开关保持启用。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[组合包配置](cordis.patch.yml)通过包导出插入 `session-tree` 和 `client-ui-session-tree`，不覆盖任何内置配置行。声明的依赖提供两个插件包，运行中的安装提供它们所需的官方运行时 peer。启用前即可读取本地化包信息和原创 SVG 图标。

[Host 服务](../session-tree/README.zh.md)通过既有 Session Query 和 Session Controller API 读取、搜索和修改原生标题。[浏览器组件](../client-ui-session-tree/README.zh.md)管理生成的 Remote 挂载和可撤销 Slot。移除组合包会结束两端的生命周期，原生 Session 服务继续负责对话数据。Host 的[模型体验](../session-tree/README.zh.md#model-experience)说明继承上下文与供应商侧缓存复用。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Host 服务](../session-tree/README.zh.md) — 持久化、搜索和上下文继承。
- [地图视图](../client-ui-session-tree/README.zh.md) — 导航与成果预览。
- [插件管理器](../../boot/plugin-manager/README.zh.md) — 安装、HMR 和版本兼容。

-----

<a id="model-experience"></a>
## 模型体验

无，因为此组合包只挂载对话地图的 Host 与 Client 插件。

#### KV Cache 影响

无直接影响，原生对话保留已有请求历史。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 组合包面向 Web 组合，需要其原生会话和界面服务。兼容性遵循依赖声明，本地安装不代表承诺兼容所有 DSH 版本。
- 本地安装链接到仓库。移动仓库或删除构建产物会导致该安装失效；打包分发时还需打包声明的两个插件依赖。
- 搜索按需读取原生会话日志，大型归档可能较慢。地图不维护另一份持久消息索引。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者上下文 — 点击展开</summary>

无。

</details>
