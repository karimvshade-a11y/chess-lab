import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import "./ui/board.css";
import "./ui/app.css";

/* Unhandled promise rejections do not reach the error boundary, and in a
   desktop window there is no console to notice them in. */
window.addEventListener("unhandledrejection", (e) => {
  console.error("unhandled rejection:", e.reason);
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
