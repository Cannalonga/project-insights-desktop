import { describe, expect, it } from "vitest";

import { mapRawProjectToModel } from "./map-project";
import { validateProject } from "../validation/validate-project";

describe("mapRawProjectToModel", () => {
  it("reconstructs parentId from outlineNumber hierarchy", () => {
    const project = mapRawProjectToModel({
      name: "Projeto Hierarquico",
      tasks: [
        { id: "1", name: "Disciplina", outlineLevel: 1, outlineNumber: "1", summary: true },
        { id: "2", name: "Pacote", outlineLevel: 2, outlineNumber: "1.2", summary: true },
        { id: "3", name: "Atividade", outlineLevel: 3, outlineNumber: "1.2.1", summary: false },
      ],
    });

    expect(project.tasks.find((task) => task.id === "2")?.parentId).toBe("1");
    expect(project.tasks.find((task) => task.id === "3")?.parentId).toBe("2");
  });

  it("keeps root tasks without parentId", () => {
    const project = mapRawProjectToModel({
      tasks: [
        { id: "1", name: "Civil", outlineLevel: 1, outlineNumber: "1", summary: true, parentId: "999" },
        { id: "2", name: "Escopo", outlineLevel: 2, outlineNumber: "1.1", summary: false },
      ],
    });

    expect(project.tasks.find((task) => task.id === "1")?.parentId).toBeUndefined();
  });

  it("eliminates missing parent warnings in valid outline hierarchies", () => {
    const project = mapRawProjectToModel({
      tasks: [
        {
          id: "1",
          name: "Civil",
          startDate: "2026-01-01T08:00:00",
          endDate: "2026-01-05T17:00:00",
          duration: 40,
          outlineLevel: 1,
          outlineNumber: "1",
          summary: true,
        },
        {
          id: "2",
          name: "Fundacao",
          startDate: "2026-01-01T08:00:00",
          endDate: "2026-01-03T17:00:00",
          duration: 16,
          outlineLevel: 2,
          outlineNumber: "1.2",
          summary: false,
        },
        {
          id: "3",
          name: "Forma",
          startDate: "2026-01-03T08:00:00",
          endDate: "2026-01-05T17:00:00",
          duration: 16,
          outlineLevel: 3,
          outlineNumber: "1.2.1",
          summary: false,
        },
      ],
      resources: [],
      dependencies: [],
    });

    const validation = validateProject(project);

    expect(validation.issues.filter((issue) => issue.id === "task-missing-parent")).toEqual([]);
  });
});
