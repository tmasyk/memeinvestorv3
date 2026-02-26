MemeInvestor V3: Master Project Charter & Architecture

1. Core Identity & Philosophy

Project Name: MemeInvestor V3

Purpose: A high-performance, headless, event-driven crypto trading bot for Solana. It automatically discovers, evaluates, and trades trending meme coins via Jito bundles.

Design Philosophy ("Connection Stability First"):

 One Socket Rule: The system strictly utilizes a single, persistent WebSocket connection for all streaming data. There is zero tolerance for "opening and closing" connections.
 Defensive Architecture: Critical trade actions are persisted in a database queue (Outbox Pattern) to ensure no trades are lost during network hiccups.
 Resource Strictness: With a hard cap of 50 req/sec and strict connection limits, the bot prioritizes "Protecting the Position" over "Discovering the New."
 Deployment Target: Docker containers via Coolify on a high-performance VPS. PostgreSQL runs on the same internal Docker network.

2. System Architecture Layers

Layer 1: The Plugin System (The Brain)

A modular registry for independent components:

 Filter Plugins: Fast, in-memory pre-trade validations (e.g., liquidity > $5k). Goal: Save database I/O.
 Risk Plugins: RPC-dependent security checks (e.g., mint authority, holder concentration).
 Strategy Plugins: Logic that outputs actionable Buy/Sell signals.
 Layer 2: The Event Bus & Queue (The Nervous System)

 Event Bus (Node.js EventEmitter): Used for non-critical, high-frequency state updates (e.g., NEW_POOL, PRICE_UPDATE, LOG_EVENT).
 Trade Queue (PostgreSQL Table): Used for critical trade execution. The ScannerService creates a PendingTrade record. The TradingEngine picks it up. This ensures no trade is lost if the bot crashes mid-process.
 Layer 3: The Service Layer (The Muscle)

 RpcConnectionManager (The Gatekeeper):
 Strict Singleton: Initializes exactly ONE WebSocket connection on startup.
 Connection Recycling: If the connection drops, it waits 5 seconds before reconnecting (exponential backoff) to prevent "connection spamming."
 Subscription Management: Manages the active subscription count. The Constant-k tier allows exactly 10 WebSocket Subscriptions.
 DiscoveryService: Ingests the raw data stream from the Manager and emits events.
 ScannerService: Orchestrates the pipeline: In-Memory Filters -> Save to DB -> Risk Plugins -> Create PendingTrade Queue Entry.
 TradingEngine: Monitors the PendingTrade queue. Constructs Jito bundles, simulates them (safety check), executes, and monitors for landing.
 PositionManager:
 Strict Subscription Cap: Total limit is 10. 1 is reserved for the slotSubscribe heartbeat.
 Trade Cap: This leaves exactly 9 available subscriptions for open positions.
 Logic: The PositionManager enforces a hard MAX_OPEN_POSITIONS = 9. It will reject new trades if 9 slots are filled.
 Layer 4: API & Interface Layer (The Face)

 ApiServer: Express.js REST API & SSE stream for logs.
 BotController (Telegram): The remote control interface.
 Single-Preset Rule: The system enforces a strict "One Active Preset" policy. If a user activates a new preset (e.g., /preset aggressive), the system automatically unloads the previous preset and clears the previous strategy logic to prevent conflicts.
 3. Strict Technical & Infrastructure Rules

Rule 1: Hard Rate Limits & Priority Queuing The system is constrained to 50 requests/second.

 Priority 1 (Critical): getAccountInfo (Position Monitoring), sendTransaction.
 Priority 2 (Standard): Risk checks, Token metadata fetching.
 Implementation: The RpcConnectionManager must prioritize requests from PositionManager over ScannerService when the rate limit buffer is low.
 Rule 2: The "One Socket" & Subscription Math

 Physical Connection: Only 1 WebSocket object is ever created.
 Subscription Budget: Total 10 allowed.
 Slot 1: Dedicated to slotSubscribe (Heartbeat).
 Slots 2-10: Dedicated to accountSubscribe for active trades.
 Hard Cap: The bot is physically incapable of opening a 10th trade.
 Rule 3: In-Memory Pre-Filtering Raw blockchain data is never written to PostgreSQL. Tokens must pass FilterPlugins in-memory first. Only surviving candidates touch the database.

Rule 4: Zero Hardcoded Credentials All configs loaded via config.ts from environment variables. Missing variables cause a fatal crash on startup.

4. Phased Build Plan (Iterative Delivery)

Phase 1: Foundation, Connection, & Safe Ingestion

Goal: Establish the environment, database connection, and the "Spam-Proof" Singleton WebSocket.

Components: config.ts, RateLimiter, RpcConnectionManager (The Singleton), FilterPlugin interface, PostgreSQL Tokens table.

Action:

Build the RpcConnectionManager to open one connection.
Establish the slotSubscribe on connection start (Consumes Subscription #1).
Implement heartbeat logic.
Stream data, run through in-memory filter.
Success Criteria: App runs stable, maintains a single persistent WebSocket connection, and consumes exactly 1 subscription slot.

Phase 2: Risk Evaluation & Persistent Queuing

Goal: Secondary analysis and safe state management.

Components: PluginManager, ScannerService, RiskPlugin interface, PendingTrades table (Queue).

Action:

ScannerService runs Risk Plugins on stored tokens.
Critical Change: Instead of emitting an event to trade, the service inserts a row into a PendingTrades table with status QUEUED.
Implement a basic risk check (e.g., Mint Revoked).
Success Criteria: Database records update with Risk statuses. PendingTrades table populates correctly without triggering RPC bans.

Phase 3: Simulation & "Paper Trading" (The Safety Net)

Goal: Validate the execution pipeline without financial risk.

Components: TradingEngine (Simulation Mode), PositionManager, PaperTrades table.

Action:

TradingEngine reads from PendingTrades.
Construct the Jito bundle & Simulate.
Mock Execution: Write to PaperTrades table.
Subscription Test: PositionManager attempts to subscribe to the mock position. Verify it counts against the internal limit (max 9).
Success Criteria: The full loop runs: Queue -> Build Bundle -> Simulate -> Mock Save -> Monitor. The system respects the 9-position limit.

Phase 4: Live Jito Execution

Goal: Execute real trades.

Components: TradingEngine (Live Mode), PositionManager (Live Monitoring).

Action:

Toggle "Live Mode" in config.
TradingEngine executes real transactions via Jito.
PositionManager requests subscription updates via the RpcConnectionManager.
Monitor for Stop-Loss/Take-Profit and execute exit.
Success Criteria: Bot buys a token, monitors the price via the single shared WebSocket, and sells successfully.

Phase 5: Telegram Remote Control & API

Goal: Expose state and control.

Components: ApiServer, BotController.

Action:

Build SSE logging stream.
Implement Telegram commands: /health, /balance, /start, /stop.
Preset Logic: Implement /preset <name> command. Logic must ensure that switching presets cleanly unloads the previous strategy configuration.
Success Criteria: Bot is fully manageable via Telegram. Preset switching works without logic conflicts.