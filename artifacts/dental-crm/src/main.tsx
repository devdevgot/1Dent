import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/hooks/use-theme";
import App from "./App";
import "./index.css";
import "./lib/i18n";

// Screenshot mode: open URL with ?screenshot to flatten the layout for full-page capture
if (new URLSearchParams(window.location.search).has("screenshot")) {
  document.documentElement.classList.add("screenshot-mode");
  document.body.classList.add("screenshot-mode");
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
