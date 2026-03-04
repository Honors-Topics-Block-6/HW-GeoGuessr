#!/usr/bin/env node
/**
 * firestore_restore.js — Restore a Firestore backup JSON file to the database.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json node firestore_restore.js <backup_file>
 *
 * WARNING: This performs a MERGE write for every document in the backup.
 *          Documents that exist in the database but NOT in the backup file
 *          are left untouched (no data is deleted).
 *
 * Supports the custom type wrappers produced by firestore_backup.js:
 *   Timestamp, GeoPoint, DocumentReference.
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// ── Initialise Firebase Admin ───────────────────────────────────────────────
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

// ── Deserialisation helpers ─────────────────────────────────────────────────

/**
 * Rehydrate the JSON-safe wrappers back into native Firestore types.
 */
function deserialiseValue(value) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map(deserialiseValue);
  }

  if (typeof value === "object") {
    // Timestamp
    if (value.__type__ === "Timestamp") {
      return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
    }
    // GeoPoint
    if (value.__type__ === "GeoPoint") {
      return new admin.firestore.GeoPoint(value.latitude, value.longitude);
    }
    // DocumentReference
    if (value.__type__ === "DocumentReference") {
      return db.doc(value.path);
    }

    // Plain object — recurse
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deserialiseValue(v);
    }
    return out;
  }

  return value;
}

// ── Recursive importer ──────────────────────────────────────────────────────

/**
 * Restore a collection from a backup object.  Uses batched writes (max 500
 * operations per batch) for efficiency.
 */
async function restoreCollection(collectionPath, collectionData) {
  const entries = Object.entries(collectionData);
  let written = 0;

  // Firestore batches support a maximum of 500 operations each
  const BATCH_LIMIT = 500;
  let batch = db.batch();
  let opsInBatch = 0;

  for (const [docId, docEntry] of entries) {
    const docRef = db.collection(collectionPath).doc(docId);
    const data = deserialiseValue(docEntry.__data__ || docEntry);

    batch.set(docRef, data, { merge: true });
    opsInBatch++;
    written++;

    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }

    // Recursively restore subcollections
    if (docEntry.__subcollections__) {
      for (const [subColName, subColData] of Object.entries(docEntry.__subcollections__)) {
        const subColPath = `${collectionPath}/${docId}/${subColName}`;
        await restoreCollection(subColPath, subColData);
      }
    }
  }

  // Commit any remaining operations
  if (opsInBatch > 0) {
    await batch.commit();
  }

  return written;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const backupFile = process.argv[2];

  if (!backupFile) {
    console.error("Usage: node firestore_restore.js <backup_file>");
    console.error("");
    console.error("  backup_file   Path to a JSON backup produced by firestore_backup.js");
    process.exit(1);
  }

  const resolvedPath = path.resolve(backupFile);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Reading backup from: ${resolvedPath}`);
  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const backup = JSON.parse(raw);

  const collectionNames = Object.keys(backup);
  console.log(`Found ${collectionNames.length} collections: ${collectionNames.join(", ")}`);
  console.log("");

  let totalDocs = 0;

  for (const collectionName of collectionNames) {
    process.stdout.write(`  Restoring "${collectionName}" … `);
    const count = await restoreCollection(collectionName, backup[collectionName]);
    totalDocs += count;
    console.log(`${count} documents`);
  }

  console.log("");
  console.log(`Restore complete!`);
  console.log(`  Total documents written: ${totalDocs}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Restore failed:", err);
  process.exit(1);
});
