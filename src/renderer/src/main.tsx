import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SecurityStatus } from "@shared/ipc.js";
import App from "./App.js";
import { ActionBarProvider } from "./app/ActionBarContext.js";
import { CompanyProvider } from "./app/CompanyContext.js";
import { ThemeProvider } from "./app/ThemeContext.js";
import { SetupScreen } from "./features/security/SetupScreen.js";
import "./index.css";

/**
 * The data only opens once the encryption key is known: until then, only the
 * setup screen is shown (no data call at all, since their handlers are not yet
 * registered on the main side).
 */
function Root() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);

  useEffect(() => {
    void window.api.invoke("security:status", undefined as never).then(setStatus);
  }, []);

  if (!status) return null;
  if (status.state !== "ready") return <SetupScreen status={status} />;
  return (
    <CompanyProvider>
      <ActionBarProvider>
        <App />
      </ActionBarProvider>
    </CompanyProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </StrictMode>,
);
