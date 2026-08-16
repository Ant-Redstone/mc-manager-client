// The extension is required, not stylistic: tests/ runs under plain
// `node --test` with no bundler, where a bare './api' does not resolve. Same
// reason servers.ts writes it this way, and tsconfig allows it.
import { apiFetch, authHeaders, type ApiResult } from './api.ts'

export interface Action {
  type: 'discord' | 'command' | 'spark' | 'backup' | 'restart'
  webhook_id?: number
  message?: string
  mention?: string
  command?: string
  warnings?: number[]
}

export interface Rule {
  id: number
  server_id: string
  name: string
  enabled: boolean
  trigger_kind: string
  trigger_config: Record<string, unknown>
  actions: Action[]
  cooldown_seconds: number
  stop_on_failure: boolean
  deaf_window_seconds: number
  last_fired_at?: string
  created_by?: number
  created_at?: string
}

/** A destination. The URL is a credential and never leaves the server, so
 *  there is no field for it here — deliberately, not by omission. */
export interface Webhook {
  id: number
  name: string
  last_status?: number | null
  last_error?: string | null
  last_used_at?: string | null
  created_at?: string
}

export interface Firing {
  id: number
  rule_id: number
  fired_at: string
  trigger: string
  outcome: string
}

/**
 * The triggers, in the order the builder shows them. `config` picks which form
 * to draw; the label is what the operator reads to choose.
 */
export const TRIGGERS = [
  { kind: 'console', label: 'Uma linha no console', config: 'pattern' },
  { kind: 'join', label: 'Alguém entra', config: 'firstTime' },
  { kind: 'leave', label: 'Alguém sai', config: 'none' },
  { kind: 'start', label: 'O servidor liga', config: 'none' },
  { kind: 'stop', label: 'O servidor cai', config: 'none' },
  { kind: 'tps', label: 'TPS abaixo de', config: 'threshold' },
  { kind: 'count', label: 'Jogadores online acima de', config: 'threshold' },
  { kind: 'disk', label: 'Disco acima de', config: 'threshold' },
  { kind: 'backup-ok', label: 'Um backup termina', config: 'none' },
  { kind: 'backup-fail', label: 'Um backup falha', config: 'none' },
  { kind: 'sched', label: 'Em horário', config: 'schedule' },
] as const

export const ACTIONS = [
  { type: 'discord', label: 'Avisar no Discord' },
  { type: 'command', label: 'Rodar um comando' },
  { type: 'backup', label: 'Fazer um backup' },
  { type: 'spark', label: 'Rodar o spark' },
  { type: 'restart', label: 'Reiniciar o servidor' },
] as const

/** Triggers whose quantity reads as "above". The above/below pair is what
 *  picks the comparison on the server, so this decides which key gets written. */
const ABOVE_KINDS = new Set(['count', 'disk'])

export interface TriggerForm {
  pattern?: string
  firstTimeOnly?: boolean
  threshold?: number
  forSeconds?: number
  mode?: 'every' | 'daily'
  hours?: number
  time?: string
}

/**
 * Builds the `trigger_config` the server's matcher reads. The key names are a
 * contract, and getting one wrong raises nothing: it stores a rule that can
 * never fire and never says why.
 *
 * Two of them are easy to get wrong from memory. The window is `for_seconds`,
 * not `held_for_seconds`. And it is `above` OR `below`, never both —
 * thresholdHeld tests `above` first and only then falls back to `below`, so
 * sending both silently ignores the one you meant.
 */
export function buildTriggerConfig(kind: string, form: TriggerForm): Record<string, unknown> {
  switch (kind) {
    case 'console':
      return { pattern: form.pattern ?? '' }
    case 'join':
      return form.firstTimeOnly ? { first_time_only: true } : {}
    case 'tps':
    case 'count':
    case 'disk': {
      const cfg: Record<string, unknown> = {}
      cfg[ABOVE_KINDS.has(kind) ? 'above' : 'below'] = form.threshold ?? 0
      // Omitted rather than written as zero: a zero-second window and no window
      // are the same thing to the server, and the stored config stays readable.
      if (form.forSeconds && form.forSeconds > 0) cfg.for_seconds = form.forSeconds
      return cfg
    }
    case 'sched':
      return form.mode === 'daily'
        ? { mode: 'daily', time: form.time ?? '05:00' }
        : { mode: 'every', hours: form.hours ?? 6 }
    default:
      return {}
  }
}

