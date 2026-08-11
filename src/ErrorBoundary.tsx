import { Component, type ErrorInfo, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面渲染失败', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="error-screen"><div><span>页面出现异常</span><h1>内容没有正常显示</h1><p>当前操作没有删除任何数据。请重新加载页面；如果问题重复出现，可把下面的错误信息发给开发者。</p><code>{this.state.error.message}</code><button className="btn primary" onClick={() => window.location.reload()}>重新加载页面</button></div></main>
  }
}
