# Pi Messenger Architecture

Visual guide to the internals of pi-messenger.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PI MESSENGER                                    │
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│   │   Agent A   │    │   Agent B   │    │   Agent C   │    │   Agent D   │ │
│   │ SwiftRaven  │    │ GoldFalcon  │    │ IronKnight  │    │  CalmBear   │ │
│   │ spec: auth  │    │ spec: auth  │    │ spec: api   │    │  (no spec)  │ │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘ │
│          │                  │                  │                  │         │
│          └──────────────────┴──────────────────┴──────────────────┘         │
│                                     │                                        │
│                                     ▼                                        │
│          ┌──────────────────────────────────────────────────────┐           │
│          │              ~/.pi/agent/messenger/                   │           │
│          │                                                       │           │
│          │  ┌────────────────────┐  ┌────────────────────┐      │           │
│          │  │     registry/      │  │       inbox/       │      │           │
│          │  │                    │  │                    │      │           │
│          │  │  SwiftRaven.json   │  │  SwiftRaven/       │      │           │
│          │  │  GoldFalcon.json   │  │  GoldFalcon/       │      │           │
│          │  │  IronKnight.json   │  │  IronKnight/       │      │           │
│          │  │  CalmBear.json     │  │  CalmBear/         │      │           │
│          │  └────────────────────┘  └────────────────────┘      │           │
│          │                                                       │           │
│          │  ┌────────────────────────────────────────────┐      │           │
│          │  │           Swarm Coordination               │      │           │
│          │  │                                            │      │           │
│          │  │  claims.json       Active task claims      │      │           │
│          │  │  completions.json  Completed tasks         │      │           │
│          │  │  swarm.lock        Atomic mutex            │      │           │
│          │  └────────────────────────────────────────────┘      │           │
│          └──────────────────────────────────────────────────────┘           │
│                                                                             │
│                         File-based coordination                             │
│                           No daemon required                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│    index.ts                        Entry point, event handlers, state       │
│    ═════════                                                                │
│         │                                                                   │
│         ├──────────────┬──────────────┬──────────────┬──────────────┐      │
│         ▼              ▼              ▼              ▼              ▼      │
│    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌────────┐ │
│    │config.ts│    │store.ts │    │handlers │    │overlay  │    │ lib.ts │ │
│    │         │    │         │    │   .ts   │    │   .ts   │    │        │ │
│    │ Config  │    │  File   │    │  Tool   │    │  Chat   │    │ Types  │ │
│    │ loading │    │  I/O +  │    │handlers │    │   UI    │    │ Utils  │ │
│    │         │    │  Swarm  │    │ + Swarm │    │+ Specs  │    │        │ │
│    └─────────┘    └────┬────┘    └────┬────┘    └────┬────┘    └────────┘ │
│                        │              │              │              ▲      │
│                        └──────────────┴──────────────┴──────────────┘      │
│                                       │                                     │
│                        store, handlers, overlay import lib.ts               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


    ┌──────────────────────────────────────────────────────────────────┐
    │                        Module Responsibilities                    │
    ├──────────────┬───────────────────────────────────────────────────┤
    │  lib.ts      │  Types, constants, pure utility functions,        │
    │              │  path helpers (resolveSpecPath, displaySpecPath)  │
    │  config.ts   │  Load and merge configuration from 3 sources      │
    │  store.ts    │  Registry, inbox, watcher, file operations,       │
    │              │  swarm lock, claims/completions CRUD              │
    │  handlers.ts │  Tool handlers (send, reserve, claim, complete)   │
    │  overlay.ts  │  Chat UI with spec grouping and claims display    │
    │  index.ts    │  Extension setup, event handlers, state mgmt      │
    └──────────────┴───────────────────────────────────────────────────┘
