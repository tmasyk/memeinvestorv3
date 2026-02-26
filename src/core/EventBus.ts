import { EventEmitter } from 'events'

export enum EventName {
  NEW_TOKEN_DISCOVERED = 'NEW_TOKEN_DISCOVERED',
  TRADE_QUEUED = 'TRADE_QUEUED',
  POSITION_OPENED = 'POSITION_OPENED',
  PRICE_UPDATED = 'PRICE_UPDATED'
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
