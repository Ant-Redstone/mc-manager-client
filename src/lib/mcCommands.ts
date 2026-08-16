// A client-side registry of common Minecraft server commands, used to power
// the console's suggestion/tab-complete UI. Commands are typed without a
// leading slash (server console style). This is intentionally curated, not
// exhaustive — enough to be genuinely useful without any backend round-trip.

export interface ArgSpec {
  name: string
  /** Fixed set of completions for this argument, when it's an enum. */
  values?: readonly string[]
}

export interface CommandSpec {
  name: string
  /** Human-readable usage, e.g. "gamemode <mode> [target]". */
  usage: string
  desc: string
  args?: readonly ArgSpec[]
}

const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'] as const
const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const
const BOOL = ['true', 'false'] as const

// Vanilla gamerules (1.21-era). Used for `gamerule` completion.
const GAMERULES = [
  'announceAdvancements', 'commandBlockOutput', 'disableElytraMovementCheck', 'disableRaids',
  'doDaylightCycle', 'doEntityDrops', 'doFireTick', 'doInsomnia', 'doImmediateRespawn',
  'doLimitedCrafting', 'doMobLoot', 'doMobSpawning', 'doPatrolSpawning', 'doTileDrops',
  'doTraderSpawning', 'doVinesSpread', 'doWeatherCycle', 'doWardenSpawning', 'drowningDamage',
  'fallDamage', 'fireDamage', 'forgiveDeadPlayers', 'freezeDamage', 'keepInventory',
  'logAdminCommands', 'maxCommandChainLength', 'maxEntityCramming', 'mobGriefing',
  'naturalRegeneration', 'playersSleepingPercentage', 'randomTickSpeed', 'reducedDebugInfo',
  'sendCommandFeedback', 'showDeathMessages', 'spawnRadius', 'spectatorsGenerateChunks',
  'universalAnger',
] as const

