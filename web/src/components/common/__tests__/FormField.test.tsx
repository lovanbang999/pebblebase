import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormField } from "../FormField";
import { Input } from "@/components/ui/input";

describe("FormField Component", () => {
  it("auto-generates an id via useId and associates label with child input", () => {
    render(
      <FormField label="Username">
        <Input placeholder="Enter username" />
      </FormField>,
    );

    const input = screen.getByPlaceholderText("Enter username");
    const label = screen.getByText("Username");

    expect(input.id).toBeTruthy();
    expect(label).toHaveAttribute("for", input.id);
  });

  it("respects id override on FormField and injects it into child", () => {
    render(
      <FormField id="custom-field-id" label="Email Address">
        <Input placeholder="user@example.com" />
      </FormField>,
    );

    const input = screen.getByPlaceholderText("user@example.com");
    const label = screen.getByText("Email Address");

    expect(input.id).toBe("custom-field-id");
    expect(label).toHaveAttribute("for", "custom-field-id");
  });

  it("ensures child explicit id wins over FormField id and label points to it", () => {
    render(
      <FormField id="formfield-id" label="Explicit Child ID">
        <Input id="child-wins-id" placeholder="explicit" />
      </FormField>,
    );

    const input = screen.getByPlaceholderText("explicit");
    const label = screen.getByText("Explicit Child ID");

    expect(input.id).toBe("child-wins-id");
    expect(label).toHaveAttribute("for", "child-wins-id");
  });

  it("links description and error to child input via aria-describedby", () => {
    render(
      <FormField
        id="password-field"
        label="Password"
        description="Must be at least 8 characters"
        error="Password is too weak"
      >
        <Input type="password" />
      </FormField>,
    );

    const input = document.getElementById("password-field") as HTMLInputElement;
    const description = screen.getByText("Must be at least 8 characters");
    const errorAlert = screen.getByRole("alert");

    expect(description.id).toBe("password-field-description");
    expect(errorAlert.id).toBe("password-field-error");
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).not.toHaveAttribute("aria-live");
    expect(input).toHaveAttribute(
      "aria-describedby",
      "password-field-description password-field-error",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("merges, rather than overwrites, an existing aria-describedby on the child", () => {
    render(
      <FormField
        id="user-code"
        label="Security Code"
        description="6-digit code"
        error="Code expired"
      >
        <Input
          aria-describedby="tooltip-hint external-doc"
          placeholder="123456"
        />
      </FormField>,
    );

    const input = screen.getByPlaceholderText("123456");
    expect(input).toHaveAttribute(
      "aria-describedby",
      "tooltip-hint external-doc user-code-description user-code-error",
    );
  });

  it("marks child as required and displays asterisk when required or requiredMarker is true", () => {
    const { rerender } = render(
      <FormField id="req-field" label="Required Field" required>
        <Input />
      </FormField>,
    );

    let input = document.getElementById("req-field");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("*")).toBeInTheDocument();

    rerender(
      <FormField id="req-field" label="Required Field" requiredMarker>
        <Input />
      </FormField>,
    );

    input = document.getElementById("req-field");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("supports render-prop pattern to inject control props directly", () => {
    render(
      <FormField id="render-prop-id" label="Render Prop Input" error="Invalid">
        {(controlProps) => (
          <input
            {...controlProps}
            data-testid="custom-input"
            className="custom-class"
          />
        )}
      </FormField>,
    );

    const input = screen.getByTestId("custom-input");
    expect(input.id).toBe("render-prop-id");
    expect(input).toHaveAttribute("aria-describedby", "render-prop-id-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("adds description and error ids to aria-describedby ONLY when actually rendered", () => {
    const { rerender } = render(
      <FormField id="test-field" label="Field">
        <Input placeholder="control" />
      </FormField>,
    );

    let input = screen.getByPlaceholderText("control");
    expect(input).not.toHaveAttribute("aria-describedby");

    // Only description provided
    rerender(
      <FormField id="test-field" label="Field" description="Help message">
        <Input placeholder="control" />
      </FormField>,
    );
    input = screen.getByPlaceholderText("control");
    expect(input).toHaveAttribute("aria-describedby", "test-field-description");

    // Only error provided
    rerender(
      <FormField id="test-field" label="Field" error="Failed check">
        <Input placeholder="control" />
      </FormField>,
    );
    input = screen.getByPlaceholderText("control");
    expect(input).toHaveAttribute("aria-describedby", "test-field-error");

    // Neither rendered (falsy values)
    rerender(
      <FormField id="test-field" label="Field" description={null} error={null}>
        <Input placeholder="control" />
      </FormField>,
    );
    input = screen.getByPlaceholderText("control");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});
