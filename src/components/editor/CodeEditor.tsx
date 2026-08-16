import { useMemo, useRef } from 'react'
import { highlightJson, highlightPlain, highlightProperties, type Language } from '../../lib/jsonHighlight'
import './CodeEditor.css'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language: Language
  ariaLabel?: string
}

/**
 * A lightweight code editor: a transparent <textarea> layered over a
 * syntax-highlighted <pre>, with a line-number gutter. No editor dependency;
 * highlighting is memoized and skipped for very large files (see
 * jsonHighlight's HIGHLIGHT_LIMIT) so typing stays responsive.
 */
function CodeEditor({ value, onChange, language, ariaLabel }: CodeEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLPreElement>(null)

  const html = useMemo(() => {
    if (language === 'json') return highlightJson(value)
    if (language === 'properties') return highlightProperties(value)
    return highlightPlain(value)
  }, [value, language])
  // Append a space to a trailing empty line so the <pre> renders it at the
  // same height the <textarea> does (keeps the last line + gutter aligned).
  const preHtml = value.endsWith('\n') ? `${html} ` : html

  const lineCount = useMemo(() => value.split('\n').length || 1, [value])
  const gutter = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1).join('\n'),
    [lineCount],
  )

  const syncScroll = () => {
    const el = scrollRef.current
    if (!el) return
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-el.scrollTop}px)`
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = `${value.slice(0, start)}  ${value.slice(end)}`
      onChange(next)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="ce">
      <div className="ce-gutter" aria-hidden="true">
        <pre className="ce-gutter-inner" ref={gutterRef}>{gutter}</pre>
      </div>
      <div className="ce-scroll" ref={scrollRef} onScroll={syncScroll}>
        <div className="ce-inner">
          <pre className="ce-pre" aria-hidden="true" dangerouslySetInnerHTML={{ __html: preHtml }} />
          <textarea
            className="ce-ta"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={ariaLabel}
          />
        </div>
      </div>
    </div>
  )
}

export default CodeEditor
