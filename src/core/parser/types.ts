export interface RawTask {
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  percentComplete?: number;
  physicalPercentComplete?: number;
  actualStartDate?: string;
  actualEndDate?: string;
  actualDurationHours?: number;
  actualWorkHours?: number;
  remainingWorkHours?: number;
  baselineStartDate?: string;
  baselineEndDate?: string;
  baselineDurationHours?: number;
  resumeDate?: string;
  stopDate?: string;
  duration?: number;
  outlineLevel?: number;
  outlineNumber?: string;
  summary?: boolean;
  parentId?: string;
  resourceIds?: string[];
}

export interface RawResource {
  id?: string;
  name?: string;
  type?: string;
}

export interface RawDependency {
  id?: string;
  fromTaskId?: string;
  toTaskId?: string;
  type?: string;
}

export interface RawProject {
  id?: string;
  name?: string;
  statusDate?: string;
  currentDate?: string;
  tasks?: RawTask[];
  resources?: RawResource[];
  dependencies?: RawDependency[];
  sourceFilePath?: string;
}
