// bb-plugin-open-in-window — backend entry.
//
// Everything this plugin does happens in the browser (see app.ts). The
// manifest still needs a server entry, so this one only logs that it loaded.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function plugin(bb: BbPluginApi) {
  bb.log.info("Open in Window loaded; the thread menu action lives in the app");
}
