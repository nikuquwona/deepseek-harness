/** Assembled opt-in map navigation over real Session turns, delivery declarations, and native forks. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { expect, it, onTestFailed, onTestFinished } from 'vitest'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { LlmAdapter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-plugin-manager'
import type {} from '@deepseek-ai/dsh-experimental-session-tree'
import type {} from '@deepseek-ai/dsh-tool-present/types'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot, writeComposerDraft } from './support.ts'

const MODE = webSnapshotMode()
const DIRECTORY = fileURLToPath(new URL('./expected/session-tree', import.meta.url))
const OVERLAY = fileURLToPath(new URL('./session-tree.overlay.yml', import.meta.url))
const SOURCE_OVERLAY = fileURLToPath(new URL('../../../packages/experimental/session-tree/cordis.source.patch.yml', import.meta.url))
const PICKER = fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url))
const BUNDLE = fileURLToPath(new URL('../../../packages/experimental/session-tree-bundle', import.meta.url))
const BUNDLE_NAME = '@deepseek-ai/dsh-experimental-session-tree-bundle'
const PROVIDER = 'session-tree-browser-test'
const MODEL = 'delivery-plan'
const PROMPT = 'Explore the delivery plan'
const DRAFT = 'Keep this thought on the original conversation.'
const MAP_TITLE = 'Delivery map naming check'
const NATIVE_TITLE = 'Delivery chat naming check'
const SUMMARY = 'Explore delivery alternatives.'
const PR = 'https://github.com/example/project/pull/17'
const REPLY = `Delivery plan ready.

\`\`\`mermaid
flowchart TD
  %% 评审递归分支 B：进一步验证缓存失效测试。
  Idea --> Explore
  Explore --> Report
\`\`\`

PR reference: ${PR}`

/** Only the model is scripted; present executes through the shipped tool registry and loop. */
class DeliveryPlanAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override async listModels(provider: string) {
    return [{ provider, id: MODEL, name: 'Delivery plan fixture' }]
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.requests.length === 1) {
      const id = ToolCallId('session-tree-present-report')
      const args = JSON.stringify({ files: [{ path: 'report.txt', description: 'Delivery report' }] })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: 'present', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'present', arguments: args } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (this.requests.length !== 2) throw new Error('The map must not issue another model request')
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: REPLY } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

it('adds only map rows without replacing native plugins or their search configuration', () => {
  const shipped = ['../../../packages/bundle/base/cordis.patch.yml', '../../../packages/bundle/web-app/cordis.patch.yml']
    .map(path => loadOverlayPatches('session-tree test', fileURLToPath(new URL(path, import.meta.url))))
  expect(composeEntries(shipped).find(entry => entry.id === 'session-query-sqlite')?.config)
    .toEqual({ path: ':memory:', openAt: 'never' })
  const warnings: string[] = []
  for (const path of [SOURCE_OVERLAY, join(BUNDLE, 'cordis.patch.yml')]) {
    const enabled = composeEntries([...shipped, loadOverlayPatches('session-tree test', path)], warning => warnings.push(warning))
    expect(enabled.filter(entry => !['session-tree', 'client-ui-session-tree'].includes(entry.id ?? '')))
      .toEqual(composeEntries(shipped))
    expect(enabled.filter(entry => ['session-tree', 'client-ui-session-tree'].includes(entry.id ?? ''))).toHaveLength(2)
  }
  expect(warnings).toEqual([])
})

