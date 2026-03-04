import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "@renderer/App";

import "@renderer/styles/index.css";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
    <HashRouter>
        <App />
    </HashRouter>
);
