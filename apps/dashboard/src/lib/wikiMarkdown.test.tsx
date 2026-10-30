import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseInline, parseWikiMarkdown } from './wikiMarkdown';

/** Minimal renderer mirroring WikiView so the escaping behaviour is covered. */
function Article({ source }: { source: string }) {
  return (
    <div>
      {parseWikiMarkdown(source).map((block, index) => {
        if (block.type === 'heading') return <h3 key={index}>{block.text}</h3>;
        if (block.type === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  {item.map((token, tokenIndex) => (
                    <span key={tokenIndex}>{token.value}</span>
                  ))}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            {block.tokens.map((token, tokenIndex) => (
              <span key={tokenIndex}>{token.value}</span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

describe('parseInline', () => {
  it('tokenises bold, italic and code spans', () => {
    expect(parseInline('A **bold** and *italic* with `code`.')).toEqual([
      { type: 'text', value: 'A ' },
      { type: 'strong', value: 'bold' },
      { type: 'text', value: ' and ' },
      { type: 'em', value: 'italic' },
      { type: 'text', value: ' with ' },
      { type: 'code', value: 'code' },
      { type: 'text', value: '.' },
    ]);
  });

  it('leaves HTML-looking text as plain text', () => {
    const tokens = parseInline('<img src=x onerror="alert(1)">');
    expect(tokens).toEqual([{ type: 'text', value: '<img src=x onerror="alert(1)">' }]);
  });
});

describe('parseWikiMarkdown', () => {
  it('classifies headings, lists and paragraphs', () => {
    const blocks = parseWikiMarkdown('**Overview**\n\nSome text\n\n- one\n- two');
    expect(blocks[0]).toEqual({ type: 'heading', text: 'Overview' });
    expect(blocks[1]?.type).toBe('paragraph');
    expect(blocks[2]).toEqual({
      type: 'list',
      items: [[{ type: 'text', value: 'one' }], [{ type: 'text', value: 'two' }]],
    });
  });

  it('never emits executable markup for hostile input', () => {
    const { container } = render(
      <Article source={'<script>alert("xss")</script>\n\n<img src=x onerror="alert(1)">'} />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<script>alert\("xss"\)<\/script>/)).toBeInTheDocument();
  });
});
