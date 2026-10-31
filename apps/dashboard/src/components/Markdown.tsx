import type { ReactNode } from 'react';
import { parseWikiMarkdown, type InlineToken } from '../lib/wikiMarkdown';

/**
 * Renders the wiki markdown subset as React elements.
 *
 * Shared by the fixture view and the live view so the two cannot diverge on the
 * one thing that matters here: content is never injected as HTML. The parser
 * returns plain tokens, and React escapes them — markup in an article is inert
 * text, not a script.
 */
function renderInline(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((token, index) => {
    if (token.type === 'strong') return <strong key={index}>{token.value}</strong>;
    if (token.type === 'em') return <em key={index}>{token.value}</em>;
    if (token.type === 'code') {
      return (
        <code
          key={index}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700"
        >
          {token.value}
        </code>
      );
    }
    return <span key={index}>{token.value}</span>;
  });
}

export default function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-2">
      {parseWikiMarkdown(source).map((block, index) => {
        if (block.type === 'heading') {
          return (
            <h3 key={index} className="mt-5 mb-2 text-base font-bold text-slate-900">
              {block.text}
            </h3>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={index} className="my-2 ml-2 list-disc space-y-1 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="text-sm text-slate-700">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="my-2 text-sm leading-relaxed text-slate-700">
            {renderInline(block.tokens)}
          </p>
        );
      })}
    </div>
  );
}
