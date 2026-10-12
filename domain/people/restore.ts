import { UserFacingError } from "@/lib/actions/user-facing-error";

export class PersonRestoreForbiddenError extends UserFacingError {}
export class PersonNotRestorableError extends UserFacingError {}
