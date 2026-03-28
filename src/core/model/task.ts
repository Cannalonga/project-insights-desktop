export interface Task {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  percentComplete: number;
  physicalPercentComplete: number;
  actualStartDate: string;
  actualEndDate: string;
  actualDurationHours: number;
  actualWorkHours: number;
  remainingWorkHours: number;
  baselineStartDate: string;
  baselineEndDate: string;
  baselineDurationHours: number;
  resumeDate: string;
  stopDate: string;
  duration: number;
  outlineLevel: number;
  outlineNumber: string;
  isSummary: boolean;
  parentId?: string;
  resourceIds: string[];
}