```

## Agent Lifecycle

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                        AGENT LIFECYCLE                          │
    └─────────────────────────────────────────────────────────────────┘

                              pi starts
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │     session_start       │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   config.autoRegister?  │
                    │                         │
                    │   No  → stay dormant    │
                    │         (tool available │
                    │          but inactive)  │
                    │                         │
                    │   Yes → continue ──────────┐
                    └─────────────────────────┘  │
                                                 │
                         ┌───────────────────────┘
                         │
                         │  (or user calls join: true / opens /messenger)
                         │
                    ┌────▼───────────────────┐
                    │   Generate/validate     │
                    │      agent name         │
                    │                         │
                    │  PI_AGENT_NAME set?     │
                    │    Yes → use it         │
                    │    No  → SwiftRaven     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Write registration    │
                    │                         │
                    │  registry/SwiftRaven.json│
                    │  {                      │
                    │    name, pid, sessionId,│
                    │    cwd, model, startedAt│
                    │    gitBranch, spec      │
                    │  }                      │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Write-then-verify     │
                    │   (race condition guard)│
                    │                         │
                    │   Read back, check PID  │
                    │   matches ours          │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Create inbox dir      │
                    │   Start file watcher    │
                    └────────────┬────────────┘
                                 │
                                 ▼
    ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
    │                     ACTIVE OPERATION                            │
    │                                                                 │
    │   • Respond to pi_messenger tool calls                         │
    │   • Claim/complete tasks in registered spec                    │
    │   • Watch inbox for incoming messages                          │
    │   • Process messages on turn_end                               │
    │   • Update reservations as needed                              │
    │   • Block conflicting file operations                          │
    │                                                                 │
    └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
                                 │
                    ┌────────────▼────────────┐
                    │    session_shutdown     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Stop file watcher     │
                    │   Delete registration   │
                    │   (claims auto-cleanup  │
                    │    via stale detection) │
                    └────────────┬────────────┘
                                 │
                                 ▼
                            pi exits
```

## Swarm Coordination

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SWARM COORDINATION FLOW                      │
    └─────────────────────────────────────────────────────────────────┘


         CLAIMING A TASK                         COMPLETING A TASK
         ══════════════                          ═════════════════

    ┌──────────────────────┐                ┌──────────────────────┐
    │  pi_messenger({      │                │  pi_messenger({      │
    │    claim: "TASK-01", │                │    complete: "TASK-01",
    │    reason: "Auth"    │                │    notes: "Added JWT"│
    │  })                  │                │  })                  │
    └──────────┬───────────┘                └──────────┬───────────┘
               │                                       │
               ▼                                       ▼
    ┌──────────────────────┐                ┌──────────────────────┐
    │  Resolve spec path   │                │  Resolve spec path   │
    │  (from param or      │                │  (from param or      │
    │   state.spec)        │                │   state.spec)        │
    └──────────┬───────────┘                └──────────┬───────────┘
               │                                       │
               ▼                                       ▼
    ┌──────────────────────┐                ┌──────────────────────┐
    │  withSwarmLock()     │                │  withSwarmLock()     │
    │                      │                │                      │
    │  Acquire swarm.lock  │                │  Acquire swarm.lock  │
    │  (O_CREAT | O_EXCL)  │                │  (O_CREAT | O_EXCL)  │
    └──────────┬───────────┘                └──────────┬───────────┘
               │                                       │
               ▼                                       ▼
    ┌──────────────────────┐                ┌──────────────────────┐
    │  Cleanup stale       │                │  Check if already    │
    │  claims (dead PIDs)  │                │  completed           │
    └──────────┬───────────┘                └──────────┬───────────┘
               │                                       │
               ▼                                       ▼
    ┌──────────────────────┐                ┌──────────────────────┐
    │  Check: do I have    │                │  Check: is this my   │
    │  another claim?      │                │  claim?              │
    └──────────┬───────────┘                └──────────┬───────────┘
               │                                       │
          ┌────┴────┐                            ┌────┴────┐
          │         │                            │         │
         Yes        No                          Yes        No
          │         │                            │         │
          ▼         ▼                            ▼         ▼
    ┌──────────┐ ┌──────────────┐         ┌──────────┐ ┌──────────┐
    │  Error:  │ │ Check: is    │         │ Remove   │ │  Error:  │
    │ already  │ │ task already │         │ from     │ │not_claimed│
    │ have     │ │ claimed?     │         │ claims   │ │   or     │
    │ claim    │ └──────┬───────┘         └────┬─────┘ │not_yours │
    └──────────┘        │                      │       └──────────┘
                   ┌────┴────┐                 ▼
                   │         │         ┌──────────────┐
                  Yes        No        │ Add to       │
                   │         │         │ completions  │
                   ▼         ▼         └──────┬───────┘
             ┌──────────┐ ┌──────────┐        │
             │  Error:  │ │ Add to   │        ▼
             │ already  │ │ claims   │ ┌──────────────────┐
             │ claimed  │ └────┬─────┘ │ Write completions│
             └──────────┘      │       │ (first!)         │
                               ▼       └──────┬───────────┘
                        ┌──────────────┐       │
                        │ Write claims │       ▼
                        └──────┬───────┘ ┌──────────────────┐
                               │         │ Write claims     │
                               ▼         └──────┬───────────┘
                        ┌──────────────┐        │
                        │ Release lock │        ▼
                        └──────────────┘ ┌──────────────┐
                                         │ Release lock │
                                         └──────────────┘


    ════════════════════════════════════════════════════════════════════

                         SWARM LOCK MECHANISM

    ════════════════════════════════════════════════════════════════════

    ┌────────────────────────────────────────────────────────────────┐
    │                                                                │
    │   1. Try to create swarm.lock with O_CREAT | O_EXCL            │
    │      (atomic: fails if file exists)                            │
    │                                                                │
    │   2. If EEXIST:                                                │
    │      • Check lock age (stat mtime)                             │
    │      • If > 10 seconds old:                                    │
    │        - Read PID from lock file                               │
    │        - If PID dead → delete stale lock, retry                │
    │      • Otherwise: wait 100ms, retry (up to 50 times)           │
    │                                                                │
    │   3. On success: write our PID to lock file                    │
    │                                                                │
    │   4. Execute protected operation                               │
    │                                                                │
    │   5. Delete lock file (finally block)                          │
    │                                                                │
    └────────────────────────────────────────────────────────────────┘


    ════════════════════════════════════════════════════════════════════

                         STALE CLAIM DETECTION

    ════════════════════════════════════════════════════════════════════

    ┌────────────────────────────────────────────────────────────────┐
    │                                                                │
    │   A claim is STALE if ANY of:                                  │
    │                                                                │
    │   • claim.pid is not alive (process.kill(pid, 0) fails)        │
    │   • Agent's registration file doesn't exist                    │
    │   • Registration exists but PID differs                        │
    │   • Registration exists but sessionId differs                  │
    │                                                                │
    │   Stale claims are cleaned up during:                          │
    │   • claimTask() - before checking conflicts                    │
    │   • unclaimTask() - before checking ownership                  │
    │   • completeTask() - before checking ownership                 │
    │   • getClaims() - filtered out of results                      │
    │                                                                │
    └────────────────────────────────────────────────────────────────┘
