import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PolicyEditor } from "../src/policy-editor/PolicyEditor";

const STORAGE_KEY = "geolibre-admin:policy-draft";
const IMPORT_POLICY = JSON.stringify({ version: 1, branding: { appName: "Imported kiosk" } });
function targetRadio(target: "legacy" | "deployment") {
  return screen.getByRole("radio", {
    name: target === "legacy" ? /Legacy GeoLibre/ : /GeoLibre with runtime deployment\.json/,
  }) as HTMLInputElement;
}

function preview() {
  return screen.getByTestId("export-preview").textContent ?? "";
}


beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("policy editor export target draft", () => {
  it("persists target and policy across remounts and resets the generated file selection on switching", async () => {
    const user = userEvent.setup();
    const first = render(<PolicyEditor />);
    expect(targetRadio("legacy").checked).toBe(true);
    expect(screen.queryByRole("button", { name: /deployment\.json/ })).toBeNull();

    await user.click(screen.getByRole("link", { name: "Server settings" }));
    await user.click(screen.getByRole("checkbox", { name: /Run the processing sidecar/ }));
    await user.click(screen.getByRole("link", { name: "Branding" }));
    const nameInput = screen.getByRole("textbox", { name: "App name" }) as HTMLInputElement;
    await user.type(nameInput, "Runtime kiosk");
    expect(nameInput.value).toBe("Runtime kiosk");
    await user.click(targetRadio("deployment"));
    expect(targetRadio("deployment").checked).toBe(true);
    expect(JSON.parse(preview())).toMatchObject({ version: 1, branding: { appName: "Runtime kiosk" } });
    first.unmount();

    const second = render(<PolicyEditor />);
    expect(targetRadio("deployment").checked).toBe(true);
    expect(JSON.parse(preview())).toMatchObject({ branding: { appName: "Runtime kiosk" } });

    await user.click(screen.getByRole("button", { name: /compose\.yaml/ }));
    expect(preview()).toContain("services:");
    await user.click(targetRadio("legacy"));
    expect(preview()).not.toContain('"version": 1');
    expect(preview()).toContain("GEOLIBRE_");
    expect(screen.queryByRole("button", { name: /deployment\.json/ })).toBeNull();
    second.unmount();

    render(<PolicyEditor />);
    expect(targetRadio("legacy").checked).toBe(true);
    expect(preview()).toContain("GEOLIBRE_");
  });

  it("imports policy without changing target and Start over resets both policy and target", async () => {
    const user = userEvent.setup();
    render(<PolicyEditor />);
    await user.click(targetRadio("deployment"));
    await user.click(screen.getAllByRole("button", { name: "Import…" })[0]);
    await user.click(screen.getByRole("textbox", { name: "Paste a file" }));
    await user.paste(IMPORT_POLICY);
    await user.click(screen.getByRole("button", { name: "Import pasted text" }));
    expect(targetRadio("deployment").checked).toBe(true);
    expect(JSON.parse(preview())).toMatchObject({ branding: { appName: "Imported kiosk" } });

    const reset = screen.getAllByRole("button", { name: "Start over" })[0];
    await user.click(reset);
    await user.click(screen.getByRole("button", { name: "Discard the draft?" }));
    expect(targetRadio("legacy").checked).toBe(true);
    await user.click(screen.getByRole("link", { name: "Branding" }));
    expect((screen.getByRole("textbox", { name: "App name" }) as HTMLInputElement).value).toBe("");
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").target).toBe("legacy"));
  });

  it.each([undefined, "unknown"] as const)("keeps valid older draft data with missing/invalid target %s", (target) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        policy: { version: 1, branding: { appName: "Old draft" } },
        operator: { sidecar: false, conversionRoots: "/data", postgisHosts: "" },
        ...(target === undefined ? {} : { target }),
      }),
    );
    render(<PolicyEditor />);
    expect(targetRadio("legacy").checked).toBe(true);
    expect((screen.getByRole("textbox", { name: "App name" }) as HTMLInputElement).value).toBe("Old draft");
    expect((screen.getByRole("checkbox", { name: /Run the processing sidecar/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("recovers from corrupt or inaccessible storage and keeps tab state when writes fail", async () => {
    localStorage.setItem(STORAGE_KEY, "{");
    const corrupt = render(<PolicyEditor />);
    expect(targetRadio("legacy").checked).toBe(true);
    corrupt.unmount();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const inaccessible = render(<PolicyEditor />);
    expect(targetRadio("legacy").checked).toBe(true);
    inaccessible.unmount();
    vi.restoreAllMocks();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "QuotaExceededError");
    });
    const user = userEvent.setup();
    render(<PolicyEditor />);
    await user.click(targetRadio("deployment"));
    await user.click(screen.getByRole("link", { name: "Branding" }));
    await user.type(screen.getByRole("textbox", { name: "App name" }), "Tab only");
    expect(JSON.parse(preview())).toMatchObject({ branding: { appName: "Tab only" } });
    expect(targetRadio("deployment").checked).toBe(true);
  });
});