it.skipIf(MODE === 'record')('maps native forks and previews, searches messages, and shares conversation names without losing drafts', async () => {
  const resources: { browser?: Browser; scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    try { await resources.browser?.close() } finally { await resources.scaffold?.close() }
  })
  const scaffold = await launchWebScaffold({
    extraOverlayPath: [OVERLAY, PICKER],
    profile: { packages: [{ dir: BUNDLE, enabled: false }] },
  })
  resources.scaffold = scaffold
  const adapter = new DeliveryPlanAdapter()
  scaffold.ctx.effect(() => scaffold.ctx.llm.registerAdapter([PROVIDER], adapter), 'session-tree browser model')
  await scaffold.ctx.agentDefaultModel.saveSelection({ provider: PROVIDER, model: MODEL })
  const browser = await chromium.launch()
  resources.browser = browser
  const page = await newEnglishPage(browser)
  onTestFailed(() => saveFailureShot(page, 'session-tree'))
  const tripwire = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await connectFreshWorkspace(page, scaffold.workspaceCwd)
  expect(scaffold.ctx.get('sessionTree')).toBeUndefined()
  expect(await page.getByRole('button', { name: 'Conversation map', exact: true }).count()).toBe(0)
  const installed = (await scaffold.ctx.pluginManager.listBundles()).find(bundle => bundle.name === BUNDLE_NAME)
  expect(installed).toMatchObject({ installed: true, enabled: false, overrides: [] })
  expect(installed?.rows.map(row => row.rowId)).toEqual(['session-tree', 'client-ui-session-tree'])
  expect(await scaffold.ctx.pluginManager.setBundleEnabled(BUNDLE_NAME, true)).toMatchObject({ application: 'applied' })
  await page.getByRole('navigation', { name: 'Global panels' }).getByRole('button', { name: 'Conversation map', exact: true }).waitFor()
  await writeFile(join(scaffold.workspaceCwd, 'workspace', 'report.txt'), 'Prepared delivery report.\n')
  const composer = page.locator('[data-composer-input]').last()
  await writeComposerDraft(page, composer, PROMPT)
  const settled = scaffold.whenTurnSettled()
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  const rootId = await settled
  await page.getByText('Delivery plan ready.', { exact: true }).waitFor()
  expect(adapter.requests).toHaveLength(2)
  const root = scaffold.ctx.sessions.get(rootId)
  if (root === undefined) throw new Error('The submitted conversation is not live')
  const events = root.snapshotEvents()
  const presented = events.find(event => event.type === 'deliverables/presented')
  expect(presented?.data.files).toEqual([{ path: 'report.txt', description: 'Delivery report' }])
  const forkPoint = events.findLast(event => event.type === 'turn/end')
  if (forkPoint === undefined) throw new Error('The delivery turn did not close')
  const sessionIds = async () => (await scaffold.ctx.sessionQuery.listSessions(new AbortController().signal))
    .filter(record => record.header.origin !== 'subagent').map(record => record.header.id).sort()
  expect(await sessionIds()).toEqual([rootId])

  await writeComposerDraft(page, composer, DRAFT)
  const openMap = page.locator('[data-slot="conversation.session.header.actions"]')
    .getByRole('button', { name: 'Conversation map', exact: true })
  await openMap.click()
  const map = page.getByRole('region', { name: 'Conversation map', exact: true })
  const rootCard = map.locator(`article[data-session-id="${rootId}"]`)
  await rootCard.getByRole('button', { name: `Open conversation: ${PROMPT}`, exact: true }).click()
  await page.locator(`[data-conversation-session="${rootId}"]`).waitFor()
  await expect.poll(() => composer.innerText()).toBe(DRAFT)
  expect(await sessionIds()).toEqual([rootId])

  await openMap.click()
  const results = map.getByRole('region', { name: 'Matching conversations', exact: true })
  const bodyMatch = results.getByRole('button', { name: PROMPT, exact: true })
  for (const query of ['递归分支', '失效', '效', 'FLOWCHART']) {
    expect((await rootCard.innerText()).toLowerCase()).not.toContain(query.toLowerCase())
    await map.getByRole('textbox', { name: 'Find a conversation', exact: true }).fill(query)
    await bodyMatch.waitFor({ timeout: 10_000 })
    expect((await bodyMatch.innerText()).toLowerCase()).toContain(query.toLowerCase())
    await bodyMatch.click()
    await results.waitFor({ state: 'detached' })
  }
  await rootCard.getByRole('button', { name: 'Details', exact: true }).click()
  const details = page.getByRole('dialog', { name: PROMPT, exact: true })
  const diagram = details.getByRole('img', { name: 'Diagram preview', exact: true })
  await expect.poll(() => diagram.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  expect(await details.getByRole('link', { name: PR, exact: true }).getAttribute('href')).toBe(PR)
  await details.getByText('Presented file · Delivery report', { exact: true }).waitFor()
  await compareOrRefreshGolden(join(DIRECTORY, 'details.expected.md'),
    await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), MODE)
  await details.getByRole('button', { name: 'View file in conversation', exact: true }).click()
  await page.locator(`[data-conversation-session="${rootId}"]`).waitFor()
  await page.locator('[data-presented-file]').filter({ hasText: 'report.txt' }).waitFor()
  await expect.poll(() => composer.innerText()).toBe(DRAFT)
  expect(await sessionIds()).toEqual([rootId])

  await page.locator('[data-turn-tail="1"]').getByRole('button', { name: 'Branch into a new conversation', exact: true }).click()
  await expect.poll(() => scaffold.ctx.agents.list().find(agent => agent.session.header.parentSession === rootId)).toBeDefined()
  const child = scaffold.ctx.agents.list().find(agent => agent.session.header.parentSession === rootId)
  if (child === undefined) throw new Error('The native branch action did not create a child')
  expect(child.session.inheritedEventCount).toBe(forkPoint.seq + 1)
  expect(child.session.snapshotEvents().slice(0, child.session.inheritedEventCount)).toEqual(events.slice(0, forkPoint.seq + 1))
  await page.locator(`[data-conversation-session="${child.id}"]`).waitFor()
  await expect.poll(() => composer.innerText()).toBe('')
  expect(await sessionIds()).toEqual([rootId, child.id].sort())

  await openMap.click()
  const childCard = map.locator(`article[data-session-id="${child.id}"]`)
  await childCard.getByRole('button', { name: `From · ${PROMPT}`, exact: true }).waitFor()
  await rootCard.getByRole('button', { name: 'Collapse explorations', exact: true }).waitFor()
  await expect.poll(() => map.locator('article[data-session-id]').count()).toBe(2)
  expect(await map.locator('[role="region"] > div > svg[aria-hidden="true"] > path').count()).toBe(1)
  await map.getByRole('button', { name: 'Fit map', exact: true }).click()
  const thumbnail = rootCard.getByRole('img', { name: 'Diagram preview', exact: true })
  await expect.poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  await compareOrRefreshGolden(join(DIRECTORY, 'map.expected.md'),
    await captureStableAria(page, 'section[aria-label="Conversation map"]', scaffold.workspaceCwd), MODE)
  await rootCard.getByRole('button', { name: `Open conversation: ${PROMPT}`, exact: true }).click()
  await page.locator(`[data-conversation-session="${rootId}"]`).waitFor()
  await expect.poll(() => composer.innerText()).toBe(DRAFT)
  expect(await sessionIds()).toEqual([rootId, child.id].sort())

  await openMap.click()
  await rootCard.getByRole('button', { name: 'Details', exact: true }).click()
  await details.getByRole('button', { name: 'Edit card', exact: true }).click()
  const name = details.getByRole('textbox', { name: 'Conversation name', exact: true })
  expect(await name.inputValue()).toBe(PROMPT)
  await name.fill(MAP_TITLE)
  await details.getByRole('textbox', { name: 'Card summary', exact: true }).fill(SUMMARY)
  await details.getByRole('button', { name: 'Save card', exact: true }).click()
  const renamedDetails = page.getByRole('dialog', { name: MAP_TITLE, exact: true })
  await renamedDetails.getByRole('button', { name: 'Edit card', exact: true }).waitFor()
  expect(root.snapshotEvents().findLast(event => event.type === 'session/title')?.data.title).toBe(MAP_TITLE)
  await renamedDetails.getByRole('button', { name: 'Open conversation', exact: true }).click()
  const header = page.getByRole('navigation', { name: 'Session hierarchy', exact: true })
  await header.getByText(MAP_TITLE, { exact: true }).waitFor()
  await expect.poll(() => composer.innerText()).toBe(DRAFT)

  const row = page.locator(`[data-row-key="session:${rootId}"]`)
  await row.getByText(MAP_TITLE, { exact: true }).dblclick()
  const rename = page.getByRole('dialog', { name: 'Rename session', exact: true })
  await rename.getByRole('textbox', { name: 'Session name', exact: true }).fill(NATIVE_TITLE)
  await rename.getByRole('button', { name: 'Rename', exact: true }).click()
  await rename.waitFor({ state: 'detached' })
  await header.getByText(NATIVE_TITLE, { exact: true }).waitFor()
  await openMap.click()
  await rootCard.getByRole('button', { name: `Open conversation: ${NATIVE_TITLE}`, exact: true }).waitFor()
  await rootCard.getByText(SUMMARY, { exact: true }).waitFor()
  await rootCard.getByRole('button', { name: 'Details', exact: true }).click()
  const nativeDetails = page.getByRole('dialog', { name: NATIVE_TITLE, exact: true })
  await nativeDetails.getByRole('button', { name: 'Edit card', exact: true }).click()
  expect(await nativeDetails.getByRole('textbox', { name: 'Conversation name', exact: true }).inputValue()).toBe(NATIVE_TITLE)
  await nativeDetails.getByRole('button', { name: 'Open conversation', exact: true }).click()
  await expect.poll(() => composer.innerText()).toBe(DRAFT)
  // Recompose the installed bundle in the same process and browser document.
  // Existing native Sessions and card summaries outlive both plugin halves.
  const initialTimeOrigin = await page.evaluate(() => performance.timeOrigin)
  for (let cycle = 0; cycle < 2; cycle++) {
    await openMap.click()
    expect(await scaffold.ctx.pluginManager.setBundleEnabled(BUNDLE_NAME, false)).toMatchObject({ application: 'applied' })
    await map.waitFor({ state: 'detached' })
    await expect.poll(() => page.getByRole('button', { name: 'Conversation map', exact: true }).count()).toBe(0)
    expect(scaffold.ctx.get('sessionTree')).toBeUndefined()
    expect(scaffold.ctx.sessions.get(rootId)).toBe(root)
    expect(await sessionIds()).toEqual([rootId, child.id].sort())
    expect(await scaffold.ctx.pluginManager.setBundleEnabled(BUNDLE_NAME, true)).toMatchObject({ application: 'applied' })
    await openMap.waitFor()
    await openMap.click()
    await rootCard.getByText(SUMMARY, { exact: true }).waitFor()
    await rootCard.getByRole('button', { name: `Open conversation: ${NATIVE_TITLE}`, exact: true }).click()
    await expect.poll(() => composer.innerText()).toBe(DRAFT)
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialTimeOrigin)
    expect(await page.getByRole('button', { name: 'Conversation map', exact: true }).count()).toBe(2)
  }
  expect(await sessionIds()).toEqual([rootId, child.id].sort())
  expect(adapter.requests).toHaveLength(2)
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
  await assertFixtureInventory(DIRECTORY, ['details.expected.md', 'map.expected.md'])
})
