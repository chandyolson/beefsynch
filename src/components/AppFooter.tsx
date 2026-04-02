import { Link } from "react-router-dom";

const AppFooter = () => (
  <footer className="py-4 text-center text-xs text-muted-foreground">
    BeefSynch by Chuteside Resources{" · "}
    <Link to="/privacy" className="hover:text-foreground transition-colors underline">Privacy Policy</Link>
    {" · "}
    <Link to="/terms" className="hover:text-foreground transition-colors underline">Terms of Service</Link>
  </footer>
);

export default AppFooter;