```

## Message Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    MESSAGE DELIVERY FLOW                        │
    └─────────────────────────────────────────────────────────────────┘


         SENDER (SwiftRaven)                    RECIPIENT (GoldFalcon)
         ═══════════════════                    ══════════════════════

    ┌──────────────────────┐
    │  pi_messenger({      │
    │    to: "GoldFalcon", │
    │    message: "Hi!"    │
    │  })                  │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Validate recipient  │
    │  • Name valid?       │
    │  • Registration?     │
    │  • PID alive?        │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Write message file  │
    │                      │
    │  inbox/GoldFalcon/   │
    │    1705123456-x7k2.json
    └──────────┬───────────┘
               │
               │                         ┌──────────────────────┐
               └────────────────────────▶│   fs.watch detects   │
                                         │   new file           │
                                         └──────────┬───────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │  Read message JSON   │
                                         │  Parse contents      │
                                         └──────────┬───────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │  deliverMessage()    │
                                         │                      │
                                         │  • Store in history  │
                                         │  • Increment unread  │
                                         │  • Build content     │
                                         │  • Add reply hint    │
                                         └──────────┬───────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │  pi.sendMessage()    │
                                         │                      │
                                         │  triggerTurn: true   │
                                         │  deliverAs: "steer"  │
                                         └──────────┬───────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │  Delete message file │
                                         │  (after delivery)    │
                                         └──────────────────────┘


    ════════════════════════════════════════════════════════════════════

                           MESSAGE FILE FORMAT

    ════════════════════════════════════════════════════════════════════

                    inbox/GoldFalcon/1705123456-x7k2.json
                    ┌──────────────────────────────────┐
                    │ {                                │
                    │   "id": "uuid-...",              │
                    │   "from": "SwiftRaven",          │
                    │   "to": "GoldFalcon",            │
                    │   "text": "Hi!",                 │
                    │   "timestamp": "2026-01-...",    │
                    │   "replyTo": null                │
                    │ }                                │
                    └──────────────────────────────────┘
```

