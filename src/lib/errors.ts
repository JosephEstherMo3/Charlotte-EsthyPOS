/** An error that is safe to show to the end user, with an HTTP status. */
export class HttpError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(status: number, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}
