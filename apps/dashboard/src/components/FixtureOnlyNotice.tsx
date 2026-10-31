/**
 * Shown by views the live API does not feed yet.
 *
 * The alternative — rendering the fixture dataset under a "Live API" badge — is
 * the single most damaging thing this dashboard could do, because the numbers
 * would look current. So an unmigrated view refuses to render at all in live
 * mode and says exactly what is missing.
 */
export default function FixtureOnlyNotice({ view }: { view: string }) {
  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-slate-900">{view}</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm font-semibold text-slate-800">
          This view is not connected to the API yet.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          The {view} screen is still built from the illustrative fixture dataset, and this dashboard
          is running in live mode. Rather than show fixture data under a live badge, it shows
          nothing here. The stage's output is available from{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
            GET /api/v1/runs/:id/evidence
          </code>{' '}
          in the meantime.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Unset <code className="rounded bg-slate-100 px-1 py-0.5">VITE_API_URL</code> to browse the
          fixture build.
        </p>
      </div>
    </div>
  );
}
