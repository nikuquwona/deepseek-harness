/** Real Session, AgentLoop, fork controller, and disk persistence; only model replies are scripted. */
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionTitle from '@deepseek-ai/dsh-session-title'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createSessionTestRemote } from '../../../api/session-controller/tests/test-remote.ts'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import type {} from '../src/index.ts'
import { treeDomain } from '../src/spec.ts'

let root: string | undefined
let ctx: Context | undefined
afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  vi.restoreAllMocks()
})

async function boot(directory: string, enableTree = true) {
  const context = ctx = new Context()
  const logs: string[] = []
  context.logger.exporter({ export: (record) => { logs.push(record.args.map(String).join(' ')) } })
  context.baseUrl = pathToFileURL(directory).href + '/'
  await mountAgentLoopTestDependencies(context)
  await context.plugin(TypertRegistry)
  const persistence = await context.plugin(Persistence, { root: join(directory,'sessions'), compression: 'none' })
  await context.plugin(Storage)
  await context.plugin(StorageJson, { root: join(directory,'metadata') })
  await context.plugin(StorageDomain, { backend: 'json' })
  await context.plugin(WorkspaceRegistry)
  const harness = await mountAgentLoopTestHarness(context)
  // This established fixture supplies irrelevant upload/desktop integrations;
  // fork, cold reads, Session creation, AgentLoop and persistence remain production code.
  createSessionTestRemote(context, { defaultModelSelection: () => ({ provider:'mock',model:'mock' }), cwd:directory })
  await context.plugin(SessionTitle, { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 })
  for (const name of ['storageDomain','sessionQuery','sessionController','agents']) expect(context.get(name),name).toBeDefined()
  const mountTree = async (): Promise<void> => {
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = undefined
    const path = join(directory,'cordis.yml')
    const plugin = new URL('../src/index.ts',import.meta.url).href
    await writeFile(path, `- id: session-tree\n  name: '${plugin}'\n`)
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
    await context.loader.await()
    for (const entry of context.loader.entries()) await entry.fiber?.await()
    expect(context.sessionTree, `Session Tree activates through Loader: ${logs.join('\n')}`).toBeDefined()
  }
  if (enableTree) await mountTree()
  return { context, harness, mountTree, persistence }
}

const prompt = (text: string) => createUserMessage({ content:[{ type:'text',text }],source:{ kind:'user' } })

