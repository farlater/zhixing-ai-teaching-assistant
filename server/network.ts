import os from 'node:os'
import { spawn } from 'node:child_process'

export function lanAddresses(port: number) {
  // Windows 移动热点使用的主机地址固定为 192.168.137.1。教师电脑通常还会有
  // 家庭 Wi-Fi、VPN、虚拟机等网卡，把这些地址写入二维码会造成手机偶发连错。
  // 即使热点尚未开启，也只发布这个稳定地址，让教师先开热点、学生再扫码。
  if (process.platform === 'win32') return [`http://192.168.137.1:${port}`]
  const addresses = Object.values(os.networkInterfaces()).flat()
    .filter(item => item?.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.'))
    .map(item => item!.address)
  return [...new Set(addresses)].map(address => `http://${address}:${port}`)
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
