export interface ServerProperties {
  'enable-jmx-monitoring': boolean
  'rcon.port': number
  'level-seed': string
  gamemode: string
  'enable-command-block': boolean
  'enable-query': boolean
  'generator-settings': string
  'enforce-secure-profile': boolean
  'level-name': string
  motd: string
  'query.port': number
  pvp: boolean
  'generate-structures': boolean
  'max-chained-neighbor-updates': number
  difficulty: string
  'network-compression-threshold': number
  'max-tick-time': number
  'require-resource-pack': boolean
  'use-native-transport': boolean
  'max-players': number
  'online-mode': boolean
  'enable-status': boolean
  'allow-flight': boolean
  'initial-disabled-packs': string
  'broadcast-rcon-to-ops': boolean
  'view-distance': number
  'server-ip': string
  'resource-pack-prompt': string
  'allow-nether': boolean
  'server-port': number
  'enable-rcon': boolean
  'sync-chunk-writes': boolean
  'op-permission-level': number
  'prevent-proxy-connections': boolean
  'hide-online-players': boolean
  'resource-pack': string
  'entity-broadcast-range-percentage': number
  'simulation-distance': number
  'rcon.password': string
  'player-idle-timeout': number
  'force-gamemode': boolean
  'rate-limit': number
  hardcore: boolean
  'white-list': boolean
  'broadcast-console-to-ops': boolean
  'spawn-npcs': boolean
  'spawn-animals': boolean
  'log-ips': boolean
  'function-permission-level': number
  'initial-enabled-packs': string
  'level-type': string
  'text-filtering-config': string
  'spawn-monsters': boolean
  'enforce-whitelist': boolean
  'spawn-protection': number
  'resource-pack-sha1': string
  'max-world-size': number
}

export type PropertyField = {
  key: keyof ServerProperties
  label: string
  description?: string
  type: 'boolean' | 'number' | 'string' | 'select'
  options?: { value: string; label: string }[]
}

export const defaultProperties: ServerProperties = {
  'enable-jmx-monitoring': false,
  'rcon.port': 25575,
  'level-seed': '',
  gamemode: 'survival',
  'enable-command-block': false,
  'enable-query': false,
  'generator-settings': '{}',
  'enforce-secure-profile': true,
  'level-name': 'world',
  motd: 'A Minecraft Server',
  'query.port': 25565,
  pvp: true,
  'generate-structures': true,
  'max-chained-neighbor-updates': 1000000,
  difficulty: 'easy',
  'network-compression-threshold': 256,
  'max-tick-time': 60000,
  'require-resource-pack': false,
  'use-native-transport': true,
  'max-players': 20,
  'online-mode': true,
  'enable-status': true,
  'allow-flight': false,
  'initial-disabled-packs': '',
  'broadcast-rcon-to-ops': true,
  'view-distance': 10,
  'server-ip': '',
  'resource-pack-prompt': '',
  'allow-nether': true,
  'server-port': 25565,
  'enable-rcon': false,
  'sync-chunk-writes': true,
  'op-permission-level': 4,
  'prevent-proxy-connections': false,
  'hide-online-players': false,
  'resource-pack': '',
  'entity-broadcast-range-percentage': 100,
  'simulation-distance': 10,
  'rcon.password': '',
  'player-idle-timeout': 0,
  'force-gamemode': false,
  'rate-limit': 0,
  hardcore: false,
  'white-list': false,
  'broadcast-console-to-ops': true,
  'spawn-npcs': true,
  'spawn-animals': true,
  'log-ips': true,
  'function-permission-level': 2,
  'initial-enabled-packs': 'vanilla',
  'level-type': 'minecraft\\:normal',
  'text-filtering-config': '',
  'spawn-monsters': true,
  'enforce-whitelist': false,
  'spawn-protection': 16,
  'resource-pack-sha1': '',
  'max-world-size': 29999984,
}

