/**
 * main.jsx - the JavaScript entry point (loaded by index.html).
 *
 * It mounts the <App /> component into <div id="root"> and wraps it in
 * <BrowserRouter> so components can use URL-based routing (react-router).
 * The global stylesheet is imported here once for the whole app.
 * 
 * This file acts as the bridge between the App.jsx file and the web browser.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
