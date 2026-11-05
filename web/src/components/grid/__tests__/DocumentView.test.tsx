import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentView, DocumentViewSkeleton } from "../DocumentView";
import { detectBsonType, formatBsonValue } from "../bson/bsonTypes";
import type { TableSchema } from "@/lib/types";

describe("BSON Type Detection and Formatting", () => {
  it("detects and formats ObjectId correctly", () => {
    const hex = "65f1a2b3c4d5e6f7a8b9c0d1";
    expect(detectBsonType(hex, "_id")).toBe("ObjectId");
    expect(detectBsonType({ $oid: hex })).toBe("ObjectId");

    const fmt = formatBsonValue(hex, "ObjectId");
    expect(fmt.display).toBe(`ObjectId('${hex}')`);
    expect(fmt.fullString).toBe(hex);
  });

  it("detects and formats primitive and complex numbers", () => {
    expect(detectBsonType(42)).toBe("Int32");
    expect(detectBsonType(3.1415)).toBe("Double");
    expect(detectBsonType(9007199254740991 + 1000)).toBe("Int64");
    expect(detectBsonType({ $numberLong: "123456789" })).toBe("Int64");
    expect(detectBsonType({ $numberDecimal: "99.99" })).toBe("Decimal128");

    expect(formatBsonValue(42, "Int32").display).toBe("42");
    expect(formatBsonValue({ $numberLong: "123456789" }, "Int64").display).toBe(
      "NumberLong(123456789)",
    );
    expect(
      formatBsonValue({ $numberDecimal: "99.99" }, "Decimal128").display,
    ).toBe('NumberDecimal("99.99")');
  });

  it("detects and formats dates and booleans", () => {
    expect(detectBsonType("2026-11-05T09:30:00Z")).toBe("Date");
    expect(detectBsonType(true)).toBe("Boolean");
    expect(detectBsonType(false)).toBe("Boolean");

    expect(formatBsonValue(true, "Boolean").display).toBe("true");
    expect(
      formatBsonValue("2026-11-05T09:30:00.000Z", "Date").display,
    ).toContain("2026-11-05 09:30:00");
  });

  it("detects arrays and nested documents", () => {
    expect(detectBsonType(["admin", "dev"])).toBe("Array");
    expect(detectBsonType({ city: "Hanoi", zip: 100000 })).toBe("Object");
    expect(detectBsonType(null)).toBe("Null");

    expect(formatBsonValue(["a", "b"], "Array").display).toBe("Array [2]");
    expect(
      formatBsonValue({ city: "Hanoi", zip: 100000 }, "Object").display,
    ).toBe("Object {2 fields}");
  });
});

describe("DocumentView Component", () => {
  const mockTable: TableSchema = {
    name: "users",
    relations: [],
    columns: [
      {
        name: "_id",
        type: "string",
        nullable: false,
        is_primary_key: true,
        is_foreign_key: false,
      },
      {
        name: "username",
        type: "string",
        nullable: false,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "is_active",
        type: "bool",
        nullable: false,
        is_primary_key: false,
        is_foreign_key: false,
      },
      {
        name: "profile",
        type: "json",
        nullable: true,
        is_primary_key: false,
        is_foreign_key: false,
      },
    ],
  };

  const mockRows = [
    {
      _id: "65f1a2b3c4d5e6f7a8b9c0d1",
      username: "quangpang",
      is_active: true,
      profile: {
        city: "Da Nang",
        roles: ["admin", "developer"],
      },
    },
  ];

  it("renders tri-mode view switcher and tree nodes with BSON badges", () => {
    const onCloneRow = vi.fn();
    const onEditRow = vi.fn();
    const onDeleteRow = vi.fn();

    render(
      <DocumentView
        rows={mockRows}
        table={mockTable}
        extraColumns={[]}
        page={0}
        pageSize={10}
        isReadOnly={false}
        onCloneRow={onCloneRow}
        onEditRow={onEditRow}
        onDeleteRow={onDeleteRow}
        t={(k, opts) => opts?.defaultValue ?? k}
      />,
    );

    // Verify Tri-Mode Switcher
    expect(screen.getByText("Tree")).toBeInTheDocument();
    expect(screen.getByText("JSON")).toBeInTheDocument();
    expect(screen.getByText("Table")).toBeInTheDocument();

    // Verify Primary Key & BSON Badge
    const pkElements = screen.getAllByText(
      "ObjectId('65f1a2b3c4d5e6f7a8b9c0d1')",
    );
    expect(pkElements.length).toBeGreaterThan(0);
    const badges = screen.getAllByText("ObjectId");
    expect(badges.length).toBeGreaterThan(0);

    // Verify nested tree rendering
    expect(screen.getByText("username")).toBeInTheDocument();
    expect(screen.getByText('"quangpang"')).toBeInTheDocument();
    expect(screen.getByText('"Da Nang"')).toBeInTheDocument();

    // Test switching to Table view
    fireEvent.click(screen.getByText("Table"));
    expect(screen.getByText("profile.city")).toBeInTheDocument();

    // Test switching to JSON view
    fireEvent.click(screen.getByText("JSON"));
    expect(screen.getByText('"quangpang"')).toBeInTheDocument();
  });

  it("triggers clone callback on clone button click", () => {
    const onCloneRow = vi.fn();

    render(
      <DocumentView
        rows={mockRows}
        table={mockTable}
        extraColumns={[]}
        page={0}
        pageSize={10}
        isReadOnly={false}
        onCloneRow={onCloneRow}
        onEditRow={vi.fn()}
        onDeleteRow={vi.fn()}
        t={(k, opts) => opts?.defaultValue ?? k}
      />,
    );

    const cloneBtn = screen.getByTitle("Clone Document (Generate New _id)");
    fireEvent.click(cloneBtn);
    expect(onCloneRow).toHaveBeenCalledTimes(1);
    expect(onCloneRow).toHaveBeenCalledWith(mockRows[0]);
  });

  it("skips rendering heavy document cards when isTabActive is false", () => {
    const { container } = render(
      <DocumentView
        rows={mockRows}
        table={mockTable}
        extraColumns={[]}
        page={0}
        pageSize={10}
        isReadOnly={false}
        isTabActive={false}
        onCloneRow={vi.fn()}
        onEditRow={vi.fn()}
        onDeleteRow={vi.fn()}
        t={(k, opts) => opts?.defaultValue ?? k}
      />,
    );

    // Tree/document cards must not be mounted when tab is inactive
    expect(screen.queryByText("Tree")).not.toBeInTheDocument();
    expect(screen.queryByText("username")).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("renders DocumentViewSkeleton when isLoading is true", () => {
    render(
      <DocumentView
        rows={mockRows}
        table={mockTable}
        extraColumns={[]}
        page={0}
        pageSize={10}
        isReadOnly={false}
        isLoading={true}
        onCloneRow={vi.fn()}
        onEditRow={vi.fn()}
        onDeleteRow={vi.fn()}
        t={(k, opts) => opts?.defaultValue ?? k}
      />,
    );

    expect(screen.getByTestId("document-view-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("john_doe")).not.toBeInTheDocument();
  });

  it("renders DocumentViewSkeleton independently", () => {
    render(<DocumentViewSkeleton className="custom-skeleton-class" />);
    const skeleton = screen.getByTestId("document-view-skeleton");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass("custom-skeleton-class");
  });
});
