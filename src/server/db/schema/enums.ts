import { pgEnum } from "drizzle-orm/pg-core";

export const USER_ROLES = ["SYSTEM_ADMIN", "ELECTORAL_COMMITTEE", "VOTER"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRole = pgEnum("user_role", USER_ROLES);

export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const userStatus = pgEnum("user_status", USER_STATUSES);

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const approvalStatus = pgEnum("member_approval_status", APPROVAL_STATUSES);

export const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export const accountStatus = pgEnum("member_account_status", ACCOUNT_STATUSES);

export const CREDENTIAL_STATUSES = [
  "NOT_ISSUED",
  "QUEUED",
  "SENT",
  "DELIVERED",
  "FAILED",
  "ACTIVATED",
] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];
export const credentialStatus = pgEnum("credential_status", CREDENTIAL_STATUSES);

export const ELECTION_STATUSES = [
  "DRAFT",
  "REGISTRATION",
  "NOMINATION",
  "CANDIDATE_APPROVAL",
  "SCHEDULED",
  "OPEN",
  "CLOSED",
  "RESULTS_PUBLISHED",
  "ARCHIVED",
  "CANCELLED",
] as const;
export type ElectionStatus = (typeof ELECTION_STATUSES)[number];
export const electionStatus = pgEnum("election_status", ELECTION_STATUSES);

export const RESULTS_VISIBILITIES = ["ELIGIBLE_VOTERS", "ALL_MEMBERS", "PUBLIC"] as const;
export type ResultsVisibility = (typeof RESULTS_VISIBILITIES)[number];
export const resultsVisibility = pgEnum("results_visibility", RESULTS_VISIBILITIES);

export const CANDIDATE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "DEACTIVATED",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
export const candidateStatus = pgEnum("candidate_status", CANDIDATE_STATUSES);

export const IMPORT_STATUSES = ["PREVIEW", "COMMITTED", "DISCARDED"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];
export const importStatus = pgEnum("member_import_status", IMPORT_STATUSES);

export const EMAIL_STATUSES = [
  "QUEUED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "BOUNCED",
  "COMPLAINED",
  "FAILED",
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
export const emailStatus = pgEnum("email_status", EMAIL_STATUSES);