## File Watcher Recovery

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    WATCHER RETRY LOGIC                          │
    └─────────────────────────────────────────────────────────────────┘


                         startWatcher()
                              │
                              ▼
               ┌──────────────────────────────┐
               │   Guards (all must pass):    │
               │   • registered? yes          │
               │   • watcher exists? no       │
               │   • retries < 5? yes         │
               └──────────────┬───────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │   fs.watch(inbox, callback)  │
               └──────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
          SUCCESS                          FAILURE
              │                               │
              ▼                               ▼
    ┌──────────────────┐          ┌──────────────────────┐
    │ Reset retries: 0 │          │   scheduleRetry()    │
    │ Attach error     │          │                      │
    │ handler          │          │   retries++          │
    └──────────────────┘          │   delay = 2^n sec    │
                                  │   (max 30s)          │
                                  └──────────┬───────────┘
                                             │
                        ┌────────────────────┴────────────────────┐
                        │                                        │
                   retries < 5                              retries >= 5
                        │                                        │
                        ▼                                        ▼
            ┌───────────────────────┐                ┌───────────────────┐
            │  setTimeout(delay)    │                │   GIVE UP         │
            │  then startWatcher()  │                │   (dead watcher)  │
            └───────────────────────┘                └─────────┬─────────┘
                                                               │
                                                               │
    ════════════════════════════════════════════════════════════════════
                                                               │
                             RECOVERY (on turn_end, session events)
                                                               │
                                                               ▼
                                              ┌────────────────────────────┐
                                              │  recoverWatcherIfNeeded()  │
                                              │                            │
                                              │  if registered &&          │
                                              │     !watcher &&            │
                                              │     !retryTimer:           │
                                              │                            │
                                              │    retries = 0             │
                                              │    startWatcher()          │
                                              └────────────────────────────┘
```

## Reservation System

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    FILE RESERVATION FLOW                        │
    └─────────────────────────────────────────────────────────────────┘


      Agent: SwiftRaven                           Agent: GoldFalcon
      ═════════════════                           ═════════════════

    ┌───────────────────────┐
    │  pi_messenger({       │
    │    reserve: ["src/auth/"],
    │    reason: "Refactoring"
    │  })                   │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │  Update local state   │
    │  reservations[]       │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │  Write to registry    │
    │                       │
    │  SwiftRaven.json:     │
    │  {                    │
    │    ...                │
    │    "reservations": [  │
    │      {                │
    │        "pattern":     │
    │          "src/auth/", │
    │        "reason":      │
    │          "Refactoring",
    │        "since": "..." │
    │      }                │
    │    ]                  │
    │  }                    │
    └───────────────────────┘

                                              ┌───────────────────────┐
                                              │  edit({               │
                                              │    path: "src/auth/   │
                                              │           login.ts"   │
                                              │  })                   │
                                              └───────────┬───────────┘
                                                          │
                                                          ▼
                                              ┌───────────────────────┐
                                              │  tool_call event      │
                                              │  triggers hook        │
                                              └───────────┬───────────┘
                                                          │
                                                          ▼
                                              ┌───────────────────────┐
                                              │  getConflictsWithOtherAgents()
                                              │                       │
                                              │  Read all registrations
                                              │  Check reservations   │
                                              │  Match path patterns  │
                                              └───────────┬───────────┘
                                                          │
                                                          ▼
                                              ┌───────────────────────┐
                                              │  CONFLICT DETECTED    │
                                              │                       │
                                              │  return {             │
                                              │    block: true,       │
                                              │    reason: "..."      │
                                              │  }                    │
                                              └───────────────────────┘


    ════════════════════════════════════════════════════════════════════

                         PATTERN MATCHING RULES

    ════════════════════════════════════════════════════════════════════

    ┌────────────────────────────────────────────────────────────────┐
    │                                                                │
    │   Pattern             File Path              Match?            │
    │   ───────             ─────────              ──────            │
    │   src/auth/           src/auth/login.ts      ✓ Yes            │
    │   src/auth/           src/auth/              ✓ Yes            │
    │   src/auth/           src/authentication/    ✗ No             │
    │   config.yaml         config.yaml            ✓ Yes            │
    │   config.yaml         config.yml             ✗ No             │
    │                                                                │
    │   Note: Trailing "/" indicates directory reservation          │
    │                                                                │
    └────────────────────────────────────────────────────────────────┘
```