it('adopts existing native forks without owning their lifecycle and restores topology and annotations from disk', async () => {
  root = await mkdtemp(join(tmpdir(),'dsh-session-tree-'))
  const { context, harness, mountTree } = await boot(root, false)
  const adapter = new MockAdapter([
    textResponse('Original architecture'),textResponse('Parent-only future'),
    textResponse('Side result\n```mermaid\ngraph LR\n  A --> B\n```\nhttps://github.com/example/project/pull/42'),
    textResponse('Nested exploration'),textResponse('Recursive side result'),
  ])
  context.llm.registerAdapter(['mock'],adapter)
  const parent = await harness.create(SessionId('tree-root'),{ provider:'mock',model:'mock' },{ cwd:root })
  parent.followup(prompt('Design A'))
  await parent.whenIdle()
  const first = parent.session.snapshotEvents().find(event => event.type === 'assistant/message')
  if (first?.type !== 'assistant/message') throw new Error('Expected committed assistant message')
  parent.followup(prompt('Parent B'))
  await parent.whenIdle()
  const original = parent.session.snapshotEvents()
  const { sessionId: childId } = await context.sessionController.fork({ sessionId: parent.id, atSeq: first.seq })
  const child = context.agents.get(childId)
  if (child === undefined) throw new Error('Fork must create a native Agent')
  expect(child.session.snapshotEvents().slice(0,child.session.inheritedEventCount)).toEqual(original.slice(0,first.seq+1))
  child.followup(prompt('Side C'))
  await child.whenIdle()
  expect(JSON.stringify(adapter.requests.at(-1)?.messages)).toContain('Design A')
  expect(JSON.stringify(adapter.requests.at(-1)?.messages)).toContain('Side C')
  expect(JSON.stringify(adapter.requests.at(-1)?.messages)).not.toContain('Parent B')
  expect(parent.session.snapshotEvents()).toEqual(original)
  child.session.append('deliverables/presented', {
    turn: 2, callId: ToolCallId('declared-design'), files: [{ path: 'design.md', description: 'Design notes' }],
  })
  const { sessionId: verticalId } = await context.sessionController.fork({ sessionId: childId })
  const vertical = context.agents.get(verticalId)
  if (vertical === undefined) throw new Error('Nested exploration must create a native Agent')
  vertical.followup(prompt('Explore D'))
  await vertical.whenIdle()
  const { sessionId: recursiveId } = await context.sessionController.fork({ sessionId: childId, atSeq: first.seq })
  const recursive = context.agents.get(recursiveId)
  if (recursive === undefined) throw new Error('Recursive fork must create a native Agent')
  recursive.followup(prompt('Alternative E'))
  await recursive.whenIdle()
  expect(JSON.stringify(adapter.requests.at(-1)?.messages)).not.toContain('Side C')
  // The tree is enabled after native conversations and their forks already exist.
  await mountTree()
  const tree = context.sessionTree
  await tree.annotate(childId,'Review the design','A saved branch with a PR and an architecture diagram')
  const before = await tree.list(new AbortController().signal)
  expect(before.nodes).toHaveLength(4)
  expect(Object.keys(before)).toEqual(['nodes'])
  expect(before.nodes.find(node => node.sessionId === childId)).toMatchObject({
    parentId:parent.id,forkSeq:first.seq,title:'Review the design',messageCount:2,
    artifacts:[{ kind:'diagram' },{ kind:'pull-request' }, { kind:'file', content:'design.md', index:0 }],
  })
  expect(before.nodes.find(node => node.sessionId === verticalId)).toMatchObject({ parentId:childId, artifacts:[] })
  expect(before.nodes.find(node => node.sessionId === recursiveId)).toMatchObject({ parentId:childId, forkSeq:first.seq })

  await context.fiber.dispose()
  ctx = undefined
  const restarted = await boot(root)
  expect(restarted.context.agents.list()).toHaveLength(0)
  const observe = vi.spyOn(restarted.context.sessionQuery, 'observeSession')
  const after = await restarted.context.sessionTree.list(new AbortController().signal)
  expect(after).toEqual(before)
  expect(observe).toHaveBeenCalledTimes(4)
  expect(await restarted.context.sessionTree.list(new AbortController().signal)).toEqual(after)
  expect(observe).toHaveBeenCalledTimes(4)
  const { sessionId: coldFork } = await restarted.context.sessionController.fork({ sessionId: verticalId })
  const restoredChild = restarted.context.agents.get(coldFork)
  expect(restoredChild?.session.header.parentSession).toBe(verticalId)
  expect(restoredChild?.session.deriveMessages()).toEqual(vertical.session.deriveMessages())
  expect((await restarted.context.sessionTree.list(new AbortController().signal)).nodes)
    .toContainEqual(expect.objectContaining({ sessionId: coldFork, parentId: verticalId }))
})

it('uses one native title across map edits and outside renames, without issuing model requests', async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-session-tree-live-'))
  const { context, harness } = await boot(root)
  const adapter = new MockAdapter([])
  context.llm.registerAdapter(['mock'], adapter)
  const agent = await harness.create(SessionId('live-card'), {}, { cwd: root })
  agent.session.append('user/message', prompt('First question'), { surfaceOp: 'append' })
  const observe = vi.spyOn(context.sessionQuery, 'observeSession')
  const first = await context.sessionTree.list(new AbortController().signal)
  expect(first.nodes[0]).toMatchObject({ title: 'First question', messageCount: 1 })
  await context.sessionTree.list(new AbortController().signal)
  expect(observe).toHaveBeenCalledOnce()

  await context.sessionController.rename({ sessionId: agent.id, title: 'Native title' })
  expect((await context.sessionTree.list(new AbortController().signal)).nodes[0]?.title).toBe('Native title')
  expect(observe).toHaveBeenCalledTimes(2)
  await context.sessionTree.annotate(agent.id, ' Custom title ', ' Saved summary ')
  expect((await context.sessionTree.list(new AbortController().signal)).nodes[0]).toMatchObject({
    title: 'Custom title', summary: 'Saved summary', customSummary: 'Saved summary',
  })
  expect(await context.sessionQuery.readTitle(agent.id)).toMatchObject({ title: 'Custom title', source: { kind: 'user' } })
  const readsAfterAnnotation = observe.mock.calls.length
  await context.sessionTree.list(new AbortController().signal)
  expect(observe).toHaveBeenCalledTimes(readsAfterAnnotation)
  await expect(context.sessionTree.annotate(agent.id, '', '')).rejects.toThrow('visible characters')
  await context.sessionController.rename({ sessionId: agent.id, title: 'Renamed in native chat' })
  expect((await context.sessionTree.list(new AbortController().signal)).nodes[0]).toMatchObject({
    title: 'Renamed in native chat', summary: 'Saved summary', customSummary: 'Saved summary',
  })
  const beforeClearingSummary = agent.session.seq
  expect(await context.sessionTree.annotate(agent.id, 'Renamed in native chat', '')).toEqual({ summary: '' })
  expect(agent.session.seq).toBe(beforeClearingSummary)
  expect((await context.sessionTree.list(new AbortController().signal)).nodes[0]).toMatchObject({
    title: 'Renamed in native chat', summary: 'First question', customSummary: '',
  })
  expect(adapter.requests).toHaveLength(0)
})

