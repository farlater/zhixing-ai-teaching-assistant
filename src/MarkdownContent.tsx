import { Component, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeSanitize from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'

export function MarkdownContent({ content, compact = false }: { content?: string; compact?: boolean }) {
  const source = typeof content === 'string' ? content : String(content || '')
  return <MarkdownBoundary source={source}><div className={`markdown-content${compact ? ' compact' : ''}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeSanitize, rehypeKatex]}
      urlTransform={(url, key, node) => {
        if (key === 'src' && (url.startsWith('/uploads/') || url.startsWith('/question-assets/') || url.startsWith('data:image/'))) return url
        return defaultUrlTransform(url)
      }}
      components={{
        a: props => <a {...props} target="_blank" rel="noreferrer" />,
        img: props => <img {...props} loading="lazy" alt={props.alt || '课程资料插图'} />
      }}
    >{source}</ReactMarkdown>
  </div></MarkdownBoundary>
}

class MarkdownBoundary extends Component<{ source: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidUpdate(previous: { source: string }) {
    if (this.state.failed && previous.source !== this.props.source) this.setState({ failed: false })
  }
  render() {
    return this.state.failed ? <div className="markdown-content markdown-fallback">{this.props.source}</div> : this.props.children
  }
}
