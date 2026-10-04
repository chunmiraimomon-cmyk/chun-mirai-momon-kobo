import { createRoot } from "react-dom/client";
import Home from "./app/page";
import "./app/globals.css";
import "./app/race-hud.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing game root element");

createRoot(container).render(<Home />);
