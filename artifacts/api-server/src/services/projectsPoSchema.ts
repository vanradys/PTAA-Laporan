import { db, sql } from "@workspace/db";

let projectsPoCustomerFieldsSchemaReady: Promise<void> | null = null;

export function ensureProjectsPoCustomerFieldsSchema() {
  projectsPoCustomerFieldsSchemaReady ??= db.execute(sql`
    alter table projects_po
      add column if not exists project_issue_action text
  `).then(() => undefined);

  return projectsPoCustomerFieldsSchemaReady.catch((error) => {
    projectsPoCustomerFieldsSchemaReady = null;
    throw error;
  });
}
