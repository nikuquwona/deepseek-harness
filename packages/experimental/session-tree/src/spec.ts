/** Summary storage and the local prototype's pending native-title transfers. */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { TreeAnnotation } from './types.ts'

/** Durable annotation validation; the empty string selects an automatic preview. */
export const annotationSchema = z.object({
  summary: z.string().max(4000),
})

/** The unpublished prototype's title field is read only until initialization transfers it. */
export type StoredTreeAnnotation = TreeAnnotation & { readonly title?: string | undefined }

const storedAnnotationSchema = annotationSchema.extend({ title: z.string().max(200).optional() })

/** Card summaries remain independent of native Session titles and messages. */
export const treeDomain = defineDomain({
  name: 'session_tree',
  version: 1,
  tables: {
    annotations: domainTable<SessionId, StoredTreeAnnotation>(storedAnnotationSchema),
  },
})
