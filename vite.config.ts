import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/ — cache bust v2
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  define: {
    // Forward VITE_GOOGLE_CLIENT_ID from process env into import.meta.env
    // (secrets are available as process env vars but Vite only auto-inlines .env file vars)
    ...(process.env.VITE_GOOGLE_CLIENT_ID
      ? { "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(process.env.VITE_GOOGLE_CLIENT_ID) }
      : {}),
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
