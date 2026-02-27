export interface IPlugin {
  name: string
  version: string
}

export interface IFilterPlugin extends IPlugin {
  execute(tokenData: any): boolean
}

export interface IRiskPlugin extends IPlugin {
  execute(tokenData: any): Promise<number>
}

export interface IStrategyPlugin extends IPlugin {
  shouldExit(trade: any, currentPrice: number): { exit: boolean, reason?: string, amountPercent?: number }
}

export interface IPresetConfig {
  id: string
  name: string
  filters: Array<{ name: string; params: any }>
  risks: Array<{ name: string; params: any; weight: number }>
  strategies: Array<{ name: string; params: any }>
}
