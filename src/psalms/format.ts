type PsalmChapter = {
  chapter: number;
  lines: string[];
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function splitPoeticLine(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  const parts: string[] = [];
  let current = '';

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    current += char;

    if (char === ',' || char === ';') {
      const quoteChars = '"“”' + "'‘’";
      const next = normalized[i + 1];
      const nextAfterQuote = normalized[i + 2];
      const isTextStart = (candidate?: string) => Boolean(candidate && /[A-Za-z\u0590-\u05FF]/.test(candidate));
      const hasFollowingText = isTextStart(next) || (next && quoteChars.includes(next) && isTextStart(nextAfterQuote));

      if (hasFollowingText) {
        parts.push(current);
        current = '\u00A0\u00A0\u00A0\u00A0';
      }
    }
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts.length > 0 ? parts : [normalized];
}
export function formatPsalmChapter(chapter: PsalmChapter): string {
  const renderedLines = chapter.lines
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => splitPoeticLine(line));

  return renderedLines.join('\n');
}