## Configuration Cascade

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    CONFIGURATION PRIORITY                       │
    └─────────────────────────────────────────────────────────────────┘


                          loadConfig(cwd)
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
    ┌─────────┐          ┌─────────┐          ┌─────────┐
    │ PROJECT │          │EXTENSION│          │SETTINGS │
    │(highest)│          │ GLOBAL  │          │(lowest) │
    └────┬────┘          └────┬────┘          └────┬────┘
         │                    │                    │
         │                    │                    │
    .pi/pi-messenger.json     │         ~/.pi/agent/settings.json
         │                    │                    │
         │       ~/.pi/agent/pi-messenger.json     │
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │      MERGE       │
                    │                  │
                    │  defaults        │
                    │    ↓             │
                    │  settings.json   │
                    │    ↓             │
                    │  extension.json  │
                    │    ↓             │
                    │  project.json    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Apply shortcuts │
                    │                  │
                    │  "none" →        │
                    │    all false     │
                    │                  │
                    │  "minimal" →     │
                    │    replyHint     │
                    │    only          │
                    │                  │
                    │  "full" →        │
                    │    use merged    │
                    │    values        │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Final Config    │
                    │                  │
                    │ {                │
                    │   autoRegister,  │
                    │   contextMode,   │
                    │   registration   │
                    │     Context,     │
                    │   replyHint,     │
                    │   senderDetails  │
                    │     OnFirst      │
                    │     Contact      │
                    │ }                │
                    └──────────────────┘
```

## Event Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                      PI EVENT HANDLERS                          │
    └─────────────────────────────────────────────────────────────────┘


    ┌──────────────────┐
    │   session_start  │───────▶  (only if config.autoRegister)
    └──────────────────┘                    │
                                            ▼
                               register() → startWatcher() → updateStatus()
                                            │
                                            ▼
                                Send registration context
                                (if config.registrationContext)


    ┌──────────────────┐
    │  session_switch  │───────▶  recoverWatcherIfNeeded() → updateStatus()
    └──────────────────┘


    ┌──────────────────┐
    │   session_fork   │───────▶  recoverWatcherIfNeeded() → updateStatus()
    └──────────────────┘


    ┌──────────────────┐
    │   session_tree   │───────▶  updateStatus()
    └──────────────────┘


    ┌──────────────────┐
    │    turn_end      │───────▶  processAllPendingMessages()
    └──────────────────┘                     │
                                             ▼
                                  recoverWatcherIfNeeded()
                                             │
                                             ▼
                                       updateStatus()


    ┌──────────────────┐
    │session_shutdown  │───────▶  stopWatcher() → unregister()
    └──────────────────┘


    ┌──────────────────┐         ┌────────────────────────────┐
    │    tool_call     │───────▶ │  Is tool edit or write?    │
    └──────────────────┘         └─────────────┬──────────────┘
                                               │
                                    ┌──────────┴──────────┐
                                    │                     │
                                   Yes                    No
                                    │                     │
                                    ▼                     ▼
                         ┌──────────────────┐        (no action)
                         │ Check conflicts  │
                         └────────┬─────────┘
                                  │
                         ┌────────┴────────┐
                         │                 │
                      Conflict          No conflict
                         │                 │
                         ▼                 ▼
                    Block with         (allow)
                    reason
```

