/** Injected context is preserved by Session forks but must not appear as user-authored card text. */
import { expect, it } from 'vitest'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import { projectArtifacts, projectMessages, visibleText } from '../src/preview.ts'

function assistant(seq: number, text: string): SessionEvent<'assistant/message'> {
  return {
    type: 'assistant/message', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
    data: { turn: 1, step: 1, stream: [], message: createAssistantMessage({
      content: [{ type: 'text', text }], source: { provider: 'preview', model: 'fixture' },
    }) },
  }
}

function tool(seq: number, text: string, isError = false): SessionEvent<'tool/result'> {
  return {
    type: 'tool/result', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
    data: { turn: 1, step: 1, message: createToolResultMessage({
      callId: ToolCallId(`call-${seq}`), content: [{ type: 'text', text }], isError,
    }) },
  }
}

it('excludes injected user-role context without renumbering visible fork positions', () => {
  const events: SessionEvent[] = [
    { type: 'user/message', seq: SessionSeq(2), time: 0, surfaceOp: 'append',
      data: createUserMessage({ content: [{ type: 'text', text: 'My question' }], source: { kind: 'user' } }) },
    { type: 'user/message', seq: SessionSeq(4), time: 0, surfaceOp: 'append',
      data: createUserMessage({ content: [{ type: 'text', text: 'Injected system context' }], source: { kind: 'system-prompt' } }) },
    { type: 'user/message', seq: SessionSeq(8), time: 0, surfaceOp: 'append',
      data: createUserMessage({ content: [{ type: 'text', text: 'My followup' }], source: { kind: 'user' } }) },
  ]
  expect(projectMessages(events, 5)).toEqual([
    { seq: 2, role: 'user', text: 'My question', inherited: true },
    { seq: 8, role: 'user', text: 'My followup', inherited: false },
  ])
  expect(events.map(visibleText)).toEqual(['My question', '', 'My followup'])
  expect(JSON.stringify(events)).toContain('Injected system context')
})

it('keeps append-origin conversation text and excludes model-only replacement copies', () => {
  const original = assistant(2, 'Visible response')
  const replacement: SessionEvent<'assistant/message'> = {
    ...assistant(4, 'Replacement summary'),
    surfaceOp: { op: 'replace', startSeq: SessionSeq(2), endSeq: SessionSeq(2) },
  }
  expect(projectMessages([original, replacement], 0)).toEqual([
    { seq: 2, role: 'assistant', text: 'Visible response', inherited: false },
  ])
  expect(visibleText(replacement)).toBe('')
})

it('retains native file declaration coordinates and the latest occurrence of each path', () => {
  const first: SessionEvent<'deliverables/presented'> = {
    type: 'deliverables/presented', seq: SessionSeq(8), time: 8,
    data: { turn: 1, callId: ToolCallId('present-a'), files: [
      { path: '/workspace/a.md', description: 'Notes' }, { path: 'C:\\work\\b.pdf' },
    ] },
  }
  const later: SessionEvent<'deliverables/presented'> = {
    type: 'deliverables/presented', seq: SessionSeq(12), time: 12,
    data: { turn: 2, callId: ToolCallId('present-b'), files: [
      { path: '/workspace/c.txt' }, { path: '/workspace/a.md', description: 'Updated notes' },
    ] },
  }
  expect(projectArtifacts([first], 10)).toEqual([
    { kind: 'file', label: 'Notes', content: '/workspace/a.md', seq: 8, index: 0 },
    { kind: 'file', label: 'b.pdf', content: 'C:\\work\\b.pdf', seq: 8, index: 1 },
  ])
  expect(projectArtifacts([first, later], 2)).toEqual([
    { kind: 'file', label: 'c.txt', content: '/workspace/c.txt', seq: 12, index: 0 },
    { kind: 'file', label: 'Updated notes', content: '/workspace/a.md', seq: 12, index: 1 },
  ])
})

it('keeps textual references without treating failed results or model-only copies as results', () => {
  const text = '```mermaid\ngraph LR\nA --> B\n```\nhttps://github.com/example/project/pull/42\nhttps://github.com/example/project/commit/abcdef0'
  const failed = tool(3, `[topic abcdef0] A commit-looking line\n${text}`, true)
  const replacement: SessionEvent<'assistant/message'> = {
    ...assistant(4, text), surfaceOp: { op: 'replace', startSeq: SessionSeq(0), endSeq: SessionSeq(0) },
  }
  expect(projectArtifacts([failed, replacement], 10)).toEqual([])
  expect(projectArtifacts([assistant(5, text), tool(6, '[topic abcdef0] A commit-looking line')], 10))
    .toEqual([
      { kind: 'diagram', label: 'Mermaid', content: 'graph LR\nA --> B', seq: 5 },
      { kind: 'pull-request', label: 'project/pull/42', content: 'https://github.com/example/project/pull/42', seq: 5 },
      { kind: 'link', label: 'abcdef0', content: 'https://github.com/example/project/commit/abcdef0', seq: 5 },
      { kind: 'commit', label: 'abcdef0', content: 'A commit-looking line', seq: 6 },
    ])
})
