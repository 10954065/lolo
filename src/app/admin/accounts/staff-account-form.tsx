"use client";

import { TextField } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Label } from "@/components/ui/label";

/** Fields rendered inside the "Add staff account" ActionDialog. */
export function StaffAccountFields() {
  return (
    <div className="space-y-4">
      <TextField name="fullName" label="Full name" required />
      <TextField name="email" label="Email address" type="email" required />
      <div className="space-y-1.5">
        <Label htmlFor="role">Role</Label>
        <NativeSelect id="role" name="role" defaultValue="ELECTORAL_COMMITTEE" required>
          <option value="ELECTORAL_COMMITTEE">Electoral Committee (read-only observer)</option>
          <option value="SYSTEM_ADMIN">System Administrator (full control)</option>
        </NativeSelect>
      </div>
    </div>
  );
}

export function RoleSelect({ current }: { current: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="role">New role</Label>
      <NativeSelect
        id="role"
        name="role"
        defaultValue={current === "SYSTEM_ADMIN" ? "ELECTORAL_COMMITTEE" : "SYSTEM_ADMIN"}
      >
        <option value="ELECTORAL_COMMITTEE">Electoral Committee (read-only observer)</option>
        <option value="SYSTEM_ADMIN">System Administrator (full control)</option>
      </NativeSelect>
    </div>
  );
}
