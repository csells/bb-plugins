// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  loadPluginApp,
  mountPluginContentScripts,
} from "@get-bb/plugin-sdk/testing/app";

const ACTIVE_ATTRIBUTE = "data-fat-fingers";

afterEach(() => {
  document.documentElement.removeAttribute(ACTIVE_ATTRIBUTE);
});

describe("fat-fingers", () => {
  it("registers one content script that bb accepts", async () => {
    const app = await loadPluginApp(() => import("./app"));
    expect(app.contentScripts.map((script) => script.id)).toEqual([
      "scale-icons",
    ]);
  });

  it("marks the document while mounted and unmarks it on dispose", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const mounted = await mountPluginContentScripts(app, {
      pluginId: "fat-fingers",
    });

    expect(mounted.inspection.mountedIds).toEqual(["scale-icons"]);
    expect(document.documentElement.hasAttribute(ACTIVE_ATTRIBUTE)).toBe(true);

    await mounted.lifecycle.dispose();
    expect(document.documentElement.hasAttribute(ACTIVE_ATTRIBUTE)).toBe(false);
  });

  it("survives a reload: the next generation re-marks the document", async () => {
    const app = await loadPluginApp(() => import("./app"));
    const first = await mountPluginContentScripts(app, {
      pluginId: "fat-fingers",
      generation: 1,
    });
    await first.lifecycle.dispose();

    const second = await mountPluginContentScripts(app, {
      pluginId: "fat-fingers",
      generation: 2,
    });
    expect(document.documentElement.hasAttribute(ACTIVE_ATTRIBUTE)).toBe(true);
    await second.lifecycle.dispose();
    expect(document.documentElement.hasAttribute(ACTIVE_ATTRIBUTE)).toBe(false);
  });
});
