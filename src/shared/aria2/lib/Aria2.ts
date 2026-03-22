/** @fileoverview Aria2-specific JSON-RPC client with secret auth and method prefixing. */
import { JSONRPCClient, JSONRPCClientOptions } from './JSONRPCClient'
import { DEFAULT_ARIA2_PORT } from '../../timing'

export interface Aria2Options extends JSONRPCClientOptions {
  secret?: string
}

export class Aria2 extends JSONRPCClient {
  static override defaultOptions: Aria2Options = {
    ...JSONRPCClient.defaultOptions,
    secure: false,
    host: 'localhost',
    port: DEFAULT_ARIA2_PORT,
    secret: '',
    path: '/jsonrpc',
  }

  constructor(options: Aria2Options = {}) {
    super({ ...Aria2.defaultOptions, ...options })
  }

  private prefix(str: string): string {
    if (!str.startsWith('system.') && !str.startsWith('aria2.')) {
      str = 'aria2.' + str
    }
    return str
  }

  private unprefix(str: string): string {
    const suffix = str.split('aria2.')[1]
    return suffix || str
  }

  private addSecret(parameters: unknown[]): unknown[] {
    let params: unknown[] = this.secret ? ['token:' + this.secret] : []
    if (Array.isArray(parameters)) {
      params = params.concat(parameters)
    }
    return params
  }

  protected override _onnotification(notification: { method?: string; params?: unknown[] }): void {
    const { method, params } = notification
    if (!method) return
    const event = this.unprefix(method)
    if (event !== method) this.emit(event, params)
    // RPCResponse requires 'id' but notifications don't have it; this is a library boundary mismatch
    super._onnotification(notification as unknown as { id: number; method?: string; params?: unknown[] })
  }

  override async call<T = unknown>(method: string, ...params: unknown[]): Promise<T> {
    return super.call(this.prefix(method), this.addSecret(params)) as Promise<T>
  }

  async multicall<T = unknown>(calls: [string, ...unknown[]][]): Promise<T> {
    const multi = [
      calls.map(([method, ...params]) => {
        return { methodName: this.prefix(method), params: this.addSecret(params) }
      }),
    ]
    return super.call('system.multicall', multi) as Promise<T>
  }

  override async batch(calls: [string, ...unknown[]][]): Promise<Promise<unknown>[]> {
    return super.batch(
      calls.map(([method, ...params]) => [this.prefix(method), ...this.addSecret(params)] as [string, ...unknown[]]),
    )
  }

  async listNotifications(): Promise<string[]> {
    const events = await this.call<string[]>('system.listNotifications')
    return events.map((event) => this.unprefix(event))
  }

  async listMethods(): Promise<string[]> {
    const methods = await this.call<string[]>('system.listMethods')
    return methods.map((method) => this.unprefix(method))
  }
}