/** The way back. Without it, editing an existing rule loses its configuration. */
export function readTriggerConfig(kind: string, cfg: Record<string, unknown>): TriggerForm {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback)
  switch (kind) {
    case 'console':
      return { pattern: typeof cfg.pattern === 'string' ? cfg.pattern : '' }
    case 'join':
      return { firstTimeOnly: cfg.first_time_only === true }
    case 'tps':
    case 'count':
    case 'disk':
      return {
        threshold: num(ABOVE_KINDS.has(kind) ? cfg.above : cfg.below, 0),
        forSeconds: num(cfg.for_seconds, 0),
      }
    case 'sched':
      return cfg.mode === 'daily'
        ? { mode: 'daily', time: typeof cfg.time === 'string' ? cfg.time : '05:00' }
        : { mode: 'every', hours: num(cfg.hours, 6) }
    default:
      return {}
  }
}

/**
 * The variables that exist for this trigger. The server only interpolates what
 * the event carries, and leaves an unknown name literal — so offering the wrong
 * one produces a message with "{player}" visible inside it.
 */
export function variablesFor(kind: string): string[] {
  const base = ['server', 'time']
  switch (kind) {
    case 'join':
    case 'leave':
      return [...base, 'player']
    // thresholdHeld names the variable with the sample kind itself, so a disk
    // rule carries {disk} and a player-count rule carries {count} — not {tps}.
    case 'tps':
    case 'count':
    case 'disk':
      return [...base, kind]
    case 'console':
      return [...base, 'line']
    default:
      return base
  }
}

/**
 * Mirrors the server's ValidateAction so the builder can say why without a
 * round-trip. The server still validates — this is the echo, not the guard.
 */
export function validateAction(a: Action): string | null {
  switch (a.type) {
    case 'discord':
      if (!a.webhook_id) return 'escolha um destino do Discord'
      if (!a.message?.trim()) return 'escreva a mensagem'
      return null
    case 'command': {
      const cmd = a.command ?? ''
      if (!cmd.trim()) return 'escreva o comando'
      if (/[\r\n]/.test(cmd)) {
        return 'um comando não pode ter quebra de linha: o servidor leria o resto como um segundo comando'
      }
      if (cmd.includes('{line}')) {
        return '{line} não pode ser usada num comando: ela é escrita por um jogador, então ele escolheria o que o servidor roda. Use numa mensagem do Discord'
      }
      return null
    }
    case 'restart':
      if ((a.warnings ?? []).some((w) => w <= 0)) {
        return 'cada aviso precisa ser um número de segundos positivo'
      }
      return null
    default:
      return null
  }
}

export function validateActions(actions: Action[]): string | null {
  if (actions.length === 0) return 'uma regra precisa de pelo menos uma ação'
  for (let i = 0; i < actions.length; i++) {
    const err = validateAction(actions[i])
    if (err) return `ação ${i + 1}: ${err}`
  }
  return null
}

const ACTION_SUMMARY: Record<string, string> = {
  discord: 'avisa no Discord',
  command: 'roda um comando',
  backup: 'faz um backup',
  spark: 'roda o spark',
  restart: 'reinicia o servidor',
}

/**
 * The line the list shows. Built from the stored config rather than written by
 * hand, because a summary that drifts from the rule is worse than no summary:
 * the operator trusts it and the rule does something else.
 */
