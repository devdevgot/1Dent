import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installChunkReloadHandlers } from "./lib/chunk-reload";

installChunkReloadHandlers();

createRoot(document.getElementById("root")!).render(<App />);
