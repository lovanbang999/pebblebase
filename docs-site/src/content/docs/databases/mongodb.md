---
title: MongoDB
description: Document inspection, BSON conversion, and collection management for MongoDB.
---

Pebblebase Studio connects to MongoDB instances and clusters (including MongoDB Atlas).

---

## Connection Format

Provide a standard MongoDB URI:
```text
mongodb://localhost:27017/my_database
```
Or for MongoDB Atlas:
```text
mongodb+srv://user:password@cluster0.example.mongodb.net/my_database?retryWrites=true&w=majority
```

---

## Document Viewer

- Inspect collections with pagination.
- View document fields in formatted JSON.
- Edit and update documents with schema verification.
