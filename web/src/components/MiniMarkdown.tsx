import React from 'react';
import styles from './MiniMarkdown.module.css';

// Shared inline markdown renderer — no dangerouslySetInnerHTML, no external deps.
// Handles: ### headings, **bold**, *italic*, - / * bullet lists, 1. numbered lists,
//          markdown TABLES, blank lines.

function InlineMarkdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={i++}>{text.slice(last, match.index)}</span>);
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={i++} className={styles.bold}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={i++} className={styles.italic}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(<span key={i++}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

/** Parse a `| cell | cell |` markdown row into trimmed cell strings. */
function parseTableRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1) // drop leading/trailing empty from outer pipes
    .map((c) => c.trim());
}

/** True if every cell in a row is only dashes/colons (separator row). */
function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

export function MiniMarkdown({ text, className }: { text: string; className?: string }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let keyIdx = 0;
  let i = 0;

  function flushList() {
    if (!listItems.length) return;
    if (listType === 'ul') {
      elements.push(
        <ul key={`ul-${keyIdx++}`} className={styles.ul}>
          {listItems.map((item, j) => (
            <li key={j} className={styles.li}><InlineMarkdown text={item} /></li>
          ))}
        </ul>
      );
    } else {
      elements.push(
        <ol key={`ol-${keyIdx++}`} className={styles.ol}>
          {listItems.map((item, j) => (
            <li key={j} className={styles.li}><InlineMarkdown text={item} /></li>
          ))}
        </ol>
      );
    }
    listItems = [];
    listType = null;
  }

  while (i < lines.length) {
    const line = lines[i];

    // ── Table detection: look ahead for a pipe-started block ──────────────────
    if (line.trimStart().startsWith('|')) {
      flushList();

      // Collect consecutive pipe lines
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }

      // Parse: first non-separator = header, then separator, then body
      let headerCells: string[] = [];
      const bodyRows: string[][] = [];
      let seenSeparator = false;
      let seenHeader = false;

      for (const tl of tableLines) {
        const cells = parseTableRow(tl);
        if (!seenHeader) {
          if (!isSeparatorRow(cells)) {
            headerCells = cells;
            seenHeader = true;
          }
          // If first line IS a separator (malformed table), just skip it
          continue;
        }
        if (!seenSeparator && isSeparatorRow(cells)) {
          seenSeparator = true;
          continue;
        }
        if (cells.length > 0) {
          bodyRows.push(cells);
        }
      }

      if (headerCells.length > 0 || bodyRows.length > 0) {
        elements.push(
          <div key={`tw-${keyIdx++}`} className={styles.tableWrap}>
            <table className={styles.table}>
              {headerCells.length > 0 && (
                <thead>
                  <tr>
                    {headerCells.map((cell, ci) => (
                      <th key={ci} className={styles.th}>
                        <InlineMarkdown text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              {bodyRows.length > 0 && (
                <tbody>
                  {bodyRows.map((row, ri) => (
                    <tr key={ri} className={styles.tr}>
                      {row.map((cell, ci) => (
                        <td key={ci} className={styles.td}>
                          <InlineMarkdown text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        );
      }
      continue; // i already advanced
    }

    // ── Heading ───────────────────────────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const cls = level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
      elements.push(<p key={keyIdx++} className={cls}><InlineMarkdown text={headingMatch[2]} /></p>);
      i++; continue;
    }

    // ── Bullet list ───────────────────────────────────────────────────────────
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      listItems.push(bulletMatch[1]);
      i++; continue;
    }

    // ── Numbered list ─────────────────────────────────────────────────────────
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);
    if (numberedMatch) {
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      listItems.push(numberedMatch[1]);
      i++; continue;
    }

    flushList();

    // ── Blank line ────────────────────────────────────────────────────────────
    if (line.trim() === '') {
      elements.push(<span key={keyIdx++} className={styles.spacer} />);
      i++; continue;
    }

    // ── Normal paragraph ──────────────────────────────────────────────────────
    elements.push(<p key={keyIdx++} className={styles.p}><InlineMarkdown text={line} /></p>);
    i++;
  }

  flushList();

  return <span className={className}>{elements}</span>;
}
