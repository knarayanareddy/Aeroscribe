import { useState } from 'react';
import { mockReviewComments, ReviewComment } from '../data/mockData';

export default function ReviewView() {
  const [comments, setComments] = useState<ReviewComment[]>(mockReviewComments);
  const [filter, setFilter] = useState<'all' | 'major' | 'minor' | 'suggestion'>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const filtered = comments.filter(c => {
    const matchSeverity = filter === 'all' || c.severity === filter;
    const matchResolved = showResolved || !c.resolved;
    return matchSeverity && matchResolved;
  });

  const resolve = (id: string) => {
    setComments(prev => prev.map(c =>
      c.id === id ? { ...c, resolved: true, response: responseText || c.response || 'Addressed in revision.' } : c
    ));
    setResponding(null);
    setResponseText('');
  };

  const severityColors: Record<string, { badge: string; bar: string }> = {
    major: { badge: 'bg-red-100 text-red-700 border-red-200', bar: 'bg-red-400' },
    minor: { badge: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-400' },
    suggestion: { badge: 'bg-blue-100 text-blue-700 border-blue-200', bar: 'bg-blue-400' },
  };

  const reviewerColors: Record<string, string> = {
    ReviewerAAgent: 'bg-violet-100 text-violet-700',
    ReviewerBAgent: 'bg-blue-100 text-blue-700',
    ReviewerCAgent: 'bg-cyan-100 text-cyan-700',
    ReviewerDAgent: 'bg-emerald-100 text-emerald-700',
    MetaReviewerAgent: 'bg-red-100 text-red-700',
  };

  const total = comments.length;
  const resolved = comments.filter(c => c.resolved).length;
  const major = comments.filter(c => c.severity === 'major' && !c.resolved).length;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Peer Review Council</h1>
        <p className="text-slate-500 mt-1">Internal AI review panel · 4 specialist reviewers + meta-reviewer</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Comments', value: total, color: 'text-slate-900' },
          { label: 'Major Issues', value: major, color: 'text-red-600' },
          { label: 'Resolved', value: resolved, color: 'text-emerald-600' },
          { label: 'Resolution Rate', value: `${Math.round((resolved / total) * 100)}%`, color: 'text-blue-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-800">Review Resolution Progress</div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            major > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {major > 0 ? `${major} major issues unresolved` : 'All major issues resolved!'}
          </span>
        </div>
        <div className="space-y-2">
          {['major', 'minor', 'suggestion'].map(sev => {
            const total = comments.filter(c => c.severity === sev).length;
            const done = comments.filter(c => c.severity === sev && c.resolved).length;
            const pct = total ? (done / total) * 100 : 0;
            return (
              <div key={sev} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 capitalize w-20">{sev}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${severityColors[sev].bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-12 text-right">{done}/{total}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reviewer overview */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { id: 'ReviewerAAgent', name: 'Methodology Reviewer', focus: 'CFD setup, grid convergence, uncertainty quantification', comments: comments.filter(c => c.reviewerId === 'ReviewerAAgent').length },
          { id: 'ReviewerBAgent', name: 'Literature Reviewer', focus: 'Citation completeness, context, related work gaps', comments: comments.filter(c => c.reviewerId === 'ReviewerBAgent').length },
          { id: 'ReviewerCAgent', name: 'Physics Reviewer', focus: 'Fluid mechanics, combustion physics, result interpretation', comments: comments.filter(c => c.reviewerId === 'ReviewerCAgent').length },
          { id: 'ReviewerDAgent', name: 'Compliance Reviewer', focus: 'AIAA format, word limits, citation style, AI disclosure', comments: comments.filter(c => c.reviewerId === 'ReviewerDAgent').length },
          { id: 'MetaReviewerAgent', name: 'Meta-Reviewer', focus: 'Overall cohesion, cross-section consistency, major gaps', comments: comments.filter(c => c.reviewerId === 'MetaReviewerAgent').length },
        ].map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 text-center">
            <div className={`text-xs font-bold px-2 py-1 rounded-full mb-2 mx-auto w-fit ${reviewerColors[r.id]}`}>{r.id.replace('Agent', '')}</div>
            <div className="text-sm font-semibold text-slate-800">{r.name}</div>
            <div className="text-xs text-slate-400 mt-1 line-clamp-2">{r.focus}</div>
            <div className="text-lg font-bold text-slate-900 mt-2">{r.comments}</div>
            <div className="text-xs text-slate-400">comments</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {['all', 'major', 'minor', 'suggestion'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as typeof filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f} {f !== 'all' && `(${comments.filter(c => c.severity === f).length})`}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={e => setShowResolved(e.target.checked)}
            className="rounded"
          />
          Show resolved
        </label>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} comments shown</span>
      </div>

      {/* Comments */}
      <div className="space-y-3">
        {filtered.map(c => (
          <div key={c.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${c.resolved ? 'opacity-60 border-slate-100' : 'border-slate-100'}`}>
            <div className={`w-full h-1 ${severityColors[c.severity].bar}`} />
            <div className="p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${severityColors[c.severity].badge}`}>
                    {c.severity.toUpperCase()}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${reviewerColors[c.reviewerId] || 'bg-slate-100 text-slate-600'}`}>
                    {c.reviewerName}
                  </span>
                  <span className="text-xs text-slate-400 px-2 py-0.5 bg-slate-50 rounded-full">{c.section}</span>
                </div>
                {c.resolved ? (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Resolved
                  </span>
                ) : (
                  <span className="text-xs text-orange-600 font-medium shrink-0">Open</span>
                )}
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">{c.comment}</p>

              {c.response && (
                <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                  <div className="text-xs font-semibold text-emerald-700 mb-1">✍️ Author Response</div>
                  <p className="text-xs text-emerald-800">{c.response}</p>
                </div>
              )}

              {!c.resolved && (
                <div className="mt-3">
                  {responding === c.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={responseText}
                        onChange={e => setResponseText(e.target.value)}
                        placeholder="Write your response to this comment..."
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => resolve(c.id)}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                        >
                          ✓ Mark Resolved
                        </button>
                        <button
                          onClick={() => { setResponding(null); setResponseText(''); }}
                          className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setResponding(c.id)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + Add response & resolve
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-100">
            <div className="text-4xl mb-3">🎉</div>
            <p>No open comments matching this filter</p>
          </div>
        )}
      </div>
    </div>
  );
}
