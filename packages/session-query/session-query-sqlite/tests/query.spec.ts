import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SessionSearchCursor, type SessionQueryErrorCode } from '@deepseek-ai/dsh-session-query'
import {
  buildEventWhere,
  buildSessionWhere,
  createLiteralHighlighter,
  FTS_HIGHLIGHT_END,
  FTS_HIGHLIGHT_START,
  makeSnippet,
  normalizeEventRequest,
  normalizeSessionRequest,
  quoteFtsData,
  requestFingerprint,
  SQLITE_FTS5_OUTER_PREDICATE_LIMIT,
  SQLITE_MAX_PAGE_LIMIT,
  type NormalizedEventRequest,
  type NormalizedSessionRequest,
} from '../src/query.ts'

const limits = { defaultLimit: 2, maxLimit: 3 }

function expectCode(code: SessionQueryErrorCode): Error {
  return expect.objectContaining({ code }) as Error
}

describe('SQLite search request normalization', () => {
  it('normalizes both scopes, defaults arrays and limits, and preserves cursors', () => {
    expect(normalizeSessionRequest({ query: '  alpha\n beta  ' }, limits)).toEqual({
      query: 'alpha beta',
      mode: 'phrase',
      sessionFilters: [],
      eventFilters: [],
      limit: 2,
    })
    expect(normalizeSessionRequest({
      query: 'needle',
      mode: 'phrase',
      sessionFilters: [{ kind: 'availability', values: ['live'] }],
      eventFilters: [{ kind: 'surface', values: ['current'] }],
      limit: 3,
      cursor: SessionSearchCursor('next'),
    }, limits)).toEqual({
      query: 'needle',
      mode: 'phrase',
      sessionFilters: [{ kind: 'availability', values: ['live'] }],
      eventFilters: [{ kind: 'surface', values: ['current'] }],
      limit: 3,
      cursor: SessionSearchCursor('next'),
    })
    expect(normalizeEventRequest({ sessionId: SessionId('s'), query: 'needle' }, limits)).toEqual({
      sessionId: SessionId('s'),
      query: 'needle',
      mode: 'phrase',
      filters: [],
      limit: 2,
    })
    expect(normalizeEventRequest({
      sessionId: SessionId('s'),
      query: 'needle',
      mode: 'phrase',
      filters: [{ kind: 'seq', from: 1 }],
      cursor: SessionSearchCursor('next'),
    }, limits)).toEqual({
      sessionId: SessionId('s'),
      query: 'needle',
      mode: 'phrase',
      filters: [{ kind: 'seq', from: 1 }],
      limit: 2,
      cursor: SessionSearchCursor('next'),
    })
  })

  it('rejects non-text, blank, non-integer, non-positive, and oversized requests', () => {
    expect(() => normalizeSessionRequest({ query: 1 as never }, limits))
      .toThrow(expectCode('SESSION_QUERY_INVALID_QUERY'))
    expect(() => normalizeSessionRequest({ query: ' \n ' }, limits))
      .toThrow(expectCode('SESSION_QUERY_INVALID_QUERY'))
    expect(() => normalizeSessionRequest({ query: 'bad\0query' }, limits))
      .toThrow(expectCode('SESSION_QUERY_INVALID_QUERY'))
    expect(() => normalizeEventRequest({ sessionId: 1 as never, query: 'x' }, limits))
      .toThrow(expectCode('SESSION_QUERY_INVALID_FILTER'))
    expect(() => normalizeEventRequest({
      sessionId: SessionId('s'),
      query: 'x',
      cursor: 1 as never,
    }, limits)).toThrow(expectCode('SESSION_QUERY_INVALID_CURSOR'))
    expect(() => normalizeSessionRequest({
      query: 'x',
      eventFilters: [{ kind: 'text', text: 'x' } as never],
    }, limits)).toThrow(expectCode('SESSION_QUERY_INVALID_FILTER'))
    expect(() => normalizeSessionRequest({
      query: 'x',
      eventFilters: [{} as never],
    }, limits)).toThrow(expectCode('SESSION_QUERY_INVALID_FILTER'))
    for (const limit of [1.5, 0, 4]) {
      expect(() => normalizeEventRequest({ sessionId: SessionId('s'), query: 'x', limit }, limits))
        .toThrow(expectCode('SESSION_QUERY_INVALID_LIMIT'))
    }
    expect(() => normalizeEventRequest({
      sessionId: SessionId('s'),
      query: 'x',
      limit: SQLITE_MAX_PAGE_LIMIT + 1,
    }, { defaultLimit: 1, maxLimit: SQLITE_MAX_PAGE_LIMIT + 1 }))
      .toThrow(expectCode('SESSION_QUERY_INVALID_LIMIT'))
  })

  it('materializes owned filter values during normalization', () => {
    const values = ['live'] as Array<'live' | 'persisted'>
    const filter = { kind: 'availability' as const, values }
    const request = { query: 'needle', sessionFilters: [filter] }
    const normalized = normalizeSessionRequest(request, limits)

    values[0] = 'persisted'
    request.sessionFilters.push({ kind: 'availability', values: ['persisted'] })
    expect(normalized.sessionFilters).toEqual([{ kind: 'availability', values: ['live'] }])
  })

  it('defaults to phrase matching and separates literal cursor identities', () => {
    const phrase = normalizeSessionRequest({ query: '递归分支' }, limits)
    expect(phrase).toEqual(normalizeSessionRequest({ query: '递归分支', mode: 'phrase' }, limits))
    const literal = normalizeSessionRequest({ query: '递归分支', mode: 'literal' }, limits)
    expect(literal.mode).toBe('literal')
    expect(requestFingerprint(literal)).not.toBe(requestFingerprint(phrase))
    const event = normalizeEventRequest({ sessionId: SessionId('s'), query: '失效', mode: 'literal' }, limits)
    expect(event.mode).toBe('literal')
    expect(requestFingerprint(event)).not.toBe(requestFingerprint({ ...event, mode: 'phrase' }))
    expect(() => normalizeSessionRequest({ query: 'word', mode: 'regex' as never }, limits))
      .toThrow(expectCode('SESSION_QUERY_INVALID_QUERY'))
  })
})

