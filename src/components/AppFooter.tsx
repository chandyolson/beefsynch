import { Link } from "react-router-dom";

const AppFooter = () => (
  <footer className="py-4 flex flex-col items-center gap-0.5 text-xs text-muted-foreground">
    <span>BeefSynch by Chuteside Resources</span>
    <div className="flex gap-1">
      <Link to="/privacy" className="hover:text-foreground transition-colors underline">Privacy Policy</Link>
      <span>·</span>
      <Link to="/terms" className="hover:text-foreground transition-colors underline">Terms of Service</Link>
    </div>
  </footer>
);

export default AppFooter;