export const basicPropertyFields: PropertyField[] = [
  { key: 'server-port', label: 'Server Port', description: 'Port the server listens on', type: 'number' },
  { key: 'max-players', label: 'Max Players', description: 'Maximum simultaneous players', type: 'number' },
  { key: 'motd', label: 'Message of the Day', description: 'Shown in the server list', type: 'string' },
  { key: 'level-name', label: 'Level Name', description: 'World folder name', type: 'string' },
  { key: 'level-seed', label: 'Level Seed', description: 'World generation seed', type: 'string' },
  { key: 'level-type', label: 'Level Type', description: 'World generation type', type: 'select', options: [
    { value: 'minecraft\\:normal', label: 'Normal' },
    { value: 'minecraft\\:flat', label: 'Flat' },
    { value: 'minecraft\\:large_biomes', label: 'Large Biomes' },
    { value: 'minecraft\\:amplified', label: 'Amplified' },
    { value: 'minecraft\\:single_biome_surface', label: 'Single Biome' },
  ] },
  { key: 'gamemode', label: 'Gamemode', description: 'Default game mode for new players', type: 'select', options: [
    { value: 'survival', label: 'Survival' },
    { value: 'creative', label: 'Creative' },
    { value: 'adventure', label: 'Adventure' },
    { value: 'spectator', label: 'Spectator' },
  ] },
  { key: 'difficulty', label: 'Difficulty', description: 'Server difficulty level', type: 'select', options: [
    { value: 'peaceful', label: 'Peaceful' },
    { value: 'easy', label: 'Easy' },
    { value: 'normal', label: 'Normal' },
    { value: 'hard', label: 'Hard' },
  ] },
  { key: 'hardcore', label: 'Hardcore', description: 'Players are banned on death', type: 'boolean' },
  { key: 'pvp', label: 'PvP', description: 'Players can damage each other', type: 'boolean' },
  { key: 'online-mode', label: 'Online Mode', description: 'Verify players with Mojang', type: 'boolean' },
  { key: 'allow-flight', label: 'Allow Flight', description: 'Allow survival flight mods', type: 'boolean' },
  { key: 'allow-nether', label: 'Allow Nether', description: 'Enable the Nether dimension', type: 'boolean' },
  { key: 'generate-structures', label: 'Generate Structures', description: 'Generate villages, temples, etc.', type: 'boolean' },
  { key: 'spawn-npcs', label: 'Spawn NPCs', description: 'Spawn villagers', type: 'boolean' },
  { key: 'spawn-animals', label: 'Spawn Animals', description: 'Spawn passive mobs', type: 'boolean' },
  { key: 'spawn-monsters', label: 'Spawn Monsters', description: 'Spawn hostile mobs', type: 'boolean' },
  { key: 'white-list', label: 'Whitelist', description: 'Only whitelisted players can join', type: 'boolean' },
  { key: 'view-distance', label: 'View Distance', description: 'Chunks sent to players (3-32)', type: 'number' },
  { key: 'simulation-distance', label: 'Simulation Distance', description: 'Chunk tick distance (3-32)', type: 'number' },
  { key: 'spawn-protection', label: 'Spawn Protection Radius', description: 'Blocks around spawn non-ops cannot modify', type: 'number' },
]

