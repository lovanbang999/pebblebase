// Seed script for Pebblebase MongoDB integration tests
const dbName = 'pebble_test';
const testDB = db.getSiblingDB(dbName);

// Clean up existing collections
testDB.users.drop();
testDB.products.drop();
testDB.orders.drop();

// 1. Users collection
testDB.users.insertMany([
  {
    name: 'Alice',
    email: 'alice@example.com',
    age: 28,
    is_active: true,
    profile: { bio: 'Gopher and DB enthusiast', city: 'Hanoi' },
    created_at: new Date('2026-01-01T10:00:00Z')
  },
  {
    name: 'Bob',
    email: 'bob@example.com',
    age: 34,
    is_active: true,
    profile: { bio: 'Frontend wizard', city: 'Da Nang' },
    created_at: new Date('2026-01-02T11:00:00Z')
  },
  {
    name: 'Carol',
    email: 'carol@example.com',
    age: 25,
    is_active: false,
    profile: { bio: 'Fullstack explorer', city: 'Saigon' },
    created_at: new Date('2026-01-03T12:00:00Z')
  },
  {
    name: 'Dave',
    email: 'dave@example.com',
    age: 41,
    is_active: true,
    created_at: new Date('2026-01-04T13:00:00Z')
  },
  {
    name: 'Eve',
    email: 'eve@example.com',
    age: 22,
    is_active: true,
    created_at: new Date('2026-01-05T14:00:00Z')
  }
]);

// 2. Products collection (intentional schema variations per document)
testDB.products.insertMany([
  {
    name: 'Laptop Pro',
    price: 1299.99,
    in_stock: true,
    tags: ['electronics', 'work', 'portable']
  },
  {
    name: 'Office Chair',
    price: 249.00,
    color: 'charcoal gray',
    warranty_months: 24
  },
  {
    name: 'USB-C Cable',
    price: 9.99,
    in_stock: true,
    specs: { length_meters: 2, braided: true }
  },
  {
    name: 'Mechanical Keyboard',
    price: 119.00,
    switch_type: 'Cherry MX Red',
    backlit: true,
    tags: ['peripherals', 'gaming']
  }
]);

// 3. Orders collection
testDB.orders.insertMany([
  {
    order_number: 'ORD-1001',
    user_email: 'alice@example.com',
    items: [
      { item: 'Laptop Pro', qty: 1, unit_price: 1299.99 },
      { item: 'USB-C Cable', qty: 2, unit_price: 9.99 }
    ],
    total: 1319.97,
    status: 'completed',
    ordered_at: new Date('2026-02-01T09:30:00Z')
  },
  {
    order_number: 'ORD-1002',
    user_email: 'bob@example.com',
    items: [
      { item: 'Mechanical Keyboard', qty: 1, unit_price: 119.00 }
    ],
    total: 119.00,
    status: 'pending',
    ordered_at: new Date('2026-02-02T15:45:00Z')
  }
]);
