import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Locale-owned copy for the conversation map. */
export const NS = 'session-tree'

/** English map labels. */
export const en = {
  title: 'Conversation map', guide: 'Open a conversation to continue. Explore another direction from a reply in chat.',
  forest: 'All conversations', exploration: 'This exploration', related: 'Show this exploration', showAll: 'Show all',
  search: 'Find a conversation', refresh: 'Refresh', back: 'Back to conversation',
  new: 'New conversation', empty: 'Your next idea starts here',
  emptyBody: 'Start a conversation, then explore from any reply. Your conversations and their connections are saved.',
  untitled: 'Untitled conversation', noSummary: 'Ready for a new exploration',
  open: 'Open conversation', openNamed: 'Open conversation: {title}', previewNamed: 'Preview: {title}',
  current: 'Current', from: 'From · {title}', source: 'View the conversation this exploration started from',
  expand: 'Show {count} explorations', collapse: 'Collapse explorations',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit map', zoom: 'Map zoom',
  canvas: 'Conversation map. Drag empty space to pan; use the zoom controls to scale.',
  close: 'Close details', details: 'Details', errorDetails: 'Error details', artifacts: 'Results and references',
  edit: 'Edit card', save: 'Save card', cancel: 'Cancel', cardTitle: 'Conversation name', summary: 'Card summary',
  auto: 'Leave blank for an automatic preview',
  loading: 'Loading conversations', retry: 'Retry', failed: 'Could not load your map',
  failedAction: 'The action could not be completed', saved: 'Card saved', running: 'Working',
  diagram: 'Diagram preview', commit: 'Commit output', pullRequest: 'PR reference', link: 'Reference',
  file: 'Presented file', viewFile: 'View file in conversation',
  treeAction: 'Conversation map', noMatches: 'No matching conversations',
  searching: 'Searching messages…', searchFailed: 'Message search is unavailable. Showing title and summary matches.',
  searchResults: 'Matching conversations', moreMatches: 'More conversations match. Add another word to narrow your search.',
} as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Conversation-map navigation and card copy. */
    'session-tree': keyof typeof en
  }
}

/** Chinese map labels, with the same complete key set. */
export const zh: Record<keyof typeof en, string> = {
  title: '对话地图', guide: '打开卡片继续对话，想另开探索时，从聊天中的回复出发。',
  forest: '全部对话', exploration: '这次探索', related: '只看这次探索', showAll: '查看全部',
  search: '查找对话', refresh: '刷新', back: '返回对话',
  new: '新建对话', empty: '从一个想法开始',
  emptyBody: '开始对话后，可以从任意回复另开探索。对话和它们之间的关系都会保存。',
  untitled: '未命名对话', noSummary: '等待新的探索',
  open: '打开对话', openNamed: '打开对话：{title}', previewNamed: '预览：{title}',
  current: '当前', from: '来自 · {title}', source: '查看这次探索的来源对话',
  expand: '展开 {count} 个探索', collapse: '折叠探索',
  zoomIn: '放大', zoomOut: '缩小', fit: '适应画布', zoom: '地图缩放',
  canvas: '对话地图。拖动空白区域平移，使用缩放控件调整大小。',
  close: '关闭详情', details: '详情', errorDetails: '错误详情', artifacts: '成果与引用',
  edit: '编辑卡片', save: '保存卡片', cancel: '取消', cardTitle: '对话名称', summary: '卡片摘要',
  auto: '留空时自动从对话提取',
  loading: '加载对话', retry: '重试', failed: '暂时无法加载对话地图',
  failedAction: '操作未完成', saved: '卡片已保存', running: '进行中',
  diagram: '图表预览', commit: '提交输出', pullRequest: 'PR 引用', link: '引用',
  file: '交付文件', viewFile: '在对话中查看文件',
  treeAction: '对话地图', noMatches: '没有匹配的对话',
  searching: '正在搜索对话内容…', searchFailed: '暂时无法搜索对话内容，当前仅显示名称和摘要的匹配。',
  searchResults: '匹配的对话', moreMatches: '还有更多匹配，请增加关键词缩小范围。',
}
