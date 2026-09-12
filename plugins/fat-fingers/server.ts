// bb-plugin-fat-fingers — backend entry.
//
// Everything this plugin does happens in the browser (see app.ts and app.css).
// A server entry is still required by the manifest, so this one only says
// hello in the plugin log.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function plugin(bb: BbPluginApi) {
  bb.log.info("Fat Fingers loaded; icon scaling is applied in the app");
}
