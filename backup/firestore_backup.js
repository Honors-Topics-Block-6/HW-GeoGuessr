#!/usr/bin/env node
/**
 * firestore_backup.js — Export the entire Firestore database to a local JSON file.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json node firestore_backup.js [output_dir]
 *
 * The script recursively walks every top-level collection and all nested
 * subcollections, serialising every document (including Timestamps, GeoPoints,
 * and DocumentReferences) into a single JSON file.
 *
 * Output: <output_dir>/backup_<ISO-timestamp>.json
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// ── Initialise Firebase Admin ───────────────────────────────────────────────
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

// ── Serialisation helpers ───────────────────────────────────────────────────

/**
 * Convert Firestore-specific types into plain JSON-safe objects so they
 * survive a round-trip through JSON.stringify / JSON.parse.
 */
function serialiseValue(value) {
  if (value === null || value === undefined) return value;

  // Timestamp → { __type__: "Timestamp", seconds, nanoseconds }
  if (value instanceof admin.firestore.Timestamp) {
    return {
      __type__: "Timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }

  // GeoPoint → { __type__: "GeoPoint", latitude, longitude }
  if (value instanceof admin.firestore.GeoPoint) {
    return {
      __type__: "GeoPoint",
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  // DocumentReference → { __type__: "DocumentReference", path }
  if (value instanceof admin.firestore.DocumentReference) {
    return { __type__: "DocumentReference", path: value.path };
  }

  // Arrays
  if (Array.isArray(value)) {
    return value.map(serialiseValue);
  }

  // Plain objects (maps)
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serialiseValue(v);
    }
    return out;
  }

  // Primitives (string, number, boolean)
  return value;
}

// ── Recursive collection walker ─────────────────────────────────────────────

/**
 * Recursively export a Firestore collection (and its subcollections) into a
 * plain JS object keyed by document ID.
 *
 * Returns: { docId: { __data__: { … }, __subcollections__: { collName: { … } } } }
 */
async function exportCollection(collectionRef) {
  const snapshot = await collectionRef.get();
  const result = {};
  let docCount = 0;

  for (const doc of snapshot.docs) {
    const entry = {
      __data__: serialiseValue(doc.data()),
      __subcollections__: {},
    };

    // Discover subcollections on this document
    const subcollections = await doc.ref.listCollections();
    for (const subCol of subcollections) {
      entry.__subcollections__[subCol.id] = await exportCollection(subCol);
    }

    // Drop the __subcollections__ key when empty to keep the file tidy
    if (Object.keys(entry.__subcollections__).length === 0) {
      delete entry.__subcollections__;
    }

    result[doc.id] = entry;
    docCount++;
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const outputDir = process.argv[2] || path.join(__dirname, "snapshots");

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("Discovering top-level collections …");
  const collections = await db.listCollections();
  const collectionNames = collections.map((c) => c.id);
  console.log(`Found ${collectionNames.length} collections: ${collectionNames.join(", ")}`);

  const backup = {};
  let totalDocs = 0;

  for (const col of collections) {
    process.stdout.write(`  Exporting "${col.id}" … `);
    backup[col.id] = await exportCollection(col);
    const count = Object.keys(backup[col.id]).length;
    totalDocs += count;
    console.log(`${count} documents`);
  }

  // Write file
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup_${timestamp}.json`;
  const filepath = path.join(outputDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), "utf-8");

  console.log("");
  console.log(`Backup complete!`);
  console.log(`  Total top-level documents: ${totalDocs}`);
  console.log(`  File: ${filepath}`);
  console.log(`  Size: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Backup failed:", err);
  process.exit(1);
});
