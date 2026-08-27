/**
 * In-memory presence tracking for a single server instance.
 *
 * Keyed by workspace -> userId -> entry. Each entry holds the set of sockets
 * that represent the user inside that workspace, so a user with multiple tabs
 * stays "online" until the last socket disconnects.
 *
 * For multi-instance horizontal scaling this map would be replaced (or backed)
 * by a Redis pub/sub presence store — see the case study in /docs.
 */

export type PresenceStatus = "ONLINE" | "EDITING" | "VIEWING" | "IDLE";

export interface PresenceUser {
  userId: string;
  name: string;
  status: PresenceStatus;
  lastActive: number;
}

interface PresenceEntry extends PresenceUser {
  socketIds: Set<string>;
}

type WorkspacePresence = Map<string, PresenceEntry>;

export class PresenceStore {
  private workspaces = new Map<string, WorkspacePresence>();
  /** socketId -> Map<workspaceId, userId> for O(1) disconnect cleanup. */
  private socketWorkspaces = new Map<string, Map<string, string>>();

  join(
    workspaceId: string,
    userId: string,
    name: string,
    socketId: string,
  ): PresenceUser {
    let presence = this.workspaces.get(workspaceId);
    if (!presence) {
      presence = new Map();
      this.workspaces.set(workspaceId, presence);
    }

    let entry = presence.get(userId);
    if (!entry) {
      entry = {
        userId,
        name,
        status: "ONLINE",
        lastActive: Date.now(),
        socketIds: new Set(),
      };
      presence.set(userId, entry);
    }
    entry.socketIds.add(socketId);
    entry.lastActive = Date.now();

    let workspaces = this.socketWorkspaces.get(socketId);
    if (!workspaces) {
      workspaces = new Map();
      this.socketWorkspaces.set(socketId, workspaces);
    }
    workspaces.set(workspaceId, userId);

    return this.toPublic(entry);
  }

  /**
   * Removes one socket from a workspace. Returns the user entry if the user is
   * now fully gone from the workspace (no other sockets), otherwise null.
   */
  leave(workspaceId: string, userId: string, socketId: string): PresenceUser | null {
    const presence = this.workspaces.get(workspaceId);
    const entry = presence?.get(userId);
    if (!entry) return null;

    entry.socketIds.delete(socketId);
    this.socketWorkspaces.get(socketId)?.delete(workspaceId);

    if (entry.socketIds.size === 0) {
      presence?.delete(userId);
      if (presence && presence.size === 0) {
        this.workspaces.delete(workspaceId);
      }
      return this.toPublic(entry);
    }
    return null;
  }

  setStatus(workspaceId: string, userId: string, status: PresenceStatus): void {
    const entry = this.workspaces.get(workspaceId)?.get(userId);
    if (!entry) return;
    entry.status = status;
    entry.lastActive = Date.now();
  }

  list(workspaceId: string): PresenceUser[] {
    const presence = this.workspaces.get(workspaceId);
    if (!presence) return [];
    return [...presence.values()].map((e) => this.toPublic(e));
  }

  /** Removes a socket from every workspace it joined. */
  removeSocket(socketId: string): Array<{ workspaceId: string; user: PresenceUser }> {
    const affected: Array<{ workspaceId: string; user: PresenceUser }> = [];
    const workspaces = this.socketWorkspaces.get(socketId);
    if (!workspaces) return affected;

    for (const [workspaceId, userId] of workspaces) {
      const user = this.leave(workspaceId, userId, socketId);
      if (user) affected.push({ workspaceId, user });
    }
    this.socketWorkspaces.delete(socketId);
    return affected;
  }

  private toPublic(entry: PresenceEntry): PresenceUser {
    return {
      userId: entry.userId,
      name: entry.name,
      status: entry.status,
      lastActive: entry.lastActive,
    };
  }
}

export const presenceStore = new PresenceStore();