## Chat Overlay Structure

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                      OVERLAY LAYOUT                             │
    └─────────────────────────────────────────────────────────────────┘


    ╭─────────────────────────────────────────────────────────────────╮
    │                                                                 │
    │   Messenger ── SwiftRaven ── 2 peers            ← Title Bar    │
    │                                                                 │
    │   ▸ Agents │ ● GoldFalcon │ ● IronKnight (3) │ + All  ← Tabs   │
    │   ─────────────────────────────────────────────                 │
    │                                                                 │
    │                     Agents Tab (spec mode)                      │
    │                                                                 │
    │   ./feature-spec.md:                                            │
    │     SwiftRaven (you)   TASK-01    Implementing auth             │
    │     GoldFalcon         TASK-02    API endpoints                 │
    │     IronKnight         (idle)                                   │
    │                                                                 │
    │   No spec:                                                      │
    │     CalmBear           (idle)                                   │
    │                                                                 │
    │   ─────────────────────────────────────────────                 │
    │   > Agents overview                          [Tab] [Enter]      │
    │                                                                 │
    ╰─────────────────────────────────────────────────────────────────╯


    ╭─────────────────────────────────────────────────────────────────╮
    │                                                                 │
    │   Messenger ── SwiftRaven ── 2 peers            ← Title Bar    │
    │                                                                 │
    │   Agents │ ▸ ● GoldFalcon │ ● IronKnight (3) │ + All  ← Tabs   │
    │   ─────────────────────────────────────────────                 │
    │                                                                 │
    │                      Chat Tab (messages)                        │
    │                                                                 │
    │     ┌─ GoldFalcon ──────────────────────── 10m ago ─┐          │
    │     │ Hey, starting on API endpoints                │          │
    │     └───────────────────────────────────────────────┘          │
    │                                                                 │
    │     ┌─ You ─────────────────────────────── 5m ago ──┐          │
    │     │ Sounds good, I'll handle auth                 │          │
    │     └───────────────────────────────────────────────┘          │
    │                                                                 │
    │   ─────────────────────────────────────────────                 │
    │   > Type message here...                    [Tab] [Enter]       │
    │                                                                 │
    ╰─────────────────────────────────────────────────────────────────╯


    ┌───────────────────────────────────────────────────────────────┐
    │                      KEYBOARD CONTROLS                        │
    ├───────────────────────────────────────────────────────────────┤
    │                                                               │
    │   Tab / → / ←      Cycle between tabs                        │
    │   ↑ / ↓            Scroll message history                    │
    │   Home / End       Jump to oldest / newest                   │
    │   Enter            Send message                              │
    │   Backspace        Delete character                          │
    │   Esc              Close overlay                             │
    │                                                               │
    └───────────────────────────────────────────────────────────────┘
