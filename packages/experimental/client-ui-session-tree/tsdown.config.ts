import { clientBundle } from '../../client/tsdown.client.ts'

const bundle = clientBundle('@deepseek-ai/dsh-experimental-client-ui-session-tree', ['lib/types/index.js'])

export default (options: Parameters<typeof bundle>[0]) => bundle(options).map(config =>
  config.name?.endsWith('/client') ? {
    ...config,
    // Mermaid shares static dependencies across its dynamic diagram chunks.
    // The plugin loader only loads package-local chunks asynchronously, so
    // publish a self-contained renderer instead of unresolved sibling requires.
    outputOptions: { ...config.outputOptions, codeSplitting: false },
  } : config,
)
