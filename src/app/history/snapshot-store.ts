import {
  BaseDirectory,
  createDir,
  exists,
  readDir,
  readTextFile,
  removeFile,
  writeTextFile,
} from "@tauri-apps/api/fs";

import type { ProjectSnapshot } from "./snapshot-history";

export interface SnapshotStore {
  loadSnapshots(): Promise<ProjectSnapshot[]>;
  saveSnapshot(snapshot: ProjectSnapshot): Promise<void>;
}

const SNAPSHOT_DIRECTORY = "history";
const MAX_STORED_SNAPSHOTS = 25;

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
}

function buildSnapshotFileName(snapshot: ProjectSnapshot): string {
  const safeProjectKey = sanitizeFileName(snapshot.projectIdentity.key || "unknown-project");
  const safeTimestamp = sanitizeFileName(snapshot.capturedAt.replace(/[:.]/g, "-"));

  return `${SNAPSHOT_DIRECTORY}/snapshot-${safeProjectKey}-${safeTimestamp}.json`;
}

export const tauriSnapshotStore: SnapshotStore = {
  async loadSnapshots(): Promise<ProjectSnapshot[]> {
    const hasDirectory = await exists(SNAPSHOT_DIRECTORY, {
      dir: BaseDirectory.AppLocalData,
    });

    if (!hasDirectory) {
      return [];
    }

    const entries = await readDir(SNAPSHOT_DIRECTORY, {
      dir: BaseDirectory.AppLocalData,
      recursive: false,
    });
    const snapshots: ProjectSnapshot[] = [];

    for (const entry of entries) {
      if (!entry.name?.endsWith(".json")) {
        continue;
      }

      const contents = await readTextFile(`${SNAPSHOT_DIRECTORY}/${entry.name}`, {
        dir: BaseDirectory.AppLocalData,
      });

      snapshots.push(JSON.parse(contents) as ProjectSnapshot);
    }

    return snapshots;
  },

  async saveSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    await createDir(SNAPSHOT_DIRECTORY, {
      dir: BaseDirectory.AppLocalData,
      recursive: true,
    });

    await writeTextFile(buildSnapshotFileName(snapshot), JSON.stringify(snapshot), {
      dir: BaseDirectory.AppLocalData,
    });

    const entries = await readDir(SNAPSHOT_DIRECTORY, {
      dir: BaseDirectory.AppLocalData,
      recursive: false,
    });
    const snapshotEntries = entries
      .filter((entry) => entry.name?.endsWith(".json"))
      .sort((left, right) => (right.name ?? "").localeCompare(left.name ?? ""));

    for (const entry of snapshotEntries.slice(MAX_STORED_SNAPSHOTS)) {
      if (!entry.name) {
        continue;
      }

      await removeFile(`${SNAPSHOT_DIRECTORY}/${entry.name}`, {
        dir: BaseDirectory.AppLocalData,
      });
    }
  },
};
