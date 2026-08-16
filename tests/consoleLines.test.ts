import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyLine, contentOf, isQuietContent, parseScoreLine, parseWaypointLine,
  parseSessionLine, isUnknownObjective, noScoreObjective, nameColor, matchesHideRules,
  parseBroadcastRecord,
} from '../src/lib/consoleLines.ts'

const P = '[12:41:22] [Server thread/INFO]: '

test('classifies chat with time, who and text', () => {
  const l = classifyLine(P + '<Notch> hey, anyone near spawn?')
  assert.equal(l.type, 'chat')
  assert.equal(l.who, 'Notch')
  assert.equal(l.text, 'hey, anyone near spawn?')
  assert.equal(l.time, '12:41:22')
  assert.equal(l.quiet, false)
})

test('classifies join, leave and advancement variants', () => {
  assert.equal(classifyLine(P + 'Steve joined the game').type, 'join')
  assert.equal(classifyLine(P + 'Steve left the game').type, 'leave')
  const a = classifyLine(P + 'Notch has made the advancement [Stone Age]')
  assert.equal(a.type, 'adv')
  assert.equal(a.adv, 'Stone Age')
  assert.equal(classifyLine(P + 'Notch has completed the challenge [Cover Me in Debris]').type, 'adv')
  assert.equal(classifyLine(P + 'Notch has reached the goal [Hot Stuff]').type, 'adv')
})

test('classifies deaths by vanilla verbs; near-miss text stays system', () => {
  const d = classifyLine(P + 'Steve was slain by Zombie')
  assert.equal(d.type, 'death')
  assert.equal(d.who, 'Steve')
  assert.equal(classifyLine(P + 'Steve tried to swim in lava').type, 'death')
  assert.equal(classifyLine(P + 'Steve lost connection: Disconnected').type, 'system')
})

test('classifies levels and command echoes', () => {
  assert.equal(classifyLine("[12:42:20] [Server thread/WARN]: Can't keep up!").type, 'warn')
  assert.equal(classifyLine('[12:42:21] [Server thread/ERROR]: boom').type, 'error')
  const c = classifyLine('> list')
  assert.equal(c.type, 'cmd')
  assert.equal(c.text, 'list')
})

test('quiet rules fold mcm.* traffic only', () => {
  assert.equal(isQuietContent('Notch has 5410800 [mcm.playtime]'), true)
  assert.equal(isQuietContent("Unknown scoreboard objective 'mcm.playtime'"), true)
  assert.equal(isQuietContent("Can't get value of mcm.deaths for Notch; none is set"), true)
  assert.equal(isQuietContent('Storage mcm:waypoints has the following contents: {x: 128, y: 70, z: -64}'), true)
  assert.equal(isQuietContent('Modified storage mcm:waypoints'), true)
  assert.equal(isQuietContent('> scoreboard players get Notch mcm.playtime'), true)
  assert.equal(isQuietContent('> data get storage mcm:waypoints spawn'), true)
  // Ordinary traffic never folds.
  assert.equal(isQuietContent('Notch has 20 [totalKills]'), false)
  assert.equal(isQuietContent('> scoreboard players get Notch totalKills'), false)
  assert.equal(isQuietContent('<Notch> mcm.playtime is a weird name'), false)
})

test('quiet classification flows through classifyLine', () => {
  const l = classifyLine(P + 'Notch has 12 [mcm.deaths]')
  assert.equal(l.quiet, true)
  assert.equal(l.type, 'system')
})

test('parseScoreLine extracts values strictly', () => {
  assert.equal(parseScoreLine('Notch has 5410800 [mcm.playtime]', 'Notch', 'mcm.playtime'), 5410800)
  assert.equal(parseScoreLine('Notch has -3 [mcm.deaths]', 'Notch', 'mcm.deaths'), -3)
  assert.equal(parseScoreLine('Notch has 12 [mcm.deaths]', 'Steve', 'mcm.deaths'), null)
  assert.equal(parseScoreLine('Notch has 12 [mcm.deaths]', 'Notch', 'mcm.playtime'), null)
  assert.equal(parseScoreLine('anything', 'bad name', 'mcm.playtime'), null)
})

test('parseWaypointLine reads coords with spacing and float/typed values', () => {
  const c = parseWaypointLine('Storage mcm:waypoints has the following contents: {x: 128, y: 70, z: -64, dim: "minecraft:overworld"}')
  assert.deepEqual(c, { x: 128, y: 70, z: -64 })
  const f = parseWaypointLine('Storage mcm:waypoints has the following contents: {x:128.5d,y:70.0d,z:-63.5d}')
  // Math.round rounds half toward +∞: 128.5 → 129, -63.5 → -63.
  assert.deepEqual(f, { x: 129, y: 70, z: -63 })
  assert.equal(parseWaypointLine('Storage other:thing has the following contents: {x:1,y:2,z:3}'), null)
  assert.equal(parseWaypointLine('Storage mcm:waypoints has the following contents: {name:"spawn"}'), null)
})

