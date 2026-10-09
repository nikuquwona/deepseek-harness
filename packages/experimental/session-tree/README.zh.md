---
description: "浏览原生对话的父子关系，保存卡片注释，并查看关联源事件的结果预览。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-session-tree

[English](README.md) | 中文

## 概述

将原生对话及其父子关系显示为持久的会话树，每个普通 Session 对应一张卡片。这个按需启用的插件保存卡片摘要并生成自动预览。标题、创建会话、精确前缀分叉、模型交互和持久化由原生 Session 服务负责。现有会话和递归分叉直接出现，无需导入，也无需通过插件专属入口创建。

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

构建仓库，然后通过[可选配置覆盖层](cordis.source.patch.yml)启动普通 Web 应用：

```bash
pnpm run build
pnpm dsh web --patch ./packages/experimental/session-tree/cordis.source.patch.yml
```

在侧栏选择**对话地图**。[画布包](../client-ui-session-tree/README.zh.md)介绍导航和结果预览。现有普通会话会自动出现，包括启用插件前创建的原生分叉。真实对话的模型服务可在常规「模型」设置中选择。

覆盖层还会启用原生消息搜索：将 `session-query-sqlite` 配置为 `path: ':memory:'` 和 `openAt: first-search`，在第一次查询时打开派生索引。普通 Web 配置默认关闭全文搜索。自定义组合需要启用原生索引才能搜索消息；如果索引被禁用或搜索失败，地图会显示失败提示，并继续展示匹配的名称和摘要。

打开卡片即可继续已有的原生对话。要探索其他方向，请使用原生对话的分叉操作：新 Session 继承精确事件前缀，并保留父会话日志。返回某个 Session 不会创建分支。原生置顶功能可以保留常用会话入口，会话树不要求指定主线。

每个对话在聊天、侧栏和地图中共用一个原生标题。在地图中修改名称会调用原生 Session 重命名，不产生模型请求，并遵循原生标题的校验和规范化规则。只有自定义摘要保存在 `session_tree` 存储域中，清空摘要会恢复自动摘录。原生会话头仍然是血缘关系的权威来源。卸载插件会保留对话、名称和摘要，再次启用时会从持久数据重建会话树。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[服务](src/index.ts)通过会话查询读取冷会话或活跃会话。Remote API 提供会话树读取和注解保存；保存时委托 Session Controller 重命名，确认原生标题落盘后再保存摘要。Session 命令及完整对话渲染仍由原生服务负责。[存储域](src/spec.ts)只保存摘要。[预览投影](src/preview.ts)提取追加消息的文本、原生文件声明、类似 Git 输出的文本、GitHub 引用和 Mermaid 源码；每张卡片的结果和摘要不包含继承事件。浏览器通过生成的类型化 Remote 读取这些投影。

卡片预览缓存在内存中。活跃卡片要求 Session 实例和事件游标都未变化；冷会话卡片要求持久化服务实例和当前持久 revision 都未变化。来源变化后重新读取，无法取得可靠 revision 的来源不会复用。注释和运行状态独立于缓存，每次读取当前值。取消刷新会停止待完成的读取；卸载插件会等待操作结束，再关闭注释存储。缓存只保留预览，不保留完整日志；Session 离开列表后删除对应缓存。

早期本地原型记录可能仍包含自定义标题。初始化会将每个非空标题交给原生重命名，确认日志落盘后再删除旧字段，并保留摘要。已完成的迁移不会重复，列表读取也不会迁移数据。Session 不存在、重命名失败或持久化失败都会终止插件激活，并报告对应的 Session id 和原因。尚未完成的注解记录会保留，供修复后重试；已经落盘且内容相同的用户标题不会在重试时重复追加。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [画布包](../client-ui-session-tree/README.zh.md) — 导航和操作。
- [会话控制器](../../api/session-controller/README.zh.md) — 原生精确分叉语义。
- [会话持久化](../../session/session-persistence-jsonl/README.zh.md) — 持久保存对话。
- [存储域](../../storage/storage-domain/README.zh.md) — 注释持久化。

-----

<a id="model-experience"></a>
## 模型体验

### 继承对话前缀

#### 模型看到什么

子会话接收原生分叉所选的精确前缀及自身后续消息。`session/end-seed` 和合成关闭事件遵循原生语义。卡片注释和画布坐标不会进入模型输入。

#### Token 影响

自动卡片预览、显式重命名和原型标题迁移都不增加模型调用或 token。子会话继续执行时，会在普通请求中使用继承的对话；分叉不会缩小上下文。

#### KV Cache 影响

相同前缀保留了模型服务复用前缀缓存的机会。缓存分配、保留和命中由服务方控制；插件不复制 KV 张量，也不保证缓存命中。每个子会话都有独立的原生日志和后续请求历史。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

这个实验明确保留以下存储和预览边界：

- 首次列出会话树会读取每个普通 Session 的日志，大型归档可能加载较慢。后续读取通过活跃游标或轻量持久化 revision 校验缓存。画布目前未做虚拟化。
- 原生分叉复制前缀，因此磁盘占用会随分支数量和前缀长度增长。独立会话共享配置的文件系统工作区；分叉不会创建 Git worktree。
- 提交、PR、链接和 Mermaid 预览都是文本引用，不代表经过验证的外部成果。非错误工具输出中类似 Git 的文本不能证明提交存在。源内容仍应在原生对话中查看。
- 文件预览保留原生 `deliverables/presented` 声明中的路径和下标，不复制文件内容，也不确认文件仍然存在；当前文件的打开由原生交付物功能负责。
- 标题和摘要分别写入原生 Session 与注解存储。摘要保存失败时，已接受的原生名称可能已经生效；操作会报告错误，以便重试摘要保存。
- 插件不归档或删除会话。会话树省略子智能体专属会话。祖先被删除后，子会话仍以断开的根节点显示。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
