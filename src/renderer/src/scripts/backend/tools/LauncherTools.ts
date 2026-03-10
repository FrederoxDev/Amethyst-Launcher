import { XVDTool } from "./XVDTool";
import { UMULauncher } from "./UMULauncher";
import { GDKProton } from "./GDKProton";

export const LauncherTools = {
    XVDTool: new XVDTool("xvdtool", "AmethystAPI/xvdtool"),
    UMULauncher: new UMULauncher("umu-launcher", "raonygamer/umu-launcher"),
    GDKProton: new GDKProton("gdk-proton", "raonygamer/gdk-proton")
}