it('transfers prototype titles into native logs once and leaves only summaries in the annotation domain', async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-session-tree-title-transfer-'))
  const initial = await boot(root, false)
  const id = SessionId('reviewed-prototype-session')
  const agent = await initial.harness.create(id, {}, { cwd: root })
  await initial.context.sessionController.rename({ sessionId: id, title: 'Former native name' })
  await initial.context.sessions.flush(agent.session)
  const legacy = { title: '评审 · 缓存失效验证', summary: 'Keep the reviewer summary.' }
  const domain = await initial.context.storageDomain.open(treeDomain)
  await domain.table('annotations').put(id, legacy)
  await domain.close()
  await initial.context.fiber.dispose()
  ctx = undefined

  const transferred = await boot(root, false)
  const rename = vi.spyOn(transferred.context.sessionController, 'rename')
  await transferred.mountTree()
  expect(rename).toHaveBeenCalledExactlyOnceWith({ sessionId: id, title: legacy.title })
  expect(await transferred.context.sessionQuery.readTitle(id)).toMatchObject({ title: legacy.title, source: { kind: 'user' } })
  const before = await transferred.context.sessionTree.list(new AbortController().signal)
  expect(before.nodes[0]).toMatchObject({ title: legacy.title, summary: legacy.summary, customSummary: legacy.summary })
  expect(before.nodes[0]).not.toHaveProperty('customTitle')
  expect(await transferred.context.sessionTree.list(new AbortController().signal)).toEqual(before)
  expect(rename).toHaveBeenCalledOnce()
  await transferred.context.fiber.dispose()
  ctx = undefined

  const restarted = await boot(root, false)
  const stored = await restarted.context.storageDomain.open(treeDomain)
  expect(stored.table('annotations').get(id)).toEqual({ summary: legacy.summary })
  await stored.close()
  const renamedAgain = vi.spyOn(restarted.context.sessionController, 'rename')
  await restarted.mountTree()
  expect(restarted.context.agents.list()).toHaveLength(0)
  expect(await restarted.context.sessionTree.list(new AbortController().signal)).toEqual(before)
  expect(renamedAgain).not.toHaveBeenCalled()
  await restarted.context.sessionController.rename({ sessionId: id, title: 'Changed outside the map' })
  expect((await restarted.context.sessionTree.list(new AbortController().signal)).nodes[0]?.title).toBe('Changed outside the map')
})

it.each(['missing-session', 'native-rename', 'title-flush', 'no-title-durability', 'summary-write'] as const)(
  'retains prototype annotations after %s fails and retries initialization safely', async (failure) => {
    root = await mkdtemp(join(tmpdir(), 'dsh-session-tree-title-retry-'))
    const initial = await boot(root, false)
    const id = SessionId('retry-prototype-session')
    if (failure !== 'missing-session') {
      const agent = await initial.harness.create(id, {}, { cwd: root })
      await initial.context.sessions.flush(agent.session)
    }
    const legacy = { title: 'Retained prototype title', summary: 'Retained prototype summary' }
    const domain = await initial.context.storageDomain.open(treeDomain)
    await domain.table('annotations').put(id, legacy)
    await domain.close()
    if (failure === 'native-rename') {
      vi.spyOn(initial.context.sessionController, 'rename').mockRejectedValueOnce(new Error('Native rename failed'))
    } else if (failure === 'title-flush') {
      vi.spyOn(initial.context.sessions, 'flush').mockRejectedValueOnce(new Error('Native persistence failed'))
    } else if (failure === 'no-title-durability') {
      vi.spyOn(initial.context.sessions, 'flush').mockResolvedValueOnce(false)
    } else if (failure === 'summary-write') {
      const open = initial.context.storageDomain.open.bind(initial.context.storageDomain)
      vi.spyOn(initial.context.storageDomain, 'open').mockImplementationOnce(async (spec) => {
        const opened = await open(spec)
        vi.spyOn(opened.table('annotations'), 'put').mockRejectedValueOnce(new Error('Annotation persistence failed'))
        return opened
      })
    }
    await expect(initial.mountTree()).rejects.toThrow('could not transfer the legacy title')
    await initial.context.fiber.dispose()
    ctx = undefined

    const restarted = await boot(root, false)
    const retained = await restarted.context.storageDomain.open(treeDomain)
    expect(retained.table('annotations').get(id)).toEqual(legacy)
    await retained.close()
    if (failure === 'missing-session') {
      const agent = await restarted.harness.create(id, {}, { cwd: root })
      await restarted.context.sessions.flush(agent.session)
    }
    const rename = vi.spyOn(restarted.context.sessionController, 'rename')
    await restarted.mountTree()
    expect((await restarted.context.sessionTree.list(new AbortController().signal)).nodes[0])
      .toMatchObject({ title: legacy.title, summary: legacy.summary })
    expect(await restarted.context.sessionQuery.readTitle(id)).toMatchObject({ title: legacy.title, source: { kind: 'user' } })
    if (failure === 'summary-write') expect(rename).not.toHaveBeenCalled()
  },
)