export const COMMANDS: readonly CommandSpec[] = [
  { name: 'gamemode', usage: 'gamemode <mode> [target]', desc: "Set a player's game mode.", args: [{ name: 'mode', values: GAMEMODES }, { name: 'target' }] },
  { name: 'defaultgamemode', usage: 'defaultgamemode <mode>', desc: 'Set the default game mode for new players.', args: [{ name: 'mode', values: GAMEMODES }] },
  { name: 'difficulty', usage: 'difficulty <level>', desc: 'Set the world difficulty.', args: [{ name: 'level', values: DIFFICULTIES }] },
  { name: 'give', usage: 'give <target> <item> [count]', desc: 'Give an item to a player.', args: [{ name: 'target' }, { name: 'item' }, { name: 'count' }] },
  { name: 'clear', usage: 'clear [target] [item]', desc: "Clear items from a player's inventory.", args: [{ name: 'target' }] },
  { name: 'tp', usage: 'tp <target> <destination>', desc: 'Teleport a player to another player or coordinates.', args: [{ name: 'target' }, { name: 'destination' }] },
  { name: 'teleport', usage: 'teleport <target> <destination>', desc: 'Teleport entities (alias of tp).', args: [{ name: 'target' }, { name: 'destination' }] },
  { name: 'kill', usage: 'kill [target]', desc: 'Kill entities (players or a selector).', args: [{ name: 'target' }] },
  { name: 'summon', usage: 'summon <entity> [pos]', desc: 'Summon an entity at a position.', args: [{ name: 'entity' }] },
  { name: 'time', usage: 'time <set|add|query> [value]', desc: 'Change or query the world time.', args: [{ name: 'action', values: ['set', 'add', 'query'] }, { name: 'value', values: ['day', 'night', 'noon', 'midnight'] }] },
  { name: 'weather', usage: 'weather <type> [duration]', desc: 'Set the weather.', args: [{ name: 'type', values: ['clear', 'rain', 'thunder'] }] },
  { name: 'gamerule', usage: 'gamerule <rule> [value]', desc: 'View or change a game rule.', args: [{ name: 'rule', values: GAMERULES }, { name: 'value', values: BOOL }] },
  { name: 'effect', usage: 'effect give|clear <target> [effect]', desc: 'Add or remove status effects.', args: [{ name: 'action', values: ['give', 'clear'] }, { name: 'target' }] },
  { name: 'enchant', usage: 'enchant <target> <enchantment> [level]', desc: "Enchant a player's held item.", args: [{ name: 'target' }] },
  { name: 'xp', usage: 'xp add|set|query <target> <amount>', desc: 'Add, set, or query experience.', args: [{ name: 'action', values: ['add', 'set', 'query'] }, { name: 'target' }] },
  { name: 'experience', usage: 'experience add|set|query <target> <amount>', desc: 'Add, set, or query experience.', args: [{ name: 'action', values: ['add', 'set', 'query'] }, { name: 'target' }] },
  { name: 'op', usage: 'op <player>', desc: 'Grant operator status to a player.', args: [{ name: 'player' }] },
  { name: 'deop', usage: 'deop <player>', desc: 'Revoke operator status from a player.', args: [{ name: 'player' }] },
  { name: 'kick', usage: 'kick <player> [reason]', desc: 'Kick a player off the server.', args: [{ name: 'player' }] },
  { name: 'ban', usage: 'ban <player> [reason]', desc: 'Ban a player by name.', args: [{ name: 'player' }] },
  { name: 'ban-ip', usage: 'ban-ip <address|player> [reason]', desc: 'Ban an IP address.', args: [{ name: 'target' }] },
  { name: 'pardon', usage: 'pardon <player>', desc: 'Unban a player.', args: [{ name: 'player' }] },
  { name: 'pardon-ip', usage: 'pardon-ip <address>', desc: 'Unban an IP address.', args: [{ name: 'address' }] },
  { name: 'banlist', usage: 'banlist [players|ips]', desc: 'List bans.', args: [{ name: 'kind', values: ['players', 'ips'] }] },
  { name: 'whitelist', usage: 'whitelist <add|remove|list|on|off|reload>', desc: 'Manage the whitelist.', args: [{ name: 'action', values: ['add', 'remove', 'list', 'on', 'off', 'reload'] }] },
  { name: 'say', usage: 'say <message>', desc: 'Broadcast a message to everyone.', args: [{ name: 'message' }] },
  { name: 'tell', usage: 'tell <target> <message>', desc: 'Send a private message.', args: [{ name: 'target' }] },
  { name: 'msg', usage: 'msg <target> <message>', desc: 'Send a private message (alias of tell).', args: [{ name: 'target' }] },
  { name: 'tellraw', usage: 'tellraw <target> <json>', desc: 'Send a raw JSON message to a player.', args: [{ name: 'target' }] },
  { name: 'title', usage: 'title <target> <title|subtitle|actionbar|clear> ...', desc: 'Show a title on screen.', args: [{ name: 'target' }] },
  { name: 'setblock', usage: 'setblock <pos> <block>', desc: 'Place a block at a position.' },
  { name: 'fill', usage: 'fill <from> <to> <block>', desc: 'Fill a region with a block.' },
  { name: 'clone', usage: 'clone <begin> <end> <destination>', desc: 'Clone a region of blocks.' },
  { name: 'setworldspawn', usage: 'setworldspawn [pos]', desc: 'Set the world spawn point.' },
  { name: 'spawnpoint', usage: 'spawnpoint [target] [pos]', desc: "Set a player's spawn point.", args: [{ name: 'target' }] },
  { name: 'worldborder', usage: 'worldborder <set|add|center|...> ...', desc: 'Manage the world border.', args: [{ name: 'action', values: ['set', 'add', 'center', 'damage', 'get', 'warning'] }] },
  { name: 'seed', usage: 'seed', desc: 'Display the world seed.' },
  { name: 'list', usage: 'list [uuids]', desc: 'List online players.' },
  { name: 'help', usage: 'help [command]', desc: 'List commands or show help for one.' },
  { name: 'execute', usage: 'execute <subcommand> ...', desc: 'Execute a command in a modified context.', args: [{ name: 'subcommand', values: ['as', 'at', 'positioned', 'if', 'unless', 'run', 'store', 'rotated', 'facing', 'align', 'in'] }] },
  { name: 'scoreboard', usage: 'scoreboard <objectives|players> ...', desc: 'Manage scoreboards.', args: [{ name: 'kind', values: ['objectives', 'players'] }] },
  { name: 'team', usage: 'team <add|remove|join|...> ...', desc: 'Manage teams.', args: [{ name: 'action', values: ['add', 'remove', 'empty', 'join', 'leave', 'list', 'modify'] }] },
  { name: 'datapack', usage: 'datapack <list|enable|disable> ...', desc: 'Manage data packs.', args: [{ name: 'action', values: ['list', 'enable', 'disable'] }] },
  { name: 'reload', usage: 'reload', desc: 'Reload loot tables, advancements, and functions.' },
  { name: 'save-all', usage: 'save-all [flush]', desc: 'Save the world to disk.', args: [{ name: 'flush', values: ['flush'] }] },
  { name: 'save-on', usage: 'save-on', desc: 'Enable automatic world saving.' },
  { name: 'save-off', usage: 'save-off', desc: 'Disable automatic world saving.' },
  { name: 'stop', usage: 'stop', desc: 'Stop the server.' },
  { name: 'setidletimeout', usage: 'setidletimeout <minutes>', desc: 'Set the player idle timeout.' },
  { name: 'playsound', usage: 'playsound <sound> <source> <target> ...', desc: 'Play a sound.' },
  { name: 'stopsound', usage: 'stopsound <target> [source] [sound]', desc: 'Stop a sound.', args: [{ name: 'target' }] },
  { name: 'particle', usage: 'particle <name> [pos] ...', desc: 'Create particles.' },
  { name: 'locate', usage: 'locate <structure|biome|poi> <id>', desc: 'Locate the nearest structure, biome, or point of interest.', args: [{ name: 'kind', values: ['structure', 'biome', 'poi'] }] },
  { name: 'spark', usage: 'spark <tps|health|profiler|...>', desc: 'spark profiler & performance tools.', args: [{ name: 'sub', values: ['tps', 'health', 'profiler', 'gc', 'ping', 'heapsummary', 'activity'] }] },
]

