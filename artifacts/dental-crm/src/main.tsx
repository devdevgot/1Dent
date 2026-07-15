import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/hooks/use-theme";
import App from "./App";
import "./index.css";
import "./lib/i18n";
import { installChunkReloadHandlers } from "@/lib/chunk-reload";
import { initPwa, registerServiceWorker } from "@/lib/pwa";

installChunkReloadHandlers();
initPwa();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
