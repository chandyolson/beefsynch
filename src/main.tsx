import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// After a Lovable redeploy, the running tab still references the old chunk hashes.
// When the user navigates to a lazy-loaded route, Vite fails to fetch the dynamic
// import and emits `vite:preloadError`. Without a handler the failure surfaces as
// "Something went wrong" in our ErrorBoundary; with this listener we just reload
// against the new index.html, which references the fresh chunk paths.
//
// Sessionstorage flag prevents reload loops on real network failures.
window.addEventListener("vite:preloadError", (event) => {
  if (sessionStorage.getItem("vite-preload-reloaded") === "1") {
    // Already tried once this session — let the error surface so the user sees it.
    return;
  }
  sessionStorage.setItem("vite-preload-reloaded", "1");
  event.preventDefault();
  window.location.reload();
});

// Clear the flag once a navigation lands successfully — gives subsequent deploys
// a fresh budget of one auto-reload.
window.addEventListener("load", () => {
  sessionStorage.removeItem("vite-preload-reloaded");
});

createRoot(document.getElementById("root")!).render(<App />);