test('auto-setup traffic is quiet too', () => {
  assert.equal(isQuietContent('> scoreboard objectives add mcm.playtime minecraft.custom:minecraft.play_time'), true)
  assert.equal(isQuietContent('Created new objective [mcm.playtime]'), true)
  assert.equal(isQuietContent('Created new objective [totalKills]'), false)
})

test('parseSessionLine reads the per-player join stamp', () => {
  assert.equal(parseSessionLine('Storage mcm:sessions has the following contents: 1720620000000L'), 1720620000000)
  assert.equal(parseSessionLine('Storage mcm:sessions has the following contents: 1720620000000'), 1720620000000)
  assert.equal(parseSessionLine('Storage mcm:waypoints has the following contents: {x:1,y:2,z:3}'), null)
  assert.equal(parseSessionLine('<Notch> Storage mcm:sessions has the following contents: 5'), null)
})

test('objective-missing helpers', () => {
  assert.equal(isUnknownObjective("Unknown scoreboard objective 'mcm.playtime'"), true)
  assert.equal(isUnknownObjective("Unknown scoreboard objective 'totalKills'"), false)
  assert.equal(noScoreObjective("Can't get value of mcm.playtime for Notch; none is set"), 'mcm.playtime')
  assert.equal(noScoreObjective('Notch has 3 [mcm.playtime]'), null)
})

test('matchesHideRules: plain text is a case-insensitive substring', () => {
  const c = 'There are 3 of a max of 20 players online: Notch, Steve'
  assert.equal(matchesHideRules(c, ['of a max of']), true)
  assert.equal(matchesHideRules(c, ['PLAYERS ONLINE']), true)
  assert.equal(matchesHideRules(c, ['creepers']), false)
  assert.equal(matchesHideRules(c, []), false)
  assert.equal(matchesHideRules(c, ['  ']), false)
})

test('matchesHideRules: plain text with regex chars stays literal', () => {
  // "[Server]" must match the literal bracketed text, not a character class.
  assert.equal(matchesHideRules('[Server] hello', ['[Server]']), true)
  assert.equal(matchesHideRules('save-all complete', ['[Server]']), false)
})

test('matchesHideRules: /regex/ form is honored, invalid falls back to literal', () => {
  assert.equal(matchesHideRules('players online: 3', ['/players? online/']), true)
  assert.equal(matchesHideRules('Player online', ['/^players/i']), false)
  assert.equal(matchesHideRules('CamelCase', ['/camel/']), false) // no i flag → case-sensitive
  assert.equal(matchesHideRules('CamelCase', ['/camel/i']), true)
  // Malformed regex → literal fallback (the raw string is searched as-is).
  assert.equal(matchesHideRules('a /oops(/ b', ['/oops(/']), true)
})

test('contentOf strips the log prefix and passes bare lines through', () => {
  assert.equal(contentOf(P + 'hello there'), 'hello there')
  assert.equal(contentOf('> list'), '> list')
})

test('nameColor is stable per name', () => {
  assert.equal(nameColor('Notch'), nameColor('Notch'))
  assert.match(nameColor('Steve'), /^#[0-9a-f]{6}$/i)
})

test('parseBroadcastRecord reads the round-tripped message, unescaping quotes', () => {
  assert.equal(
    parseBroadcastRecord('Storage broadcast:log has the following contents: {msg: "[Admin] Ant: hello everyone"}'),
    '[Admin] Ant: hello everyone',
  )
  // Escaped quotes in the stored value come back as real quotes.
  assert.equal(
    parseBroadcastRecord('Storage broadcast:log has the following contents: {msg: "[Admin] Ant: he said \\"hi\\""}'),
    '[Admin] Ant: he said "hi"',
  )
  // Other storage reads (and the mcm:* ones) are not broadcast records.
  assert.equal(parseBroadcastRecord('Storage mcm:waypoints has the following contents: {x:1,y:2,z:3}'), null)
  assert.equal(parseBroadcastRecord('<Notch> Storage broadcast:log has the following contents: {msg: "spoof"}'), null)
})

test('classifyLine renders a broadcast record, and folds only the write echo', () => {
  const rec = classifyLine(P + 'Storage broadcast:log has the following contents: {msg: "[Admin] Ant: hi"}')
  assert.equal(rec.broadcast, true)
  assert.equal(rec.text, '[Admin] Ant: hi')
  assert.equal(rec.quiet, false) // the record itself stays visible
  // The store half is machine noise and folds away.
  assert.equal(isQuietContent('Modified storage broadcast:log'), true)
  assert.equal(classifyLine(P + 'Modified storage broadcast:log').quiet, true)
})
