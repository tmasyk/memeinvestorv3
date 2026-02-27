import { EventEmitter } from 'events'

export enum EventName {
  NEW_TOKEN_DISCOVERED = 'NEW_TOKEN_DISCOVERED',
  POOL_DETECTED = 'POOL_DETECTED',
  POOL_SCANNED = 'POOL_SCANNED',
  TRADE_QUEUED = 'TRADE_QUEUED',
  POSITION_OPENED = 'POSITION_OPENED',
  PRICE_UPDATED = 'PRICE_UPDATED',
  PROFIT_ALERT = 'PROFIT_ALERT'
}

export class EventBus extends EventEmitter {
  private static instance: EventBus

  private constructor() {
    super()
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus()
    }
    return EventBus.instance
  }
}