export const advancedPropertyFields: PropertyField[] = [
  { key: 'server-ip', label: 'Server IP', description: 'Bind to specific IP address', type: 'string' },
  { key: 'force-gamemode', label: 'Force Gamemode', description: 'Force default gamemode on join', type: 'boolean' },
  { key: 'max-world-size', label: 'Max World Size', description: 'Max world border radius in blocks', type: 'number' },
  { key: 'max-tick-time', label: 'Max Tick Time (ms)', description: 'Watchdog crash threshold (-1 to disable)', type: 'number' },
  { key: 'max-chained-neighbor-updates', label: 'Max Chained Neighbor Updates', description: 'Limit cascading block updates', type: 'number' },
  { key: 'network-compression-threshold', label: 'Network Compression Threshold', description: 'Packet size before compression (bytes)', type: 'number' },
  { key: 'entity-broadcast-range-percentage', label: 'Entity Broadcast Range %', description: 'Entity visibility range multiplier', type: 'number' },
  { key: 'player-idle-timeout', label: 'Player Idle Timeout (min)', description: 'Kick idle players (0 to disable)', type: 'number' },
  { key: 'rate-limit', label: 'Rate Limit', description: 'Max packets/sec before kick (0 to disable)', type: 'number' },
  { key: 'op-permission-level', label: 'OP Permission Level', description: 'Default OP permission level (1-4)', type: 'number' },
  { key: 'function-permission-level', label: 'Function Permission Level', description: 'Permission level for function commands', type: 'number' },
  { key: 'enforce-whitelist', label: 'Enforce Whitelist', description: 'Kick non-whitelisted on reload', type: 'boolean' },
  { key: 'enable-command-block', label: 'Enable Command Blocks', description: 'Allow command blocks', type: 'boolean' },
  { key: 'enable-status', label: 'Enable Status', description: 'Show in server list', type: 'boolean' },
  { key: 'enable-query', label: 'Enable Query', description: 'Enable GameSpy4 query protocol', type: 'boolean' },
  { key: 'query.port', label: 'Query Port', description: 'Port for query protocol', type: 'number' },
  { key: 'enable-rcon', label: 'Enable RCON', description: 'Enable remote console', type: 'boolean' },
  { key: 'rcon.port', label: 'RCON Port', description: 'Port for RCON connections', type: 'number' },
  { key: 'rcon.password', label: 'RCON Password', description: 'Password for RCON access', type: 'string' },
  { key: 'broadcast-rcon-to-ops', label: 'Broadcast RCON to OPs', description: 'Show RCON output to operators', type: 'boolean' },
  { key: 'broadcast-console-to-ops', label: 'Broadcast Console to OPs', description: 'Show console output to operators', type: 'boolean' },
  { key: 'enable-jmx-monitoring', label: 'Enable JMX Monitoring', description: 'Expose JMX MBeans', type: 'boolean' },
  { key: 'enforce-secure-profile', label: 'Enforce Secure Profile', description: 'Require Mojang-signed chat', type: 'boolean' },
  { key: 'use-native-transport', label: 'Use Native Transport', description: 'Use optimized Linux networking', type: 'boolean' },
  { key: 'sync-chunk-writes', label: 'Sync Chunk Writes', description: 'Synchronous chunk saving', type: 'boolean' },
  { key: 'prevent-proxy-connections', label: 'Prevent Proxy Connections', description: 'Block proxy/VPN connections', type: 'boolean' },
  { key: 'hide-online-players', label: 'Hide Online Players', description: 'Hide player count in server list', type: 'boolean' },
  { key: 'log-ips', label: 'Log IPs', description: 'Log player IP addresses', type: 'boolean' },
  { key: 'require-resource-pack', label: 'Require Resource Pack', description: 'Kick players who decline', type: 'boolean' },
  { key: 'resource-pack', label: 'Resource Pack URL', description: 'URL to resource pack .zip', type: 'string' },
  { key: 'resource-pack-sha1', label: 'Resource Pack SHA1', description: 'Hash for pack verification', type: 'string' },
  { key: 'resource-pack-prompt', label: 'Resource Pack Prompt', description: 'Custom prompt message', type: 'string' },
  { key: 'generator-settings', label: 'Generator Settings', description: 'JSON for flat world layers', type: 'string' },
  { key: 'initial-enabled-packs', label: 'Initial Enabled Packs', description: 'Data packs enabled by default', type: 'string' },
  { key: 'initial-disabled-packs', label: 'Initial Disabled Packs', description: 'Data packs disabled by default', type: 'string' },
  { key: 'text-filtering-config', label: 'Text Filtering Config', description: 'Chat text filtering config', type: 'string' },
]

export const propertyFields: PropertyField[] = [...basicPropertyFields, ...advancedPropertyFields]
