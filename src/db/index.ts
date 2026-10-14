import type { StoreName } from '../types';

const DB_NAME = 'avicontrol-pro';
const DB_VERSION = 3;

export const STORES: StoreName[] = [
  'lotes', 'mortalidade', 'racao', 'pesagens', 'agua', 'saude',
  'lembretes', 'despesas', 'vendas', 'metas', 'pedidosLicenca',
];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error('Base de dados bloqueada. Feche outros separadores.')); };
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const req = fn(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(req.result);
    transaction.onerror = () => reject(transaction.error || req.error);
    transaction.onabort = () => reject(transaction.error || req.error);
    req.onerror = () => reject(req.error);
  }));
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

export async function getOne<T>(store: StoreName, id: string): Promise<T | undefined> {
  return tx<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>);
}

export async function put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  if (!value.id.trim()) throw new Error('Registo inválido');
  await tx(store, 'readwrite', (s) => s.put(value));
}

export async function remove(store: StoreName, id: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(id));
}

export interface BackupFile {
  format: 'avegestor-indexeddb-backup';
  version: 1;
  exportedAt: string;
  stores: Partial<Record<StoreName, unknown[]>>;
}

export async function createBackup(): Promise<BackupFile> {
  const stores: Partial<Record<StoreName, unknown[]>> = {};
  for (const store of STORES) stores[store] = await getAll(store);
  return { format: 'avegestor-indexeddb-backup', version: 1, exportedAt: new Date().toISOString(), stores };
}

export function parseBackup(input: unknown): BackupFile {
  if (!input || typeof input !== 'object') throw new Error('Ficheiro de backup inválido.');
  const candidate = input as Partial<BackupFile>;
  if (candidate.format !== 'avegestor-indexeddb-backup' || candidate.version !== 1 || !candidate.stores) {
    throw new Error('Formato de backup não reconhecido.');
  }
  for (const [store, records] of Object.entries(candidate.stores)) {
    if (!STORES.includes(store as StoreName) || !Array.isArray(records)) throw new Error('Backup contém dados inválidos.');
    if (records.some((record) => !record || typeof record !== 'object' || typeof (record as { id?: unknown }).id !== 'string')) {
      throw new Error('Backup contém registos inválidos.');
    }
  }
  return candidate as BackupFile;
}

export async function restoreBackup(backup: BackupFile): Promise<number> {
  let restored = 0;
  for (const store of STORES) {
    const records = backup.stores[store] || [];
    for (const record of records) {
      await put(store, record as { id: string });
      restored += 1;
    }
  }
  return restored;
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
