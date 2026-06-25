let databaseReady = false;

export function isDatabaseReady(): boolean {
  return databaseReady;
}

export function setDatabaseReady(ready: boolean): void {
  databaseReady = ready;
}
