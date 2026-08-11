import os from 'node:os'
import { spawn } from 'node:child_process'

export function lanAddresses(port: number) {
  const addresses = Object.values(os.networkInterfaces()).flat().filter(item => item?.family === 'IPv4' && !item.internal).map(item => item!.address)
  const priority = (address: string) => {
    if (address === '192.168.137.1') return 100
    if (address.startsWith('192.168.')) return 80
    if (address.startsWith('10.')) return 70
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 60
    if (address.startsWith('169.254.')) return 0
    return 20
  }
  return [...new Set(addresses)].sort((a, b) => priority(b) - priority(a)).map(address => `http://${address}:${port}`)
}

export function isLoopback(address?: string) {
  const normalized = (address || '').replace('::ffff:', '')
  return normalized === '127.0.0.1' || normalized === '::1'
}

export function openWindowsHotspotSettings() {
  if (process.platform !== 'win32') throw new Error('当前系统不是 Windows，请在系统网络设置中手动开启热点')
  const child = spawn('cmd.exe', ['/c', 'start', '', 'ms-settings:network-mobilehotspot'], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}
