import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Terms = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-[680px] px-6 py-12">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors mb-8">
        <ArrowLeft className="h-4 w-4" /> Back to BeefSynch
      </Link>

      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-muted-foreground italic mb-8">Last updated: April 2, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <p>By using BeefSynch ("the Service"), operated by Chuteside Resources, LLC ("we", "us", "our"), you agree to these terms.</p>

        <h2 className="text-lg font-semibold text-foreground">Use of the Service</h2>
        <p>BeefSynch is a breeding synchronization and semen management tool for beef cattle operations. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. You agree to use the Service only for lawful purposes related to cattle breeding management.</p>

        <h2 className="text-lg font-semibold text-foreground">Your data</h2>
        <p>You retain ownership of all data you enter into the Service. We do not claim any intellectual property rights over your breeding projects, bull selections, customer information, or other content. You grant us a limited license to store and process your data solely to provide the Service to you.</p>

        <h2 className="text-lg font-semibold text-foreground">Disclaimer</h2>
        <p>The Service is provided "as is" without warranties of any kind. BeefSynch is a management tool — breeding decisions, sire selections, and veterinary matters remain your responsibility. We are not liable for outcomes related to breeding decisions made using information from the Service. EPD data and bull information may not reflect the most current breed association evaluations.</p>

        <h2 className="text-lg font-semibold text-foreground">Limitation of liability</h2>
        <p>To the maximum extent permitted by law, Chuteside Resources, LLC shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>

        <h2 className="text-lg font-semibold text-foreground">Changes to these terms</h2>
        <p>We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>

        <h2 className="text-lg font-semibold text-foreground">Contact</h2>
        <p>For questions about these terms, contact us at <a href="mailto:office@catlresources.com" className="text-primary hover:underline">office@catlresources.com</a>.</p>

        <p className="pt-4 text-muted-foreground">
          Chuteside Resources, LLC<br />
          Sioux Falls, SD
        </p>
      </div>
    </div>
  </div>
);

export default Terms;
