import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const preventPinchZoom = (event: TouchEvent) => {
  if (event.touches.length > 1) event.preventDefault();
};

document.addEventListener("touchstart", preventPinchZoom, { passive: false });
document.addEventListener("touchmove", preventPinchZoom, { passive: false });
document.addEventListener("wheel", (event) => {
  if (event.ctrlKey) event.preventDefault();
}, { passive: false });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
