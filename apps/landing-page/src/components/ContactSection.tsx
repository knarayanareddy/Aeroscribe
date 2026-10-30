import { useId, useState } from 'react';
import { site } from '../config/site';
import { submitContact, type ContactOutcome, type ContactPayload } from '../lib/contact';

type Status = 'idle' | 'sending' | 'done' | 'error';

const emptyForm: ContactPayload = { name: '', email: '', org: '', message: '' };

const entryPoints = [
  {
    icon: '🚀',
    title: 'Early access',
    description:
      'Ask for access to the prototype, or tell us which research question you would run first.',
  },
  {
    icon: '🤝',
    title: 'Collaboration',
    description:
      'Interested in the pipeline specification or co-development? Open an issue to talk.',
  },
  {
    icon: '🎓',
    title: 'Academic use',
    description:
      'The code is MIT licensed — fork it, run it, and tell us what breaks in your domain.',
  },
];

export default function ContactSection() {
  const [form, setForm] = useState<ContactPayload>(emptyForm);
  const [status, setStatus] = useState<Status>('idle');
  const [outcome, setOutcome] = useState<ContactOutcome | null>(null);
  const formId = useId();

  const hasEndpoint = Boolean(site.contactEndpoint);

  const update = (key: keyof ContactPayload) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('sending');
    setOutcome(null);

    const result = await submitContact(form, {
      endpoint: site.contactEndpoint,
      issueBaseUrl: site.issuesUrl,
    });

    setOutcome(result);

    if (result.kind === 'issue') {
      window.open(result.url, '_blank', 'noopener,noreferrer');
      setStatus('done');
      return;
    }

    setStatus(result.kind === 'sent' ? 'done' : 'error');
  };

  const reset = () => {
    setForm(emptyForm);
    setOutcome(null);
    setStatus('idle');
  };

  const fields: Array<{
    key: keyof ContactPayload;
    label: string;
    type: string;
    placeholder: string;
  }> = [
    { key: 'name', label: 'Full name', type: 'text', placeholder: 'Ada Lovelace' },
    { key: 'email', label: 'Email address', type: 'email', placeholder: 'ada@aerospace.org' },
    {
      key: 'org',
      label: 'Organization',
      type: 'text',
      placeholder: 'University, agency or company',
    },
  ];

  return (
    <section id="contact" className="relative overflow-hidden py-28">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(59,130,246,0.08),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div>
            <p className="mb-4 font-grotesk text-sm font-semibold uppercase tracking-widest text-blue-400">
              Get involved
            </p>
            <h2 className="mb-6 bg-gradient-to-r from-white to-blue-200 bg-clip-text font-display text-4xl font-bold leading-tight text-transparent md:text-5xl">
              Ready to put the pipeline to work?
            </h2>
            <p className="mb-8 font-grotesk text-lg leading-relaxed text-gray-400">
              AeroScribe is an open prototype. The fastest way in is to run it locally or open an
              issue on GitHub — both are public.
            </p>

            <ul className="space-y-4">
              {entryPoints.map((item) => (
                <li
                  key={item.title}
                  className="flex items-start gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4"
                >
                  <span className="shrink-0 text-2xl" aria-hidden="true">
                    {item.icon}
                  </span>
                  <div>
                    <p className="mb-1 font-grotesk text-sm font-semibold text-white">
                      {item.title}
                    </p>
                    <p className="font-grotesk text-sm text-gray-400">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={site.repoUrl}
                className="rounded-full border border-blue-500/30 px-4 py-2 font-grotesk text-sm font-medium text-blue-300 transition-colors hover:border-blue-400 hover:text-white"
              >
                GitHub repository
              </a>
              <a
                href={site.specsUrl}
                className="rounded-full border border-blue-500/30 px-4 py-2 font-grotesk text-sm font-medium text-blue-300 transition-colors hover:border-blue-400 hover:text-white"
              >
                Read the specs
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-blue-500/20 bg-blue-500/5 p-8 backdrop-blur-sm">
            {status === 'done' ? (
              <div className="py-8 text-center">
                <div
                  className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500"
                  aria-hidden="true"
                >
                  <svg
                    className="h-8 w-8 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3 className="mb-3 font-display text-2xl font-bold text-white">
                  {outcome?.kind === 'sent' ? 'Message sent' : 'Issue drafted'}
                </h3>
                <p className="mb-6 font-grotesk text-gray-400">
                  {outcome?.kind === 'sent'
                    ? 'Thanks — your request reached the maintainers.'
                    : 'A prefilled GitHub issue opened in a new tab. Submit it there to reach the maintainers; nothing was sent automatically.'}
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-full border border-white/20 px-5 py-2.5 font-grotesk text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="space-y-5"
                aria-describedby={`${formId}-hint`}
              >
                <h3 className="mb-2 font-display text-xl font-bold text-white">Request access</h3>

                <p
                  id={`${formId}-hint`}
                  className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 font-grotesk text-xs text-amber-200"
                >
                  {hasEndpoint
                    ? 'This form posts to the configured contact endpoint.'
                    : 'No backend is connected: submitting opens a prefilled GitHub issue so your message still reaches the maintainers.'}
                </p>

                {fields.map((field) => (
                  <div key={field.key}>
                    <label
                      htmlFor={`${formId}-${field.key}`}
                      className="mb-1.5 block font-grotesk text-sm font-medium text-gray-300"
                    >
                      {field.label}
                    </label>
                    <input
                      id={`${formId}-${field.key}`}
                      name={field.key}
                      type={field.type}
                      required={field.key !== 'org'}
                      value={form[field.key]}
                      onChange={(event) => update(field.key)(event.target.value)}
                      placeholder={field.placeholder}
                      autoComplete={
                        field.key === 'name'
                          ? 'name'
                          : field.key === 'email'
                            ? 'email'
                            : 'organization'
                      }
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-grotesk text-sm text-white placeholder-gray-500 transition-all focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                ))}

                <div>
                  <label
                    htmlFor={`${formId}-message`}
                    className="mb-1.5 block font-grotesk text-sm font-medium text-gray-300"
                  >
                    Message
                  </label>
                  <textarea
                    id={`${formId}-message`}
                    name="message"
                    rows={4}
                    required
                    minLength={10}
                    value={form.message}
                    onChange={(event) => update('message')(event.target.value)}
                    placeholder="Tell us about your research goals…"
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-grotesk text-sm text-white placeholder-gray-500 transition-all focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                {status === 'error' && outcome?.kind === 'error' && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 font-grotesk text-sm text-red-200"
                  >
                    {outcome.message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="w-full rounded-full bg-gradient-to-r from-blue-600 to-violet-600 py-4 font-grotesk text-base font-semibold text-white shadow-xl shadow-blue-900/40 transition-all hover:from-blue-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'sending'
                    ? 'Sending…'
                    : hasEndpoint
                      ? 'Submit request'
                      : 'Continue to GitHub issue'}
                </button>

                <p className="text-center font-grotesk text-xs text-gray-500">
                  We only use your details to answer this request.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
