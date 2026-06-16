import { Link } from '@tanstack/react-router'

// Canonical source: PRIVACY.md. Keep this page in sync with that file when the policy changes.

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 id={id} className="text-lg font-semibold text-zinc-100 mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">{children}</div>
    </section>
  )
}

const linkClass = 'text-zinc-300 underline underline-offset-2 hover:text-zinc-100 transition-colors'

export function PrivacyRoute() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-bold tracking-widest">HITLOBSTER</span>
          <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
            ← Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-zinc-100">Privacy Policy for HITLOBSTER</h1>
        <p className="mt-2 text-sm text-zinc-500"><strong className="text-zinc-400">Last updated: June 16, 2026</strong></p>

        <p className="mt-6 text-sm text-zinc-400 leading-relaxed">
          This Privacy Policy describes how HITLOBSTER (&ldquo;HITLOBSTER&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;,
          or &ldquo;our&rdquo;) collects, uses, stores, and protects your information when you use our application
          (the &ldquo;Service&rdquo;). By using the Service, you agree to the practices described in this policy.
        </p>
        <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
          If you have any questions, contact us at <strong className="text-zinc-200">admin@hitlobster.ai</strong>.
        </p>

        <Section id="who-we-are" title="1. Who We Are">
          <p>
            HITLOBSTER is a personal job-application tracking dashboard. It helps you organize your job search by
            collecting application-related information in one place, including — with your explicit permission —
            relevant email correspondence from your Gmail account.
          </p>
          <p>
            The Service is operated by HITLOBSTER and hosted at <strong className="text-zinc-200">https://hitlobster.ai/</strong>.
          </p>
        </Section>

        <Section id="information-we-collect" title="2. Information We Collect">
          <h3 className="text-sm font-semibold text-zinc-200">a. Account Information</h3>
          <p>
            When you create an account, we collect your email address and a securely hashed password. We use this to
            authenticate you and to send account-related messages (such as activation and password-reset links).
          </p>
          <h3 className="text-sm font-semibold text-zinc-200 pt-1">b. Google Account Data</h3>
          <p>
            With your explicit consent, HITLOBSTER connects to your Google account using Google OAuth 2.0 and requests
            the following scope:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong className="text-zinc-200">https://www.googleapis.com/auth/gmail.metadata</strong> — read-only
              access to the metadata of your Gmail messages and labels. This scope does <strong className="text-zinc-200">not</strong> grant
              access to the body or contents of any message.
            </li>
          </ul>
          <p>We use this <strong className="text-zinc-200">read-only</strong> access to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Display the Gmail labels in your account so you can choose which ones map to your job applications;</li>
            <li>
              Read <strong className="text-zinc-200">only the metadata</strong> of messages within the labels you select
              — namely the <strong className="text-zinc-200">sender (&ldquo;From&rdquo;) address, subject line, and
              received date/time</strong> — in order to surface job-application correspondence (such as recruiter emails,
              interview invitations, and application confirmations) inside your HITLOBSTER dashboard.
            </li>
          </ul>
          <p>
            HITLOBSTER <strong className="text-zinc-200">does not access, read, or store the body or contents of your
            email messages</strong>, attachments, or any data beyond the From, Subject, and Date metadata described
            above. HITLOBSTER also <strong className="text-zinc-200">cannot</strong> send, delete, modify, or compose
            email. The access we request is strictly read-only.
          </p>
          <h3 className="text-sm font-semibold text-zinc-200 pt-1">c. Information You Provide</h3>
          <p>
            Any job-application details, notes, company information, or other content you manually enter into the
            dashboard.
          </p>
        </Section>

        <Section id="how-we-use" title="3. How We Use Your Information">
          <p>We use the information we collect solely to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide, operate, and maintain the Service;</li>
            <li>Display the metadata (sender, subject, and date) of your job-application correspondence within your personal dashboard;</li>
            <li>Authenticate you and secure your account;</li>
            <li>Communicate with you about your account.</li>
          </ul>
          <p>
            We do <strong className="text-zinc-200">not</strong> use your Google user data for advertising, and we do
            <strong className="text-zinc-200"> not</strong> sell your data.
          </p>
        </Section>

        <Section id="limited-use" title="4. Limited Use Disclosure (Google API Services User Data Policy)">
          <p>
            HITLOBSTER&rsquo;s use and transfer of information received from Google APIs adheres to the{' '}
            <a className={linkClass} href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>, including the <strong className="text-zinc-200">Limited Use</strong> requirements.
          </p>
          <p>Specifically:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>We only use access to Google user data to provide and improve user-facing features that are prominent in HITLOBSTER&rsquo;s interface.</li>
            <li>We do <strong className="text-zinc-200">not</strong> transfer or sell Google user data to third parties, except as necessary to provide or improve the Service, to comply with applicable law, or as part of a merger, acquisition, or sale of assets with notice to users.</li>
            <li>We do <strong className="text-zinc-200">not</strong> use Google user data for serving advertisements.</li>
            <li>We do <strong className="text-zinc-200">not</strong> allow humans to read your Google user data unless: (a) we have your affirmative consent for specific messages; (b) it is necessary for security purposes (such as investigating abuse); (c) it is required to comply with applicable law; or (d) the data has been aggregated and anonymized and is used for internal operations.</li>
          </ul>
        </Section>

        <Section id="storage" title="5. How We Store and Protect Your Data">
          <ul className="list-disc pl-6 space-y-1">
            <li>Your data is stored in a private database on infrastructure we control and is not shared with other users.</li>
            <li>Connections to the Service are encrypted in transit using TLS (HTTPS).</li>
            <li>OAuth access and refresh tokens are stored securely and are used only to make authorized requests to the Google APIs on your behalf.</li>
            <li>We restrict access to your data to the minimum necessary to operate the Service.</li>
          </ul>
          <p>
            No method of transmission or storage is 100% secure, but we take reasonable measures to protect your
            information.
          </p>
        </Section>

        <Section id="data-sharing" title="6. Data Sharing">
          <p>
            We do <strong className="text-zinc-200">not</strong> sell, rent, or trade your personal information or
            Google user data. We may share information only:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>With service providers strictly necessary to host and operate the Service, bound by confidentiality obligations;</li>
            <li>When required by law or valid legal process;</li>
            <li>To protect the rights, property, or safety of HITLOBSTER, our users, or the public.</li>
          </ul>
        </Section>

        <Section id="retention" title="7. Data Retention and Deletion">
          <ul className="list-disc pl-6 space-y-1">
            <li>We retain your data for as long as your account is active.</li>
            <li>
              You may disconnect Google access at any time from within HITLOBSTER, or by revoking access directly at{' '}
              <a className={linkClass} href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                https://myaccount.google.com/permissions
              </a>. Revoking access stops all further data collection from your Google account.
            </li>
            <li>
              You may request deletion of your account and all associated data — including any data obtained from Google
              — by emailing <strong className="text-zinc-200">admin@hitlobster.ai</strong>. We will delete your data
              within 30 days of a verified request.
            </li>
          </ul>
        </Section>

        <Section id="childrens-privacy" title="8. Children’s Privacy">
          <p>
            The Service is not directed to children under 13 (or the minimum age required in your jurisdiction), and we
            do not knowingly collect data from them.
          </p>
        </Section>

        <Section id="changes" title="9. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will post the revised version at this URL and update
            the &ldquo;Last updated&rdquo; date above. Material changes will be communicated where appropriate.
          </p>
        </Section>

        <Section id="contact" title="10. Contact Us">
          <p>If you have questions or requests regarding this Privacy Policy or your data, contact:</p>
          <p>
            <strong className="text-zinc-200">HITLOBSTER</strong><br />
            Email: <strong className="text-zinc-200">admin@hitlobster.ai</strong>
          </p>
        </Section>

        <div className="mt-12 pt-6 border-t border-zinc-800">
          <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Back to HITLOBSTER
          </Link>
        </div>
      </main>
    </div>
  )
}