export function describeRule(r: Rule): string {
  const form = readTriggerConfig(r.trigger_kind, r.trigger_config ?? {})
  const held = form.forSeconds ? ` por ${Math.round(form.forSeconds / 60)} min` : ''

  let when: string
  switch (r.trigger_kind) {
    case 'console':
      when = `o console casar "${form.pattern}"`
      break
    case 'join':
      when = form.firstTimeOnly ? 'alguém entrar pela primeira vez' : 'alguém entrar'
      break
    case 'leave':
      when = 'alguém sair'
      break
    case 'start':
      when = 'o servidor ligar'
      break
    case 'stop':
      when = 'o servidor cair'
      break
    case 'tps':
      when = `o TPS ficar abaixo de ${form.threshold}${held}`
      break
    case 'count':
      when = `houver mais de ${form.threshold} jogadores${held}`
      break
    case 'disk':
      when = `o disco passar de ${form.threshold}%${held}`
      break
    case 'backup-ok':
      when = 'um backup terminar'
      break
    case 'backup-fail':
      when = 'um backup falhar'
      break
    case 'sched':
      when = form.mode === 'daily' ? `for ${form.time}` : `passarem ${form.hours}h`
      break
    default:
      when = r.trigger_kind
  }

  const does = (r.actions ?? []).map((a) => ACTION_SUMMARY[a.type] ?? a.type).join(', ')
  return `Quando ${when} → ${does}`
}

/** One entry of a firing's recorded outcome, as the server writes it. */
export interface FiringStep {
  action: string
  ok: boolean
  error?: string
}

/**
 * Reads a firing's outcome column. It is JSON written by the server, and a
 * history row is not worth throwing an error over — a firing whose outcome
 * cannot be parsed still happened, and saying so beats a blank row.
 */
export function readOutcome(outcome: string): FiringStep[] {
  try {
    const parsed: unknown = JSON.parse(outcome)
    return Array.isArray(parsed) ? (parsed as FiringStep[]) : []
  } catch {
    return []
  }
}

// --- API -----------------------------------------------------------------

export function fetchRules(token: string | null): Promise<ApiResult<Rule[]>> {
  return apiFetch<Rule[]>('/automations', { headers: authHeaders(token) })
}

export function fetchFirings(token: string | null, id: number): Promise<ApiResult<Firing[]>> {
  return apiFetch<Firing[]>(`/automations/${id}/firings`, { headers: authHeaders(token) })
}

/** The write body. Built field by field rather than by spreading a Rule: the
 *  server ignores id/last_fired_at/created_at on purpose, and sending them
 *  anyway hides the day one of them starts being accepted. */
export interface RuleInput {
  server_id: string
  name: string
  enabled: boolean
  trigger_kind: string
  trigger_config: Record<string, unknown>
  actions: Action[]
  cooldown_seconds: number
  stop_on_failure: boolean
  deaf_window_seconds: number
}

/** Create or edit, decided by the id — the builder is the same screen for both. */
export function saveRule(
  token: string | null,
  id: number | null,
  input: RuleInput,
): Promise<ApiResult<Rule>> {
  const editing = typeof id === 'number' && id > 0
  return apiFetch<Rule>(editing ? `/automations/${id}` : '/automations', {
    method: editing ? 'PUT' : 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  })
}

export function deleteRule(token: string | null, id: number): Promise<ApiResult<unknown>> {
  return apiFetch(`/automations/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}

export function setRuleEnabled(
  token: string | null,
  id: number,
  enabled: boolean,
): Promise<ApiResult<unknown>> {
  return apiFetch(`/automations/${id}/enabled`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ enabled }),
  })
}

export function fetchWebhooks(token: string | null): Promise<ApiResult<Webhook[]>> {
  return apiFetch<Webhook[]>('/automation-webhooks', { headers: authHeaders(token) })
}

export function createWebhook(
  token: string | null,
  name: string,
  url: string,
): Promise<ApiResult<Webhook>> {
  return apiFetch<Webhook>('/automation-webhooks', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name, url }),
  })
}

export function deleteWebhook(token: string | null, id: number): Promise<ApiResult<unknown>> {
  return apiFetch(`/automation-webhooks/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}

export function testWebhook(token: string | null, id: number): Promise<ApiResult<unknown>> {
  return apiFetch(`/automation-webhooks/${id}/test`, {
    method: 'POST',
    headers: authHeaders(token),
  })
}
