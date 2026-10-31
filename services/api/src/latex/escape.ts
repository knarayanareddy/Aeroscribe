/**
 * LaTeX escaping and its inverse, in one place.
 *
 * Two rules make this file worth reading:
 *
 * 1. **One pass, never chained replaces.** A sequential pipeline that turns `\`
 *    into `\textbackslash{}` and *then* escapes `{`/`}` corrupts its own output
 *    and prints `\textbackslash\{\}`. Every character is mapped exactly once.
 * 2. **The inverse is for verification, not round-tripping.** `stripLatex` takes
 *    the prose a reader sees out of a `.tex` file so the claim verifier can run
 *    on the rendered text. It deliberately drops layout (`[width=0.8\linewidth]`),
 *    because a width is not a claim.
 */

/** The characters that terminate or corrupt a LaTeX run, mapped once. */
const CHAR_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

/**
 * Unicode that has a LaTeX spelling, mapped to the spelling rather than to a
 * missing glyph. `--`/`---` are plain TeX ligatures; the rest need no package
 * beyond what the template already loads.
 */
const UNICODE_ESCAPES: Readonly<Record<string, string>> = {
  '\u2013': '--', // en dash
  '\u2014': '---', // em dash
  '\u2018': '`', // left single quote
  '\u2019': "'", // right single quote
  '\u201c': '``', // left double quote
  '\u201d': "''", // right double quote
  '\u2026': '\\ldots{}', // ellipsis
  '\u00b1': '$\\pm$', // plus-minus
  '\u00d7': '$\\times$', // multiplication
  '\u00b7': '\\textperiodcentered{}', // middle dot
  '\u00b0': '$^{\\circ}$', // degree
  '\u00b5': '$\\mu$', // micro sign
  '\u03bc': '$\\mu$', // greek mu
  '\u00a0': '~', // non-breaking space
};

/**
 * Make arbitrary text safe to place in a LaTeX document body.
 *
 * A topic such as `\input{/etc/passwd}` becomes literal characters, not a
 * command: that is the security property, and it is why this is a single pass
 * over code points rather than a chain of `replace()` calls.
 */
export function escapeLatex(value: string): string {
  let out = '';
  // `for…of` iterates code points, so an emoji stays one unit instead of being
  // flattened into two lone surrogates.
  for (const character of value) {
    out += CHAR_ESCAPES[character] ?? UNICODE_ESCAPES[character] ?? character;
  }
  return out;
}

/** Collapse whitespace the way LaTeX does, without touching escapes. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** pgfplots/TikZ statements: coordinates, options and file names, not prose. */
const DROP_STATEMENT = /\\(?:addplot|addlegendentry|draw|node|path|fill)\b[^;]*;/g;

/** Commands whose braced argument is a key or a path, never prose. */
const DROP_WITH_ARGUMENT =
  /\\(?:label|ref|eqref|cite|citep|citet|citealp|nocite|includegraphics|input|include|bibliography|bibliographystyle|url|href|pgfplotsset|sisetup|documentclass|usepackage|setlength|vspace|hspace|node)\*?(?:\[[^\]]*\])?\{[^}]*\}/g;

/** Standalone commands that render no text of their own. */
const DROP_BARE =
  /\\(?:maketitle|newpage|clearpage|cleardoublepage|centering|raggedright|noindent|hfill|vfill|small|footnotesize|normalsize|large|Large|itshape|bfseries|ttfamily|sffamily|rmfamily|today|ldots|textbackslash|textasciitilde|textasciicircum|textperiodcentered|newline|linebreak|pagebreak|caption|title|author|date|begin|end)\b\*?/g;

/**
 * The prose of a LaTeX source, for claim verification.
 *
 * Headings, paragraph text and captions survive; commands, keys, refs, cite
 * keys, option lists and URLs do not. Numbers that remain are numbers a reader
 * can see, which is exactly the set the verifier has to police.
 */
export function stripLatex(source: string): string {
  const withoutComments = source
    .split('\n')
    .filter((line) => !/^\s*%/.test(line))
    .join('\n');

  let text = withoutComments;
  // Option lists are layout (`[width=0.8\linewidth]`), never prose. Removing
  // them before anything else keeps their numbers out of the claim check.
  text = text.replace(/\[[^\]]*\]/g, ' ');
  // File names carry digits (`figure-1.dat`) and are not prose a reader reads
  // as a number.
  text = text.replace(/\b[\w./-]+\.(?:dat|tex|bib|pdf|png|jpe?g)\b/g, ' ');
  text = text.replace(DROP_STATEMENT, ' ');
  text = text.replace(DROP_WITH_ARGUMENT, ' ');
  // Environments contribute their name and nothing a reader sees; leaving
  // `{axis}` behind would put the word "axis" into the verified text.
  text = text.replace(/\\(?:begin|end)\{[^}]*\}/g, ' ');
  text = text.replace(DROP_BARE, ' ');
  // Escaped specials become the character a reader sees: `5\%` is five percent.
  text = text.replace(/\\([%&$#_{}])/g, '$1');
  // Whatever command is left is a control word; its argument (if any) already
  // lost its braces below and remains as prose.
  text = text.replace(/\\[a-zA-Z@]+\*?/g, ' ');
  text = text.replace(/\\[^a-zA-Z]/g, ' ');
  text = text.replace(/[{}]/g, ' ');
  return tidy(text);
}
