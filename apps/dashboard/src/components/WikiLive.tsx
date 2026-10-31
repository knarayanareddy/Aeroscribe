import { latestPayload, toLiveWiki, wikiFromPackage } from '../api/mappers';
import { useActiveRun, useEvidence } from '../state/pipelineContext';
import Markdown from './Markdown';

/**
 * The AeroWiki article the run produced.
 *
 * One article per run, generated at stage 8 from the manuscript and the review.
 * It is read-only here: editing it in the browser would create a version the
 * registry never saw, which is the opposite of what the article is for. If the
 * article needs changing, the run does.
 */
export default function WikiLive() {
  const activeRun = useActiveRun();
  const records = useEvidence();
  const pkg = latestPayload(
    records,
    'submission-package',
    (value): value is object => typeof value === 'object' && value !== null,
  );
  const payload = wikiFromPackage(pkg);

  if (!activeRun) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">AeroWiki</h1>
        <p className="mt-2 text-sm text-slate-500">Select a run to see the article it produced.</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">AeroWiki</h1>
        <p
          data-testid="wiki-empty"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600"
        >
          This run has no wiki article. Stage 8 writes one after the compliance stage is approved —
          and a blocked submission still produces the article, with the blockers recorded next to
          it.
        </p>
      </div>
    );
  }

  const article = toLiveWiki(payload);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{article.title}</h1>
        <p className="mt-1 text-slate-500">
          Generated from run <code className="font-mono text-xs">{activeRun.id}</code> · slug{' '}
          <code className="font-mono text-xs">{article.slug}</code>
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs text-slate-600">
          Read-only. The article is part of the run&apos;s evidence record, so editing it here would
          produce text the registry never hashed. To change it, change the run.
        </p>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-6">
        <Markdown source={article.markdown} />
      </article>
    </div>
  );
}
