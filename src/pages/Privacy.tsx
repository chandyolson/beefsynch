import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Privacy = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-[680px] px-6 py-12">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors mb-8">
        <ArrowLeft className="h-4 w-4" /> Back to BeefSynch
      </Link>

      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground italic mb-8">Last updated: April 2, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <p><p>BeefSynch is operated by Chuteside, LLC ("we", "us", "our"). This privacy policy explains how we collect, use, and protect your information when you use BeefSynch ("the Service").</p> ("we", "us", "our"). This privacy policy explains how we collect, use, and protect your information when you use BeefSynch ("the Service").</p>

        <h2 className="text-lg font-semibold text-foreground">Information we collect</h2>
        <p>When you create an account, we collect your email address and name. When you use the Service, we store the breeding project data, bull selections, semen order information, and other content you enter. We also collect basic usage data such as login timestamps and device type to maintain and improve the Service.</p>

        <h2 className="text-lg font-semibold text-foreground">How we use your information</h2>
        <p>We use your information to provide and maintain the Service, authenticate your identity, send transactional emails (such as team invitations and data exports), and improve the Service. We do not sell your personal information to third parties.</p>

        <h2 className="text-lg font-semibold text-foreground">Google Calendar integration</h2>
        <p>If you connect your Google Calendar, we request permission to create, update, and delete calendar events on your behalf. We only access your calendar to sync BeefSynch breeding schedule events. We do not read, store, or share any existing calendar data. You can disconnect Google Calendar access at any time through your Google Account settings at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://myaccount.google.com/permissions</a>.</p>

        <h2 className="text-lg font-semibold text-foreground">Data storage and security</h2>
        <p>Your data is stored securely with encryption in transit and at rest. Access to your data is restricted by row-level security policies that ensure you can only access data belonging to your organization.</p>

        <h2 className="text-lg font-semibold text-foreground">Data retention and deletion</h2>
        <p>You can delete your projects and data at any time within the Service. If you wish to delete your account entirely, contact us at <a href="mailto:office@catlresources.com" className="text-primary hover:underline">office@catlresources.com</a> and we will remove your data within 30 days.</p>

        <h2 className="text-lg font-semibold text-foreground">Contact</h2>
        <p>For questions about this privacy policy, contact us at <a href="mailto:office@catlresources.com" className="text-primary hover:underline">office@catlresources.com</a>.</p>

        <p className="pt-4 text-muted-foreground">
          Chuteside Resources, LLC<br />
          Sioux Falls, SD
        </p>
      </div>
    </div>
  </div>
);

export default Privacy;