it('invalidates a cold card when persisted content changes without changing event count or byte length', async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-session-tree-cold-'))
  const { context, harness } = await boot(root)
  context.llm.registerAdapter(['mock'], new MockAdapter([textResponse('Original result')]))
  const agent = await harness.create(SessionId('cold-card'), { provider: 'mock', model: 'mock' }, { cwd: root })
  agent.followup(prompt('A question'))
  await agent.whenIdle()
  await context.fiber.dispose()
  ctx = undefined

  const restarted = await boot(root)
  const tree = restarted.context.sessionTree
  const observe = vi.spyOn(restarted.context.sessionQuery, 'observeSession')
  const before = await tree.list(new AbortController().signal)
  expect(before.nodes[0]?.summary).toBe('Original result')
  const logsRoot = join(root, 'sessions')
  const log = (await readdir(logsRoot, { recursive: true })).find(path => path.endsWith('session.v4.jsonl'))
  if (log === undefined) throw new Error('Expected an uncompressed native Session log')
  const path = join(logsRoot, log)
  const original = await readFile(path, 'utf8')
  const replacement = original.replaceAll('Original result', 'Modified result')
  expect(replacement).not.toBe(original)
  expect(Buffer.byteLength(replacement)).toBe(Buffer.byteLength(original))
  await writeFile(path, replacement)
  const modified = new Date(Date.now() + 1000)
  await utimes(path, modified, modified)
  const after = await tree.list(new AbortController().signal)
  expect(after.nodes[0]).toMatchObject({ summary: 'Modified result', lastSeq: before.nodes[0]?.lastSeq })
  expect(observe).toHaveBeenCalledTimes(2)

  const former = restarted.context.sessionPersistence.identity
  const revision = (await restarted.context.sessionPersistence.stat(agent.id))?.revision
  await restarted.persistence.dispose()
  await restarted.context.plugin(Persistence, { root: logsRoot, compression: 'none' })
  expect(restarted.context.sessionPersistence.identity).not.toBe(former)
  expect((await restarted.context.sessionPersistence.stat(agent.id))?.revision).toBe(revision)
  expect(await tree.list(new AbortController().signal)).toEqual(after)
  expect(observe).toHaveBeenCalledTimes(3)
})

it('cancels refreshes and releases the plugin while preserving native Sessions', async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-session-tree-dispose-'))
  const { context, harness } = await boot(root)
  const agent = await harness.create(SessionId('surviving-session'), {}, { cwd: root })
  const tree = context.sessionTree
  const cancelled = new AbortController()
  cancelled.abort(new Error('Refresh superseded'))
  await expect(tree.list(cancelled.signal)).rejects.toThrow('Refresh superseded')

  const entered = Promise.withResolvers<undefined>()
  vi.spyOn(context.sessionQuery, 'listSessions').mockImplementationOnce(signal => new Promise((_resolve, reject) => {
    if (signal === undefined) throw new Error('Expected cancellation for pending listing')
    signal.addEventListener('abort', () => { reject(new Error('Listing aborted')) }, { once: true })
    entered.resolve(undefined)
  }))
  const pending = tree.list(new AbortController().signal)
  const rejected = expect(pending).rejects.toThrow()
  await entered.promise
  const entry = [...context.loader.entries()].find(candidate => candidate.options.id === 'session-tree')
  if (entry?.fiber === undefined) throw new Error('Expected the Loader-owned tree plugin')
  await entry.fiber.dispose()
  await rejected
  expect(context.get('sessionTree')).toBeUndefined()
  expect(context.agents.get(agent.id)).toBe(agent)
  await expect(tree.list(new AbortController().signal)).rejects.toThrow()
})
