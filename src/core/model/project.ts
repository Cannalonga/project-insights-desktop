import type { Dependency } from "./dependency";
import type { Resource } from "./resource";
import type { Task } from "./task";

export interface Project {
  id: string;
  name: string;
  statusDate?: string;
  currentDate?: string;
  tasks: Task[];
  resources: Resource[];
  dependencies: Dependency[];
}
