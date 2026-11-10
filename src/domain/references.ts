import { isOnGrid } from "./time.ts";
import type { ScheduleDay, SchoolConfig } from "./types.ts";

/**
 * Structural integrity checks that a schema cannot express: unique IDs, references,
 * track/off-track consistency and grid alignment. Scheduling conflicts are NOT checked
 * here; they are data and belong to the engine (invariant 3).
 */

export interface IntegrityIssue {
  /** Dotted path such as `config.vehicles[2].categoryId` or `days[0].sessions[1].layoutId`. */
  readonly path: string;
  readonly message: string;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup].sort();
}

function uniqueIds(
  issues: IntegrityIssue[],
  basePath: string,
  items: readonly { readonly id: string }[],
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      issues.push({ path: `${basePath}[${index}].id`, message: `duplicate id "${item.id}"` });
    }
    seen.add(item.id);
  });
}

export function checkConfigReferences(config: SchoolConfig): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const sectionIds = new Set(config.circuit.sections.map((s) => s.id));
  const categoryIds = new Set(config.categories.map((c) => c.id));

  uniqueIds(issues, "config.circuit.sections", config.circuit.sections);
  uniqueIds(issues, "config.circuit.layouts", config.circuit.layouts);
  uniqueIds(issues, "config.categories", config.categories);
  uniqueIds(issues, "config.vehicles", config.vehicles);
  uniqueIds(issues, "config.activityTypes", config.activityTypes);
  uniqueIds(issues, "config.pitBoxes", config.pitBoxes);

  config.circuit.layouts.forEach((layout, i) => {
    layout.sectionIds.forEach((id, j) => {
      if (!sectionIds.has(id)) {
        issues.push({
          path: `config.circuit.layouts[${i}].sectionIds[${j}]`,
          message: `unknown section "${id}"`,
        });
      }
    });
    for (const dup of duplicates(layout.sectionIds)) {
      issues.push({
        path: `config.circuit.layouts[${i}].sectionIds`,
        message: `duplicate section "${dup}"`,
      });
    }
    for (const categoryId of Object.keys(layout.capacity).sort()) {
      if (!categoryIds.has(categoryId)) {
        issues.push({
          path: `config.circuit.layouts[${i}].capacity.${categoryId}`,
          message: `unknown category "${categoryId}"`,
        });
      }
    }
  });

  config.vehicles.forEach((vehicle, i) => {
    if (!categoryIds.has(vehicle.categoryId)) {
      issues.push({
        path: `config.vehicles[${i}].categoryId`,
        message: `unknown category "${vehicle.categoryId}"`,
      });
    }
  });

  config.activityTypes.forEach((activity, i) => {
    activity.allowedCategoryIds.forEach((id, j) => {
      if (!categoryIds.has(id)) {
        issues.push({
          path: `config.activityTypes[${i}].allowedCategoryIds[${j}]`,
          message: `unknown category "${id}"`,
        });
      }
    });
  });

  return issues;
}

export function checkDayReferences(
  config: SchoolConfig,
  day: ScheduleDay,
  basePath = "day",
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const sectionIds = new Set(config.circuit.sections.map((s) => s.id));
  const layoutIds = new Set(config.circuit.layouts.map((l) => l.id));
  const vehicleIds = new Set(config.vehicles.map((v) => v.id));
  const pitBoxIds = new Set(config.pitBoxes.map((p) => p.id));
  const activities = new Map(config.activityTypes.map((a) => [a.id, a]));
  const grid = config.gridMinutes;

  uniqueIds(issues, `${basePath}.sessions`, day.sessions);
  uniqueIds(issues, `${basePath}.closures`, day.closures);
  uniqueIds(issues, `${basePath}.unavailabilities`, day.unavailabilities);

  const checkGrid = (path: string, start: number, end: number) => {
    if (!isOnGrid(start, grid) || !isOnGrid(end, grid)) {
      issues.push({ path, message: `times must be multiples of ${grid} minutes` });
    }
  };

  day.sessions.forEach((session, i) => {
    const path = `${basePath}.sessions[${i}]`;
    const activity = activities.get(session.activityTypeId);
    if (!activity) {
      issues.push({
        path: `${path}.activityTypeId`,
        message: `unknown activity type "${session.activityTypeId}"`,
      });
    } else if (activity.usesTrack && session.layoutId === null) {
      issues.push({ path: `${path}.layoutId`, message: "track activities require a layout" });
    } else if (!activity.usesTrack && session.layoutId !== null) {
      issues.push({
        path: `${path}.layoutId`,
        message: "off-track activities must not have a layout",
      });
    }
    if (session.layoutId !== null && !layoutIds.has(session.layoutId)) {
      issues.push({ path: `${path}.layoutId`, message: `unknown layout "${session.layoutId}"` });
    }
    session.vehicleIds.forEach((id, j) => {
      if (!vehicleIds.has(id)) {
        issues.push({ path: `${path}.vehicleIds[${j}]`, message: `unknown vehicle "${id}"` });
      }
    });
    for (const dup of duplicates(session.vehicleIds)) {
      issues.push({ path: `${path}.vehicleIds`, message: `duplicate vehicle "${dup}"` });
    }
    session.pitBoxIds.forEach((id, j) => {
      if (!pitBoxIds.has(id)) {
        issues.push({ path: `${path}.pitBoxIds[${j}]`, message: `unknown pit box "${id}"` });
      }
    });
    for (const dup of duplicates(session.pitBoxIds)) {
      issues.push({ path: `${path}.pitBoxIds`, message: `duplicate pit box "${dup}"` });
    }
    checkGrid(path, session.startMinute, session.endMinute);
  });

  day.closures.forEach((closure, i) => {
    const path = `${basePath}.closures[${i}]`;
    if (!sectionIds.has(closure.sectionId)) {
      issues.push({ path: `${path}.sectionId`, message: `unknown section "${closure.sectionId}"` });
    }
    checkGrid(path, closure.startMinute, closure.endMinute);
  });

  day.unavailabilities.forEach((window, i) => {
    const path = `${basePath}.unavailabilities[${i}]`;
    if (!vehicleIds.has(window.vehicleId)) {
      issues.push({ path: `${path}.vehicleId`, message: `unknown vehicle "${window.vehicleId}"` });
    }
    checkGrid(path, window.startMinute, window.endMinute);
  });

  return issues;
}

export function checkWorkspaceReferences(workspace: {
  readonly config: SchoolConfig;
  readonly days: readonly ScheduleDay[];
}): IntegrityIssue[] {
  const issues = checkConfigReferences(workspace.config);
  const seenDates = new Set<string>();
  workspace.days.forEach((day, i) => {
    if (seenDates.has(day.date)) {
      issues.push({ path: `days[${i}].date`, message: `duplicate day "${day.date}"` });
    }
    seenDates.add(day.date);
    issues.push(...checkDayReferences(workspace.config, day, `days[${i}]`));
  });
  return issues;
}