// Sorted names for fast prefix matching.
const SORTED = [...COMMANDS].map((c) => c.name).sort()

export function findCommand(name: string): CommandSpec | undefined {
  const n = name.toLowerCase()
  return COMMANDS.find((c) => c.name === n)
}

// A broader set of vanilla (1.21-era) command *names* than the curated
// suggestion list above — used to tell a console command from chat. Anything
// here, typed without a leading slash, still runs as a command; an unknown
// first word is treated as chat. Modded or late commands always work by
// prefixing "/". Duplicates with COMMANDS are harmless (it's a Set).
const COMMAND_NAMES = new Set<string>([
  ...COMMANDS.map((c) => c.name),
  'advancement', 'attribute', 'bossbar', 'damage', 'data', 'debug', 'deop',
  'fillbiome', 'forceload', 'function', 'item', 'jfr', 'loot', 'me', 'perf',
  'place', 'publish', 'random', 'recipe', 'return', 'ride', 'schedule',
  'spectate', 'spreadplayers', 'tag', 'teammsg', 'tm', 'transfer', 'trigger',
  'w', 'pardon-ip', 'spark',
])

/** True when `token` is a known Minecraft command name (case-insensitive). */
export function isCommandName(token: string): boolean {
  return COMMAND_NAMES.has(token.toLowerCase())
}

export interface Suggestion {
  /** The text to insert for the current token. */
  value: string
  /** Secondary hint shown dimmed (usage for commands, arg name for values). */
  hint?: string
  /** True when this completes a whole command (so we can show its usage as preview). */
  isCommand?: boolean
}

/**
 * Compute suggestions for the current input. Purely client-side and cheap:
 * a prefix filter over the static registry.
 *
 * - While typing the first token → matching command names.
 * - After the command, when the argument at that position is an enum → its
 *   values (prefix-filtered).
 *
 * Returns the suggestions plus the resolved command (for the usage preview)
 * and the [start,end] slice of `input` that a completion should replace.
 */
export function getSuggestions(input: string): {
  items: Suggestion[]
  command?: CommandSpec
  replaceStart: number
  replaceEnd: number
} {
  // Split preserving the trailing-space case: "gamemode " → tokens ['gamemode','']
  const tokens = input.split(' ')
  const command = tokens.length > 1 ? findCommand(tokens[0]) : undefined

  // Position of the token currently being typed.
  const lastToken = tokens[tokens.length - 1]
  const replaceEnd = input.length
  const replaceStart = input.length - lastToken.length

  // First token → command-name completion.
  if (tokens.length === 1) {
    const q = lastToken.toLowerCase()
    if (!q) return { items: [], replaceStart, replaceEnd }
    const items = SORTED.filter((n) => n.startsWith(q))
      .slice(0, 8)
      .map<Suggestion>((n) => ({ value: n, hint: findCommand(n)?.usage, isCommand: true }))
    return { items, command: findCommand(q), replaceStart, replaceEnd }
  }

  // Argument completion for enum args.
  if (command?.args) {
    const argIndex = tokens.length - 2 // args after the command name
    const spec = command.args[argIndex]
    if (spec?.values) {
      const q = lastToken.toLowerCase()
      const items = spec.values
        .filter((v) => v.toLowerCase().startsWith(q))
        .slice(0, 8)
        .map<Suggestion>((v) => ({ value: v, hint: spec.name }))
      return { items, command, replaceStart, replaceEnd }
    }
  }

  // No specific completions, but keep the command around for the usage preview.
  return { items: [], command, replaceStart, replaceEnd }
}
