import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

window.addEventListener("error", (e) => {
  console.error("[GLOBAL ERROR]", e.message, "\nSource:", e.filename, "Line:", e.lineno, "Col:", e.colno, "\nError:", e.error);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("[UNHANDLED REJECTION]", e.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
