import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./lib/i18n";
import { installPageZoomGuards } from "./lib/disablePageZoom";
import App from "./App.tsx";

const removePageZoomGuards = installPageZoomGuards();
if (import.meta.hot) import.meta.hot.dispose(removePageZoomGuards);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
