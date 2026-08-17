// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyPluginTheme, pluginSnapshot, setPluginSnapshot, subscribePlugins } from "../src/lib/plugins";
import type { PluginStatus } from "../src/types/plugins";

const status: PluginStatus = {
  runtime: "declarative-v1", sdkVersion: 1, directory: "plugins", securitySummary: "safe",
  plugins: [{
    enabled: true, packageSha256: "a".repeat(64),
    package: {
      manifest: { schemaVersion:1,id:"org.test.theme",name:"Theme",version:"1.0.0",author:"Test",description:"",minimumOpenFrameVersion:"0.8.0",runtime:"declarative-v1",permissions:[],capabilities:["themes"],license:"MIT" },
      contributions: { effects:[],transitions:[],templates:[],aiModels:[],exporters:[],themes:[{id:"ocean",name:"Ocean",tokens:{accent:"#67e8c8",background:"#071116"}}] }
    }
  }]
};
afterEach(()=>{applyPluginTheme();localStorage.clear()});
describe("plugin registry",()=>{
  it("publishes typed plugin snapshots to editor consumers",()=>{
    let updates=0;const unsubscribe=subscribePlugins(()=>updates++);
    setPluginSnapshot(status);unsubscribe();
    expect(pluginSnapshot().plugins[0].package.manifest.id).toBe("org.test.theme");
    expect(updates).toBe(1);
  });
  it("applies only typed theme tokens and restores defaults",()=>{
    const theme=status.plugins[0].package.contributions.themes[0];
    applyPluginTheme(theme,"org.test.theme:ocean");
    expect(document.documentElement.style.getPropertyValue("--lime")).toBe("#67e8c8");
    expect(localStorage.getItem("openframe.theme")).toBe("org.test.theme:ocean");
    applyPluginTheme();
    expect(document.documentElement.style.getPropertyValue("--lime")).toBe("");
  });
});
