/** Keyless demo with native Session names shared by the map and ordinary chat. */
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '../src/index.ts'

const PROVIDER = 'session-tree-demo'
const MODEL = 'scripted-demo'

class DemoAdapter extends LlmAdapter {
  override providerInfo(provider: string) { return { id: provider, name: 'Session Tree · scripted demo' } }
  override listModels() { return Promise.resolve([{ id: MODEL, name: '脚本演示 · 无外部模型调用' }]) }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    options.signal?.throwIfAborted()
    const last = options.messages.findLast(message => message.role === 'user' && message.source?.kind === 'user')
    const question = last?.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n') ?? ''
    const text = question.includes('架构')
      ? '这是架构图的脚本示例。地图显示会话关系，原生聊天负责继续对话和另开探索。\n\n```mermaid\nflowchart LR\n  UI[探索地图] --> API[会话关系和注释]\n  UI --> Chat[原生聊天]\n  Chat --> Fork[原生分叉]\n  Fork --> A[探索 A]\n  Fork --> B[探索 B]\n```'
      : question.includes('缓存')
        ? '这是缓存边界的脚本示例。相同消息前缀可以复用服务方缓存；每个分支独立追加后续消息。实际命中仍取决于模型服务。\n\n```mermaid\nflowchart TD\n  P[相同前缀] --> A[分支 A 的后续消息]\n  P --> B[分支 B 的后续消息]\n```'
        : `这是无需 API key 的脚本演示回复，未调用外部模型。\n\n你刚刚发送：${question}\n\n继续输入会留在当前对话。要探索其他方向，可以使用原生聊天的分叉操作；地图会保留会话之间的关系。常用对话可用原生置顶功能保存入口。切换到真实模型后，可在自己的项目中使用同样的操作。`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** Native services used to seed and continue the isolated example. */
export const inject = ['llm', 'agents', 'agentLoop', 'sessionQuery', 'sessionController', 'sessionTree']

/**
 * Register the clearly labelled scripted provider and seed a forest only once.
 * @param ctx - the ordinary web profile with Session Tree enabled.
 */
export async function apply(ctx: Context): Promise<void> {
  ctx.llm.registerAdapter([PROVIDER], new DemoAdapter())
  const rootId = SessionId('session-tree-demo-root')
  if ((await ctx.sessionQuery.listSessions()).some(record => record.header.id === rootId)) return
  await ctx.agentLoop.create(rootId, { provider: PROVIDER, model: MODEL }, { cwd: process.cwd() })
  const send = async (id: SessionId, text: string): Promise<void> => {
    const agent = ctx.agents.get(id)
    if (agent === undefined) throw new Error(`Demo Session not found: ${id}`)
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await agent.whenIdle()
    const ended = agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')
    if (ended?.type !== 'turn/end' || ended.data.reason.kind !== 'completed') {
      throw new Error(`Demo turn did not complete: ${JSON.stringify(ended?.data)}`)
    }
  }
  await send(rootId, '从一个代码评审开始，探索不同方向')
  await ctx.sessionTree.annotate(rootId, '示例 · 从一次代码评审开始', '同一份工作在聊天与地图中使用同一个名称；日常继续留在原对话，另开方向时才创建探索。')
  const fork = async (parent: SessionId, prompt: string, title: string, summary: string) => {
    const { sessionId: id } = await ctx.sessionController.fork({ sessionId: parent })
    await send(id, prompt)
    await ctx.sessionTree.annotate(id, title, summary)
    return id
  }
  await send(rootId, '在原对话继续补充评审意见')
  await fork(rootId, '探索回归测试的设计', '示例 · 测试方向', '另开探索继承选定历史，后续消息属于新的原生会话。')
  const design = await fork(rootId, '用架构图解释实现', '示例 · 先弄懂架构', '从同一个起点继续探索，产物可以直接出现在卡片预览中。')
  await fork(design, '从这个设计探索另一种实现', '示例 · 另一种实现', '新探索可以继续分叉；返回已有对话时直接打开，不会新增会话。')
  await fork(design, '解释缓存的边界', '示例 · 理解缓存', '任何会话都能继续，使用 dsh 原生会话和上下文，探索关系长期保存。')
}
