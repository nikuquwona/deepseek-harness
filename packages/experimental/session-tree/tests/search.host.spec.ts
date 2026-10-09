/** Plugin-owned snippets over the unmodified public Session query helpers. */
import { expect, it } from 'vitest'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import { findMessageSnippet } from '../src/search.ts'

const id = SessionId('message-search')
const message = (seq: number, text: string): SessionEvent<'user/message'> => ({
  type: 'user/message', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
  data: createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
})

it('finds Chinese fragments and single characters with native literal text matching', () => {
  const text = '评审递归分支 B：进一步验证缓存失效测试'
  const events = [message(0, text)]
  for (const query of ['递归分支', '失效', '效']) {
    expect(findMessageSnippet(id, events, query, 240)).toBe(text)
  }
  expect(findMessageSnippet(id, events, '不存在', 240)).toBeNull()
})

it('keeps case-insensitive substrings, accents, punctuation, and flexible whitespace', () => {
  const events = [message(0, 'BRAID Café FlowChart OR\n*\t[B] "quoted"')]
  for (const query of ['ai', 'CAFÉ', 'FLOWCHART', 'OR * [B]', '*', '"quoted"']) {
    expect(findMessageSnippet(id, events, query, 240)).toBe('BRAID Café FlowChart OR * [B] "quoted"')
  }
  for (const query of ['cafe', 'OR[B]', '"FlowChart"', '.*']) {
    expect(findMessageSnippet(id, events, query, 240)).toBeNull()
  }
})

it('searches only current user and assistant messages, including the replacement surface', () => {
  const events: SessionEvent[] = [
    message(0, 'shadowed 失效'),
    { ...message(1, 'current 通过'), surfaceOp: { op: 'replace', startSeq: SessionSeq(0), endSeq: SessionSeq(0) }, sourceEventSeqs: [SessionSeq(0)] },
    { type: 'tool/result', seq: SessionSeq(2), time: 2, surfaceOp: 'append', data: {
      turn: 1, step: 1, message: createToolResultMessage({
        callId: ToolCallId('tool-search'), content: [{ type: 'text', text: 'tool-only 失效' }], isError: false,
      }),
    } },
    { type: 'turn/end', seq: SessionSeq(3), time: 3, data: {
      turn: 1, reason: { kind: 'error', error: { message: 'log-only 失效', code: 'UNKNOWN' } },
    } },
    { type: 'assistant/message', seq: SessionSeq(4), time: 4, surfaceOp: 'append', data: {
      turn: 2, step: 2, stream: [], message: createAssistantMessage({
        content: [{ type: 'text', text: 'latest 通过' }], source: { provider: 'test', model: 'test' },
      }),
    } },
  ]
  expect(findMessageSnippet(id, events, '失效', 240)).toBeNull()
  expect(findMessageSnippet(id, events, '通过', 240)).toBe('latest 通过')
})

it('centers bounded Unicode snippets on a match after non-BMP text', () => {
  const events = [message(0, `${'😀'.repeat(30)}递归分支缓存失效测试${'尾'.repeat(30)}`)]
  const snippet = findMessageSnippet(id, events, '失效', 18)
  expect(snippet).toContain('失效')
  expect(Array.from(snippet ?? '')).toHaveLength(18)
  expect(snippet).not.toContain('\uFFFD')
  expect(findMessageSnippet(id, events, '失效', 3)).toBe('…失…')
  expect(findMessageSnippet(id, [message(0, '开头失效' + '尾'.repeat(40))], '开头', 12)).toBe('开头失效尾尾尾尾尾尾…')
  expect(findMessageSnippet(id, [message(0, '前'.repeat(40) + '失效')], '失效', 12)).toBe('…前前前失效')
})
