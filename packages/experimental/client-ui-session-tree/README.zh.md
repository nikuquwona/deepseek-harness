---
description: "在可平移缩放的画布中探索持久会话，从消息处分叉，并查看摘要、提交、PR 引用与架构图。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-session-tree

[English](README.md) | 中文

## 概述

在无限地图中找回相关对话、探索来路和成果。打开卡片继续已有的原生对话；聊天界面保留自身的分叉入口、输入、工具、审批及扩展。地图补充可编辑摘要、当前路径高亮、探索折叠、图表、交付文件引用，以及提交和 PR 引用。这个可选视图需要会话树 Host 插件。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

按照 [Host 包的启动说明](../session-tree/README.zh.md#use-this-package)操作；配置覆盖层会同时启用两端。地图出现在普通侧栏中。会话标题栏的快捷入口可定位当前对话及其相连的探索；聊天中只保留已有的原生分叉按钮。

- 拖动画布背景平移。使用 **+**、**−** 或**适应画布**调整缩放；画布获得焦点时也可用方向键平移。总览保留可读的名称，放大后再显示摘要和成果。搜索包含名称、摘要和原生消息正文，选择结果会恢复可读比例。
- 打开卡片继续已有对话。使用回复处的原生分叉操作，从精确的上下文前缀另开独立探索。子会话位于父会话下方，兄弟会话并排显示。
- 选中对话后，默认展示当前探索。**查看全部**可纳入其他树；折叠后续探索可减少细节，不改变保存的关系。搜索也能找到当前探索之外的对话。
- 当前原生对话自动决定高亮路径，原生置顶保留持久快捷入口。**详情**打开成果预览，**编辑卡片**在所有视图中统一修改原生对话名称，并保存地图摘要，不改变模型上下文。
- 图表缩略图采用不可交互的 SVG 图片，渲染失败时保留源码。GitHub 链接单独打开。交付文件引用返回原生对话，由成果插件负责打开文件。引用和工具输出不代表外部工作已验证，也不代表文件内容已保存为快照。

### 无需 API key 体验

脚本示例会创建五个原生会话，包含两张图和递归相连的探索。回复会明确说明来自脚本，不调用外部模型。请使用独立的数据目录，避免示例模型覆盖日常模型偏好：

```bash
DSH_HOME="$PWD/.artifacts/session-tree-demo" pnpm dsh web \
  --patch ./packages/experimental/session-tree/cordis.source.patch.yml \
  --patch ./packages/experimental/session-tree/examples/demo.patch.yml
```

使用真实模型时，只保留第一个覆盖层启动，再在常规「模型」设置中选择服务。使用相同的 `DSH_HOME` 重启后，会话和拓扑仍然存在。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[注册入口](src/client/plugin.tsx)挂载生成的 Remote 并贡献可撤销的 Slot。可取消的[数据镜像](src/client/model.ts)会在刷新失败时保留上次可用的树。[布局](src/client/layout.ts)将子会话放在父节点下方，兄弟子树各自分开；缺失父节点和异常环路仍可查看。[视图状态](src/client/view-store.ts)负责画布位置、显示范围、折叠分支和详情选择。[面板](src/client/TreePanel.tsx)通过回调和可观察 hook 接收数据，不接收服务上下文。界面文字由类型化的中英文词典管理。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Host 包](../session-tree/README.zh.md) — 持久化、精确前缀语义与限制。
- [对话 UI](../../client/ui-conversation/README.zh.md) — 完整原生对话视图。
- [Slot](../../../docs/subsystems/slots.zh.md) — 扩展组合。

-----

<a id="model-experience"></a>
## 模型体验

### 原生会话导航

#### 模型看到什么

地图调用 `ctx.uiWorkspace.openSession` 打开已有对话，导航不会提交消息或创建分叉。搜索、卡片注释、预览和当前路径高亮均不添加模型输入。

#### Token 影响

画布导航和预览渲染不消耗模型 token。发送的消息按普通会话计算输入与输出成本。

#### KV Cache 影响

没有直接影响。原生聊天负责 `ctx.sessions.fork`；服务方缓存行为遵循 [Host 契约](../session-tree/README.zh.md#model-experience)。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

画布是完整对话视图的实验性补充：

- 卡片采用固定尺寸自动布局，目前不支持任意拖动单张卡片，也未实现画布虚拟化。
- 成果预览读取已提交的事件，并随会话列表变化刷新。地图不复制聊天记录、工具活动、文件查看器或审批控件。
- 画布位置保存在浏览器本地；会话拓扑和注释由 Host 持久保存。浅色和深色主题都使用共享 UI token。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
