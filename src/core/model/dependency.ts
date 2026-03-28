export interface Dependency {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  type: string;
}
