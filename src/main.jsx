import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./ui/board.css";
import "./ui/app.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