describe('SQLite search predicate compilation', () => {
  it('compiles all logical-session clauses including empty and nullable values', () => {
    expect(buildSessionWhere([])).toEqual({ sql: '', params: [], predicateCount: 0 })
    expect(buildSessionWhere([{ kind: 'id', values: [] }])).toEqual({
      sql: '0',
      params: [],
      predicateCount: 1,
    })
    expect(buildSessionWhere([{ kind: 'id', values: [SessionId('a'), SessionId('b')] }])).toEqual({
      sql: 'session_id IN (?, ?)',
      params: [SessionId('a'), SessionId('b')],
      predicateCount: 1,
    })
    expect(buildSessionWhere([{ kind: 'cwd', values: [] }])).toEqual({
      sql: '0',
      params: [],
      predicateCount: 1,
    })
    expect(buildSessionWhere([{ kind: 'cwd', values: [null] }])).toEqual({
      sql: '(cwd IS NULL)',
      params: [],
      predicateCount: 1,
    })
    expect(buildSessionWhere([{ kind: 'cwd', values: ['/a'] }])).toEqual({
      sql: '(cwd IN (?))',
      params: ['/a'],
      predicateCount: 1,
    })
    expect(buildSessionWhere([{ kind: 'parent', values: [SessionId('p'), null] }])).toEqual({
      sql: '(parent_session IN (?) OR parent_session IS NULL)',
      params: [SessionId('p')],
      predicateCount: 1,
    })
    expect(buildSessionWhere([
      { kind: 'created-at', from: 1, to: 2 },
      { kind: 'availability', values: [] },
      { kind: 'availability', values: ['live', 'live'] },
      { kind: 'availability', values: ['live', 'persisted'] },
    ])).toEqual({
      sql: 'CAST(created_at AS INTEGER) >= ? AND CAST(created_at AS INTEGER) <= ? AND 0 AND live = 1',
      params: [1, 2],
      predicateCount: 4,
    })
    expect(buildSessionWhere([{ kind: 'created-at' }])).toEqual({
      sql: '',
      params: [],
      predicateCount: 0,
    })
  })

  it('compiles every event clause and empty lists', () => {
    expect(buildEventWhere([
      { kind: 'seq', from: 1 },
      { kind: 'time', to: 9 },
      { kind: 'type', values: ['user/message'] },
      { kind: 'surface', values: ['current', 'log-only'] },
    ])).toEqual({
      sql: 'CAST(seq AS INTEGER) >= ? AND CAST(time AS INTEGER) <= ? AND type IN (?) AND surface IN (?, ?)',
      params: [1, 9, 'user/message', 'current', 'log-only'],
      predicateCount: 4,
    })
    expect(buildEventWhere([
      { kind: 'type', values: [] },
      { kind: 'surface', values: [] },
    ])).toEqual({ sql: '0 AND 0', params: [], predicateCount: 2 })
  })

  it('rejects predicate builders above the supported FTS5 outer budget', () => {
    const filters = Array.from(
      { length: SQLITE_FTS5_OUTER_PREDICATE_LIMIT },
      () => ({ kind: 'id' as const, values: [SessionId('safe')] }),
    )

    expect(buildSessionWhere(filters).predicateCount).toBe(SQLITE_FTS5_OUTER_PREDICATE_LIMIT)
    expect(() => buildSessionWhere([
      ...filters,
      { kind: 'id', values: [SessionId('over')] },
    ])).toThrow(expectCode('SESSION_QUERY_INVALID_FILTER'))
  })

  it('rejects runtime-unknown filter discriminants in both SQL builders', () => {
    expect(() => buildSessionWhere([{ kind: 'future' } as never]))
      .toThrow(expectCode('SESSION_QUERY_INVALID_FILTER'))
    expect(() => buildEventWhere([{ kind: 'future' } as never]))
      .toThrow(expectCode('SESSION_QUERY_INVALID_FILTER'))
    expect(() => buildSessionWhere([{ kind: 'availability', values: ['future'] } as never]))
      .toThrow(expectCode('SESSION_QUERY_INVALID_FILTER'))
    expect(() => buildSessionWhere([{} as never]))
      .toThrow(expectCode('SESSION_QUERY_INVALID_FILTER'))
  })
})

