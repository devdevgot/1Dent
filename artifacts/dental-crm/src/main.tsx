import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/hooks/use-theme";
import App from "./App";
import "./index.css";
import "./lib/i18n";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
