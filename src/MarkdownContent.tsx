import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeSanitize from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'

export function MarkdownContent({ content, compact = false }: { content?: string; compact?: boolean }) {
  return <div className={`markdown-content${compact ? ' compact' : ''}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeSanitize, rehypeKatex]}
      urlTransform={(url, key, node) => {
        if (key === 'src' && (url.startsWith('/uploads/') || url.startsWith('data:image/'))) return url
        return defaultUrlTransform(url)
      }}
      components={{
        a: props => <a {...props} target="_blank" rel="noreferrer" />,
        img: props => <img {...props} loading="lazy" alt={props.alt || '课程资料插图'} />
      }}
    >{content || ''}</ReactMarkdown>
  </div>
}
