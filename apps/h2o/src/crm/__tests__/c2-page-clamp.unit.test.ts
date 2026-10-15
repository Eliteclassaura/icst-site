/**
 * 1.3a-C2: a list asked for a page past its end shows the last page (the clamp is pure and shared by Contacts, Accounts and the RFQ inbox).
 */
import { describe, expect, it, vi } from 'vitest'
import { findClamped, type PagedResult } from '../workspace/page-clamp'

const result = (docs: unknown[], totalDocs: number, totalPages?: number): PagedResult => ({ docs, totalDocs, totalPages })

describe('findClamped', () => {
  it('a page inside the range is returned as read, with no second read', async () => {
    const run = vi.fn(async (_page: number) => result(['a'], 120, 3))
    expect((await findClamped(2, run)).docs).toEqual(['a'])
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(2)
  })
  it('a page past the end, with records, is read again as the LAST page', async () => {
    const run = vi.fn(async (page: number) => (page > 3 ? result([], 120, 3) : result([`row-of-page-${page}`], 120, 3)))
    expect((await findClamped(999, run)).docs).toEqual(['row-of-page-3'])
    expect(run.mock.calls.map((c) => c[0])).toEqual([999, 3])
    // one short page of results: the last page is page 1
    const one = vi.fn(async (page: number) => (page > 1 ? result([], 1, 1) : result(['only'], 1, 1)))
    expect((await findClamped(999, one)).docs).toEqual(['only'])
  })
  it('a genuinely empty list is NOT clamped: no records means no second read (so a filter with no match stays "no match")', async () => {
    const run = vi.fn(async () => result([], 0, 1))
    expect((await findClamped(999, run)).docs).toEqual([])
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('page 1 is never clamped, and a missing page count is read as one page', async () => {
    const run = vi.fn(async () => result([], 5, 1))
    await findClamped(1, run)
    expect(run).toHaveBeenCalledTimes(1)
    const noCount = vi.fn(async (page: number) => (page > 1 ? ({ docs: [], totalDocs: 3 } as PagedResult) : result(['x'], 3)))
    expect((await findClamped(7, noCount)).docs).toEqual(['x'])
  })
  it('does not loop: the second read is the last one made, even if it is empty', async () => {
    const run = vi.fn(async () => result([], 10, 2))
    await findClamped(50, run)
    expect(run).toHaveBeenCalledTimes(2)
  })
})
