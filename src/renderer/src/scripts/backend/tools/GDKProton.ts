import { ArchiveToolArtifact } from "./ToolArtifact";

/**
 * [GDK Proton](https://github.com/raonygamer/gdk-proton) - a Proton build tailored for running
 * GDK games on Linux.
 *
 * Supported platforms: **Linux** only.
 */
export class GDKProton extends ArchiveToolArtifact {
  constructor() {
    super({
      name: "gdk-proton",
      repository: "raonygamer/gdk-proton",
      executableName: "proton",
      platforms: ["linux"],
      permissions: 0o755,
      checkDefaults: {
        promptForUpdate: false,
        allowOutdated: true,
        releaseFetchTimeout: 1000,
        checkForUpdates: true,
      },
    });
  }
}