```

## Data Structures

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                      CORE DATA TYPES                            │
    └─────────────────────────────────────────────────────────────────┘


    MessengerState                          In-memory runtime state
    ══════════════                          ═══════════════════════

    ┌────────────────────────────────────────────────────────────────┐
    │                                                                │
    │   agentName: string              "SwiftRaven"                  │
    │   registered: boolean            true                          │
    │   gitBranch: string | undefined  "main"                        │
    │   spec: string | undefined       "/abs/path/to/spec.md"        │
    │   watcher: FSWatcher | null      <watching inbox>              │
    │   watcherRetries: number         0                             │
    │   watcherRetryTimer: Timer       null                          │
    │   watcherDebounceTimer: Timer    null                          │
    │   reservations: FileReservation[]                              │
    │   │                                                            │
    │   │   ┌─────────────────────────────────────────────┐          │
    │   └──▶│ { pattern: "src/auth/", reason: "...", ... }│          │
    │       └─────────────────────────────────────────────┘          │
    │                                                                │
    │   chatHistory: Map<string, AgentMailMessage[]>                 │
    │   │                                                            │
    │   │   "GoldFalcon" ──▶ [ msg1, msg2, msg3, ... ]               │
    │   │   "IronKnight" ──▶ [ msg1, msg2, ... ]                     │
    │   │                                                            │
    │   unreadCounts: Map<string, number>                            │
    │   │                                                            │
    │   │   "GoldFalcon" ──▶ 0                                       │
    │   │   "IronKnight" ──▶ 3                                       │
    │   │                                                            │
    │   broadcastHistory: AgentMailMessage[]                         │
    │   │                                                            │
    │   │   [ broadcast1, broadcast2, ... ]                          │
    │   │                                                            │
    │   seenSenders: Map<string, string>   (name -> sessionId)       │
    │   │                                                            │
    │   │   "GoldFalcon" ──▶ "session-abc"  (detects agent restart) │
    │   │   "IronKnight" ──▶ "session-xyz"                          │
    │                                                                │
    └────────────────────────────────────────────────────────────────┘


    AgentRegistration                       Persisted to registry/
    ═════════════════                       ═══════════════════════

    ┌────────────────────────────────────────────────────────────────┐
    │  {                                                             │
    │    "name": "SwiftRaven",                                       │
    │    "pid": 12345,                                               │
    │    "sessionId": "abc-123",                                     │
    │    "cwd": "/Users/dev/project",                                │
    │    "model": "claude-sonnet-4",                                 │
    │    "startedAt": "2026-01-20T10:30:00.000Z",                    │
    │    "gitBranch": "main",                                        │
    │    "spec": "/Users/dev/project/spec.md",                       │
    │    "reservations": [                                           │
    │      {                                                         │
    │        "pattern": "src/auth/",                                 │
    │        "reason": "Refactoring authentication",                 │
    │        "since": "2026-01-20T10:35:00.000Z"                     │
    │      }                                                         │
    │    ]                                                           │
    │  }                                                             │
    └────────────────────────────────────────────────────────────────┘


    ClaimEntry                              In claims.json
    ══════════                              ══════════════

    ┌────────────────────────────────────────────────────────────────┐
    │  {                                                             │
    │    "agent": "SwiftRaven",                                      │
    │    "sessionId": "abc-123",                                     │
    │    "pid": 12345,                                               │
    │    "claimedAt": "2026-01-20T10:45:00.000Z",                    │
    │    "reason": "Implementing login flow"                         │
    │  }                                                             │
    └────────────────────────────────────────────────────────────────┘


    CompletionEntry                         In completions.json
    ═══════════════                         ═══════════════════

    ┌────────────────────────────────────────────────────────────────┐
    │  {                                                             │
    │    "completedBy": "SwiftRaven",                                │
    │    "completedAt": "2026-01-20T11:30:00.000Z",                  │
    │    "notes": "Added JWT validation and refresh tokens"          │
    │  }                                                             │
    └────────────────────────────────────────────────────────────────┘


    claims.json                             All active claims
    ═══════════                             ═════════════════

    ┌────────────────────────────────────────────────────────────────┐
    │  {                                                             │
    │    "/abs/path/to/auth-spec.md": {                              │
    │      "TASK-01": { agent, sessionId, pid, claimedAt, reason },  │
    │      "TASK-02": { agent, sessionId, pid, claimedAt }           │
    │    },                                                          │
    │    "/abs/path/to/api-spec.md": {                               │
    │      "TASK-05": { agent, sessionId, pid, claimedAt, reason }   │
    │    }                                                           │
    │  }                                                             │
    └────────────────────────────────────────────────────────────────┘


    completions.json                        All completed tasks
    ════════════════                        ════════════════════

    ┌────────────────────────────────────────────────────────────────┐
    │  {                                                             │
    │    "/abs/path/to/auth-spec.md": {                              │
    │      "TASK-00": { completedBy, completedAt, notes }            │
    │    },                                                          │
    │    "/abs/path/to/api-spec.md": {                               │
    │      "TASK-01": { completedBy, completedAt, notes },           │
    │      "TASK-02": { completedBy, completedAt }                   │
    │    }                                                           │
    │  }                                                             │
    └────────────────────────────────────────────────────────────────┘


    AgentMailMessage                        Transient message file
    ════════════════                        ══════════════════════

    ┌────────────────────────────────────────────────────────────────┐
    │  {                                                             │
    │    "id": "550e8400-e29b-41d4-a716-446655440000",               │
    │    "from": "SwiftRaven",                                       │
    │    "to": "GoldFalcon",                                         │
    │    "text": "Auth module is ready for review",                  │
    │    "timestamp": "2026-01-20T10:45:00.000Z",                    │
    │    "replyTo": null                                             │
    │  }                                                             │
    └────────────────────────────────────────────────────────────────┘
```