describe('SQLite query identity and presentation', () => {
  it('marks literal Unicode substrings and punctuation without changing source text', () => {
    const mark = (text: string) => `${FTS_HIGHLIGHT_START}${text}${FTS_HIGHLIGHT_END}`
    const search = createLiteralHighlighter('失效')
    expect(search('进一步验证缓存失效测试')).toBe(`进一步验证缓存${mark('失效')}测试`)
    expect(search('失效失效')).toBe(`${mark('失效')}${mark('失效')}`)
    expect(search('命中')).toBeNull()
    expect(createLiteralHighlighter('aI')('BRAID')).toBe(`BR${mark('AI')}D`)
    expect(createLiteralHighlighter('Café')('CAFÉ')).toBe(mark('CAFÉ'))
    expect(createLiteralHighlighter('cafe')('café')).toBeNull()
    expect(createLiteralHighlighter('OR * [B]')('x OR\n*\t[B] y')).toBe(`x ${mark('OR\n*\t[B]')} y`)
    expect(createLiteralHighlighter('"B"')('B')).toBeNull()
    expect(createLiteralHighlighter('哈哈')('哈哈哈')).toBe(`${mark('哈哈')}哈`)
  })

  it('quotes all caller MATCH syntax as data', () => {
    expect(quoteFtsData('say "needle" OR *')).toBe('"say ""needle"" OR *"')
  })

  it('canonicalizes request and filter ordering in both scopes', () => {
    const sessionA: NormalizedSessionRequest = {
      query: 'needle',
      mode: 'phrase',
      limit: 2,
      sessionFilters: [
        { kind: 'cwd', values: ['/b', '/a'] },
        { kind: 'parent', values: [null, SessionId('p')] },
        { kind: 'id', values: [SessionId('same'), SessionId('same')] },
        { kind: 'created-at', from: 1 },
      ],
      eventFilters: [{ kind: 'time', to: 9 }],
    }
    const sessionB: NormalizedSessionRequest = {
      query: 'needle',
      mode: 'phrase',
      limit: 2,
      sessionFilters: [
        { kind: 'created-at', from: 1 },
        { kind: 'id', values: [SessionId('same'), SessionId('same')] },
        { kind: 'parent', values: [SessionId('p'), null] },
        { kind: 'cwd', values: ['/a', '/b'] },
      ],
      eventFilters: [{ kind: 'time', to: 9 }],
    }
    expect(requestFingerprint(sessionA)).toBe(requestFingerprint(sessionB))

    const eventA: NormalizedEventRequest = {
      sessionId: SessionId('s'),
      query: 'needle',
      mode: 'phrase',
      limit: 2,
      filters: [{ kind: 'seq' }, { kind: 'surface', values: ['shadowed', 'current'] }],
    }
    const eventB: NormalizedEventRequest = {
      sessionId: SessionId('s'),
      query: 'needle',
      mode: 'phrase',
      limit: 2,
      filters: [{ kind: 'surface', values: ['current', 'shadowed'] }, { kind: 'seq' }],
    }
    expect(requestFingerprint(eventA)).toBe(requestFingerprint(eventB))
    expect(requestFingerprint(eventA)).not.toBe(requestFingerprint({ ...eventB, sessionId: SessionId('other') }))
  })

  it('normalizes, bounds, and positions snippets by Unicode code point', () => {
    expect(makeSnippet('  short\ntext  ', 20)).toBe('short text')
    expect(makeSnippet(`abcde${FTS_HIGHLIGHT_START}f${FTS_HIGHLIGHT_END}`, 1)).toBe('…')
    expect(makeSnippet('abcdefghij', 5)).toBe('abcd…')
    expect(makeSnippet(`ab${FTS_HIGHLIGHT_START}c${FTS_HIGHLIGHT_END}defghij`, 5)).toBe('…bcd…')
    expect(makeSnippet(`ab${FTS_HIGHLIGHT_START}c${FTS_HIGHLIGHT_END}defghij`, 3)).toBe('…c…')
    expect(makeSnippet(`abcde${FTS_HIGHLIGHT_START}f${FTS_HIGHLIGHT_END}`, 2)).toBe('…f')
    expect(makeSnippet(`abcde${FTS_HIGHLIGHT_START}f${FTS_HIGHLIGHT_END}`, 5)).toBe('…cdef')
    expect(makeSnippet(`  x—${FTS_HIGHLIGHT_START}café${FTS_HIGHLIGHT_END}\n y  `, 20))
      .toBe('x—café y')
  })
})