## Broadcast Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                      BROADCAST MESSAGE                          │
    └─────────────────────────────────────────────────────────────────┘


                            SwiftRaven
                                │
                                │  pi_messenger({
                                │    broadcast: true,
                                │    message: "Sync up!"
                                │  })
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Get active agents   │
                    │   [GoldFalcon,        │
                    │    IronKnight,        │
                    │    CalmBear]          │
                    └───────────┬───────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │  Write to     │   │  Write to     │   │  Write to     │
    │  GoldFalcon/  │   │  IronKnight/  │   │  CalmBear/    │
    │  inbox        │   │  inbox        │   │  inbox        │
    └───────┬───────┘   └───────┬───────┘   └───────┬───────┘
            │                   │                   │
            │                   │                   │
     ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐
     │   Success   │     │   Success   │     │   Failure   │
     └─────────────┘     └─────────────┘     └─────────────┘
                                │
                                │  Best-effort: failures
                                │  don't stop others
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Store in local       │
                    │  broadcastHistory     │
                    │  (regardless of       │
                    │   individual fails)   │
                    └───────────────────────┘
```

## Name Generation

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    MEMORABLE NAME GENERATION                    │
    └─────────────────────────────────────────────────────────────────┘


                         generateMemorableName()
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
            ┌─────────────┐             ┌─────────────┐
            │ ADJECTIVES  │             │   NOUNS     │
            │ (25 words)  │             │ (26 words)  │
            ├─────────────┤             ├─────────────┤
            │ Swift       │             │ Arrow       │
            │ Bright      │             │ Bear        │
            │ Calm        │             │ Castle      │
            │ ...         │             │ ...         │
            │ Zen         │             │ Zenith      │
            └──────┬──────┘             └──────┬──────┘
                   │                           │
                   └───────────┬───────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │   COMBINE   │
                        │             │
                        │  Adjective  │
                        │      +      │
                        │    Noun     │
                        └──────┬──────┘
                               │
                               ▼
                        ┌─────────────┐
                        │ SwiftRaven  │
                        │ GoldFalcon  │
                        │ IronKnight  │
                        │    ...      │
                        └─────────────┘

                    25 × 26 = 650 possible combinations
```

## Performance Optimizations

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    AGENTS CACHE (v0.2.1)                        │
    └─────────────────────────────────────────────────────────────────┘


                         getActiveAgents()
                               │
                               ▼
               ┌───────────────────────────────┐
               │   Cache valid?                │
               │   • exists?                   │
               │   • same registry path?       │
               │   • age < 1 second?           │
               └───────────────┬───────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                   Yes                    No
                    │                     │
                    ▼                     ▼
           ┌──────────────┐      ┌──────────────────┐
           │ Return cached│      │ Read from disk   │
           │ (filter self)│      │ (full scan)      │
           └──────────────┘      └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │ Update cache     │
                                 │ timestamp        │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │ Return filtered  │
                                 │ (exclude self)   │
                                 └──────────────────┘


    Cache invalidated after: register(), unregister(), renameAgent()


    ┌─────────────────────────────────────────────────────────────────┐
    │                   WATCHER DEBOUNCE (v0.2.1)                     │
    └─────────────────────────────────────────────────────────────────┘


         fs.watch event                    fs.watch event
              │                                  │
              ▼                                  ▼
       ┌────────────┐                     ┌────────────┐
       │ Clear any  │                     │ Clear any  │
       │ pending    │                     │ pending    │
       │ timer      │                     │ timer      │
       └─────┬──────┘                     └─────┬──────┘
             │                                  │
             ▼                                  ▼
       ┌────────────┐                     ┌────────────┐
       │ Set 50ms   │                     │ Set 50ms   │
       │ timer      │ ─────────────────── │ timer      │
       └─────┬──────┘   (timer reset)     └─────┬──────┘
             │                                  │
             │                                  ▼
             │                           ┌────────────┐
             │                           │ Timer      │
             │                           │ expires    │
             │                           └─────┬──────┘
             │                                 │
             │                                 ▼
             │                    ┌────────────────────────┐
             │                    │ processAllPendingMessages()
             │                    └────────────────────────┘
             │
             ▼
       (cancelled - never fires)
```

---

*These diagrams represent the architecture as of v0.5.0*
